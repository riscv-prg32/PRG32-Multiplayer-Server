import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import {
  DISCOVERY_PROTOCOL,
  advertisedUrl,
  localNetworks,
  parseDiscovery,
  startDiscovery,
} from '../src/discovery.js';

const interfaces = () => ({
  lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
  en0: [
    {
      family: 'IPv4',
      address: '192.168.1.79',
      netmask: '255.255.255.0',
      internal: false,
    },
  ],
  en1: [
    { family: 'IPv4', address: '10.0.5.2', netmask: '255.255.0.0', internal: false },
  ],
  utun: [{ family: 'IPv6', address: 'fe80::1', netmask: 'ffff::', internal: false }],
});

test('lists the IPv4 networks with their broadcast addresses', () => {
  const nets = localNetworks(interfaces());
  assert.deepEqual(
    nets.map((n) => [n.address, n.broadcast]),
    [
      ['192.168.1.79', '192.168.1.255'],
      ['10.0.5.2', '10.0.255.255'],
    ],
  );
});

test('advertises the address on the asking console network', () => {
  const nets = localNetworks(interfaces());
  const config = loadConfig({});
  assert.equal(
    advertisedUrl(config, 8081, '192.168.1.81', nets),
    'ws://192.168.1.79:8081',
  );
  assert.equal(advertisedUrl(config, 8081, '10.0.9.9', nets), 'ws://10.0.5.2:8081');
  assert.equal(
    advertisedUrl(config, 8081, '172.16.0.1', nets),
    'ws://192.168.1.79:8081',
  );
  const fixed = loadConfig({ DISCOVERY_URL: 'wss://mp.example.org' });
  assert.equal(
    advertisedUrl(fixed, 8081, '192.168.1.81', nets),
    'wss://mp.example.org',
  );
});

test('discovery is on by default, and off by default in production', () => {
  assert.equal(loadConfig({}).discoveryPort, 8082);
  assert.equal(
    loadConfig({
      NODE_ENV: 'production',
      DEVICE_ID_SECRET: '01234567890123456789012345678901',
      ADMIN_TOKEN: '01234567890123456789012345678901',
    }).discoveryPort,
    0,
  );
  assert.equal(loadConfig({ DISCOVERY_PORT: '0' }).discoveryPort, 0);
  assert.equal(startDiscovery(loadConfig({ DISCOVERY_PORT: '0' }), 8081), null);
});

test('ignores datagrams that are not discovery JSON', () => {
  assert.equal(parseDiscovery(Buffer.from('hello')), null);
  assert.equal(parseDiscovery(Buffer.from('[1,2]')), null);
  assert.equal(parseDiscovery(Buffer.alloc(600, 32)), null);
  assert.deepEqual(parseDiscovery(Buffer.from('{"type":"discover"}')), {
    type: 'discover',
  });
});

test('answers a discover query with the server URL', async (t) => {
  const config = loadConfig({
    HOST: '127.0.0.1',
    DISCOVERY_PORT: '0',
    DISCOVERY_INTERVAL_MS: '0',
    DISCOVERY_URL: 'ws://192.168.1.79:8081',
  });
  // Port 0 disables discovery in the configuration, so bind to a free port here.
  const discovery = startDiscovery(
    { ...config, discoveryPort: 47_000 + (process.pid % 1000) },
    8081,
    {},
  );
  const port = await discovery.ready;
  t.after(() => discovery.close());
  const client = dgram.createSocket('udp4');
  t.after(() => client.close());
  const answer = new Promise((resolve) =>
    client.on('message', (data) => resolve(JSON.parse(data))),
  );
  client.send(Buffer.from('{"type":"discover","protocol":"wrong"}'), port, '127.0.0.1');
  client.send(
    Buffer.from(JSON.stringify({ type: 'discover', protocol: DISCOVERY_PROTOCOL })),
    port,
    '127.0.0.1',
  );
  assert.deepEqual(await answer, {
    type: 'server',
    protocol: DISCOVERY_PROTOCOL,
    url: 'ws://192.168.1.79:8081',
  });
});
