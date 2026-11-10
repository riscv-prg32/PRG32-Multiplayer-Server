import assert from 'node:assert/strict';
import test from 'node:test';
import { Bonjour } from 'bonjour-service';
import { loadConfig } from '../src/config.js';
import { MDNS_SERVICE_TYPE, mdnsHost, mdnsRecord, startMdns } from '../src/mdns.js';

const production = {
  NODE_ENV: 'production',
  DEVICE_ID_SECRET: '01234567890123456789012345678901',
  ADMIN_TOKEN: '01234567890123456789012345678901',
};

test('mDNS is on by default, and off by default in production', () => {
  assert.equal(loadConfig({}).mdns, true);
  assert.equal(loadConfig(production).mdns, false);
  assert.equal(loadConfig({ ...production, MDNS: 'on' }).mdns, true);
  assert.equal(loadConfig({ MDNS: 'off' }).mdns, false);
  assert.equal(loadConfig({ MDNS: '0' }).mdns, false);
  assert.throws(() => loadConfig({ MDNS: 'maybe' }), /MDNS must be on or off/);
  assert.equal(startMdns(loadConfig({ MDNS: 'off' }), 8081), null);
});

test('names the service and its host', () => {
  assert.equal(loadConfig({}).mdnsName, 'PRG32 Multiplayer');
  assert.equal(loadConfig({ MDNS_NAME: 'Lab 3' }).mdnsName, 'Lab 3');
  assert.equal(mdnsHost('Mac.homenet.example.it'), 'Mac.local');
  assert.equal(mdnsHost('lab_pc'), 'lab-pc.local');
});

test('takes the SRV port and TXT keys from the public URL', () => {
  assert.deepEqual(mdnsRecord(loadConfig({}), 8081), { port: 8081, txt: {} });
  assert.deepEqual(
    mdnsRecord(loadConfig({ DISCOVERY_URL: 'ws://192.168.1.79:9000' }), 8081),
    { port: 9000, txt: {} },
  );
  assert.deepEqual(
    mdnsRecord(loadConfig({ DISCOVERY_URL: 'wss://mp.example.org/mp' }), 8081),
    { port: 443, txt: { scheme: 'wss', path: '/mp' } },
  );
  assert.deepEqual(
    mdnsRecord(loadConfig({ DISCOVERY_URL: 'wss://mp.example.org:8443/' }), 8081),
    { port: 8443, txt: { scheme: 'wss' } },
  );
  assert.deepEqual(mdnsRecord(loadConfig({ DISCOVERY_URL: 'not a url' }), 8081), {
    port: 8081,
    txt: {},
  });
});

test('answers a DNS-SD browse for _prg32mp._tcp', { timeout: 10_000 }, async (t) => {
  // A private multicast port keeps the test away from real mDNS traffic on 5353.
  const mdns = { port: 47_000 + ((process.pid + 500) % 1000), loopback: true };
  const config = loadConfig({
    MDNS_NAME: 'PRG32 Test',
    DISCOVERY_URL: 'wss://mp.example.org/mp',
  });
  const advertiser = startMdns(config, 8081, {}, { mdns, host: 'prg32-test.local' });
  t.after(() => advertiser.close());
  const client = new Bonjour(mdns, () => {});
  t.after(() => client.destroy());
  const found = await new Promise((resolve) =>
    client.find({ type: MDNS_SERVICE_TYPE, protocol: 'tcp' }, resolve),
  );
  assert.equal(found.name, 'PRG32 Test');
  assert.equal(found.port, 443);
  assert.equal(found.host, 'prg32-test.local');
  assert.deepEqual(found.txt, { scheme: 'wss', path: '/mp' });
});
