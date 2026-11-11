import { hostname } from 'node:os';
import { Bonjour } from 'bonjour-service';

// mDNS / DNS-SD advertising: the server announces itself as the service
// `_prg32mp._tcp` so a console on the local network finds it with a multicast
// query instead of a configured address.
//
//   PTR  _prg32mp._tcp.local            -> PRG32 Multiplayer._prg32mp._tcp.local
//   SRV  PRG32 Multiplayer._prg32mp...  -> <host>.local, port 8081
//   TXT  PRG32 Multiplayer._prg32mp...  -> scheme=ws, plus path=/mp when needed
//   A    <host>.local                   -> this host's IPv4 addresses
//
// The console builds `<scheme>://<A address>:<SRV port><path>`; `path`
// defaults to `/`. The TXT record always carries `scheme`, never zero bytes:
// ESP-IDF mdns (1.14.1) drops the rest of a packet at a zero-length record,
// so an empty TXT before the A record hid the server's address from consoles.

export const MDNS_SERVICE_TYPE = 'prg32mp';

/**
 * The SRV port and TXT keys for a server listening on `port`. With
 * DISCOVERY_URL set they come from that URL, as the UDP discovery answer does;
 * a DISCOVERY_URL that is not a ws:// or wss:// URL is ignored here.
 */
export function mdnsRecord(config, port) {
  let url = null;
  try {
    url = config.discoveryUrl ? new URL(config.discoveryUrl) : null;
  } catch {
    url = null;
  }
  const scheme = url?.protocol.replace(/:$/, '');
  if (scheme !== 'ws' && scheme !== 'wss') return { port, txt: { scheme: 'ws' } };
  const txt = { scheme };
  const path = url.pathname + url.search;
  if (path && path !== '/') txt.path = path;
  const urlPort = url.port ? Number(url.port) : scheme === 'wss' ? 443 : 80;
  return { port: urlPort, txt };
}

/** A `.local` host name for the SRV target, from the machine's host name. */
export function mdnsHost(name = hostname()) {
  const label = name.split('.')[0].replace(/[^A-Za-z0-9-]/g, '-') || 'prg32';
  return `${label}.local`;
}

/** The instance name to try after `name` is taken: "Name (2)", "Name (3)", ... */
export function nextMdnsName(name) {
  const match = /^(.*) \((\d+)\)$/.exec(name);
  const base = match ? match[1] : name;
  const n = match ? Number(match[2]) + 1 : 2;
  const suffix = ` (${n})`;
  return base.slice(0, 63 - suffix.length) + suffix;
}

const fqdnOf = (name) =>
  `${name.split('.').join('-')}._${MDNS_SERVICE_TYPE}._tcp.local`.toLowerCase();

/**
 * Probes (RFC 6762 section 8.1): asks three times, 250 ms apart, whether
 * another host answers for the instance name. Resolves true when one does.
 */
function nameInUse(mdns, name) {
  const fqdn = fqdnOf(name);
  return new Promise((resolve) => {
    let asked = 0;
    let timer;
    const done = (inUse) => {
      clearTimeout(timer);
      mdns.removeListener('response', onResponse);
      resolve(inUse);
    };
    const onResponse = (packet) => {
      const records = [...packet.answers, ...packet.additionals];
      if (records.some((r) => r.name?.toLowerCase() === fqdn && r.ttl > 0)) done(true);
    };
    const ask = () => {
      if (asked++ === 3) return done(false);
      mdns.query(fqdn, 'ANY');
      timer = setTimeout(ask, 250);
      timer.unref?.();
    };
    mdns.on('response', onResponse);
    ask();
  });
}

/**
 * Starts advertising `_prg32mp._tcp` for a server listening on `port`.
 * Returns { ready, close }, or null when MDNS is off; `ready` resolves to the
 * published service.
 *
 * When another host already uses the instance name, the server takes the next
 * free one ("PRG32 Multiplayer (2)"), as macOS does. bonjour-service's own
 * probe is not used: on a clash it sends goodbye records for the clashing
 * name, which makes browsers drop the other server too.
 */
export function startMdns(config, port, logger = console, options = {}) {
  if (!config.mdns) return null;
  const record = mdnsRecord(config, port);
  const bonjour = new Bonjour(options.mdns, (error) =>
    logger.warn?.('mdns:', error.message),
  );
  const mdns = bonjour.server.mdns;
  let closed = false;
  const ready = (async () => {
    let name = config.mdnsName;
    for (let tries = 0; tries < 20 && (await nameInUse(mdns, name)); tries++)
      name = nextMdnsName(name);
    if (closed) return null;
    const service = bonjour.publish({
      name,
      type: MDNS_SERVICE_TYPE,
      protocol: 'tcp',
      port: record.port,
      host: options.host || mdnsHost(),
      txt: record.txt,
      disableIPv6: true,
      probe: false,
    });
    service.on('error', (error) => logger.warn?.('mdns:', error.message));
    logger.log?.(
      `PRG32 multiplayer mDNS service "${name}" _${MDNS_SERVICE_TYPE}._tcp port ${record.port}`,
    );
    return service;
  })();
  const close = async () => {
    closed = true;
    await ready.catch(() => null);
    await new Promise((resolve) => {
      try {
        bonjour.unpublishAll(() => bonjour.destroy(() => resolve()));
      } catch {
        resolve();
      }
    });
  };
  return { ready, close };
}
