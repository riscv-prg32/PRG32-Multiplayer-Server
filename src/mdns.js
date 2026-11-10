import { hostname } from 'node:os';
import { Bonjour } from 'bonjour-service';

// mDNS / DNS-SD advertising: the server announces itself as the service
// `_prg32mp._tcp` so a console on the local network finds it with a multicast
// query instead of a configured address.
//
//   PTR  _prg32mp._tcp.local            -> PRG32 Multiplayer._prg32mp._tcp.local
//   SRV  PRG32 Multiplayer._prg32mp...  -> <host>.local, port 8081
//   TXT  PRG32 Multiplayer._prg32mp...  -> scheme=wss path=/mp (only when needed)
//   A    <host>.local                   -> this host's IPv4 addresses
//
// The console builds `<scheme>://<A address>:<SRV port><path>`; `scheme`
// defaults to `ws` and `path` to `/`, so a plain server sends an empty TXT.

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
  if (scheme !== 'ws' && scheme !== 'wss') return { port, txt: {} };
  const txt = {};
  if (scheme !== 'ws') txt.scheme = scheme;
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

/**
 * Starts advertising `_prg32mp._tcp` for a server listening on `port`.
 * Returns { service, close }, or null when MDNS is off.
 */
export function startMdns(config, port, logger = console, options = {}) {
  if (!config.mdns) return null;
  const record = mdnsRecord(config, port);
  const bonjour = new Bonjour(options.mdns, (error) =>
    logger.warn?.('mdns:', error.message),
  );
  const service = bonjour.publish({
    name: config.mdnsName,
    type: MDNS_SERVICE_TYPE,
    protocol: 'tcp',
    port: record.port,
    host: options.host || mdnsHost(),
    txt: record.txt,
    disableIPv6: true,
  });
  service.on('error', (error) => logger.warn?.('mdns:', error.message));
  logger.log?.(
    `PRG32 multiplayer mDNS service "${config.mdnsName}" _${MDNS_SERVICE_TYPE}._tcp port ${record.port}`,
  );
  const close = () =>
    new Promise((resolve) => {
      try {
        bonjour.unpublishAll(() => bonjour.destroy(() => resolve()));
      } catch {
        resolve();
      }
    });
  return { service, close };
}
