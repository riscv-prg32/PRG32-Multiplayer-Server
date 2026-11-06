import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

// LAN discovery: a console that does not know the server's address asks the
// local network, and the server answers with its WebSocket URL.
//
//   console -> 255.255.255.255:DISCOVERY_PORT  {"type":"discover","protocol":"prg32-multiplayer-1.0"}
//   server  -> the asking address and port    {"type":"server","protocol":"prg32-multiplayer-1.0","url":"ws://192.168.1.10:8081"}
//
// The server also broadcasts the same `server` message on every IPv4 network
// every DISCOVERY_INTERVAL_MS, so a console that only listens finds it too.
// Datagrams are small JSON objects; anything else is ignored.

export const DISCOVERY_PROTOCOL = 'prg32-multiplayer-1.0';
const MAX_DATAGRAM = 512;

const toInt = (ip) =>
  ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
const toIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** The IPv4 networks of this host, without loopback: address, mask, broadcast. */
export function localNetworks(interfaces = networkInterfaces()) {
  const out = [];
  for (const list of Object.values(interfaces))
    for (const entry of list || []) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (entry.internal) continue;
      const address = toInt(entry.address);
      const mask = toInt(entry.netmask);
      out.push({
        address: entry.address,
        netmask: entry.netmask,
        broadcast: toIp((address | ~mask) >>> 0),
        contains: (ip) => ((toInt(ip) ^ address) & mask) === 0,
      });
    }
  return out;
}

/** The URL to give a console that asked from `from`: on its own network if possible. */
export function advertisedUrl(config, port, from, networks = localNetworks()) {
  if (config.discoveryUrl) return config.discoveryUrl;
  const net = (from && networks.find((n) => n.contains(from))) || networks[0];
  return net ? `ws://${net.address}:${port}` : null;
}

export function parseDiscovery(buffer) {
  if (buffer.length > MAX_DATAGRAM) return null;
  try {
    const message = JSON.parse(buffer.toString('utf8'));
    return message && typeof message === 'object' && !Array.isArray(message)
      ? message
      : null;
  } catch {
    return null;
  }
}

/**
 * Starts answering discovery queries, and beaconing, for a server listening on
 * `port`. Returns { socket, close, ready }, or null when DISCOVERY_PORT is 0.
 */
export function startDiscovery(config, port, logger = console, interfaces) {
  if (!config.discoveryPort) return null;
  const networks = () => localNetworks(interfaces?.());
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const reply = (url) =>
    Buffer.from(JSON.stringify({ type: 'server', protocol: DISCOVERY_PROTOCOL, url }));
  socket.on('message', (data, from) => {
    const message = parseDiscovery(data);
    if (message?.type !== 'discover' || message.protocol !== DISCOVERY_PROTOCOL) return;
    const url = advertisedUrl(config, port, from.address, networks());
    if (url) socket.send(reply(url), from.port, from.address);
  });
  socket.on('error', (error) => logger.warn?.('discovery:', error.message));
  let timer = null;
  const beacon = () => {
    for (const net of networks()) {
      const url = advertisedUrl(config, port, net.address, [net]);
      socket.send(reply(url), config.discoveryPort, net.broadcast, () => {});
    }
  };
  const ready = new Promise((resolve) =>
    socket.bind(config.discoveryPort, config.host, () => {
      socket.setBroadcast(true);
      if (config.discoveryIntervalMs > 0) {
        timer = setInterval(beacon, config.discoveryIntervalMs);
        timer.unref();
        beacon();
      }
      logger.log?.(
        `PRG32 multiplayer discovery on udp ${config.host}:${socket.address().port}`,
      );
      resolve(socket.address().port);
    }),
  );
  const close = () =>
    new Promise((resolve) => {
      if (timer) clearInterval(timer);
      try {
        socket.close(resolve);
      } catch {
        resolve();
      }
    });
  return { socket, ready, close };
}
