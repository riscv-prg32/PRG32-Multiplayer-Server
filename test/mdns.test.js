import assert from 'node:assert/strict';
import test from 'node:test';
import { Bonjour } from 'bonjour-service';
import dnsPacket from 'dns-packet';
import multicastDns from 'multicast-dns';
import { loadConfig } from '../src/config.js';
import { MDNS_SERVICE_TYPE, mdnsHost, mdnsRecord, startMdns } from '../src/mdns.js';

const production = {
  NODE_ENV: 'production',
  DEVICE_ID_SECRET: '01234567890123456789012345678901',
  ADMIN_TOKEN: '01234567890123456789012345678901',
};

// The records an ESP-IDF mdns 1.14.1 console reads from a response: it walks
// them in order and gives up on the whole rest at a record with no data.
function recordsBeforeEmpty(buffer) {
  const counts = [6, 8, 10].reduce((n, at) => n + buffer.readUInt16BE(at), 0);
  let offset = 12;
  for (let q = buffer.readUInt16BE(4); q > 0; q--) {
    dnsPacket.name.decode(buffer, offset);
    offset += dnsPacket.name.decode.bytes + 4;
  }
  const records = [];
  for (let n = 0; n < counts; n++) {
    dnsPacket.name.decode(buffer, offset);
    const rdlength = buffer.readUInt16BE(offset + dnsPacket.name.decode.bytes + 8);
    if (rdlength === 0) break;
    records.push(dnsPacket.answer.decode(buffer, offset));
    offset += dnsPacket.answer.decode.bytes;
  }
  return records;
}

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
  assert.deepEqual(mdnsRecord(loadConfig({}), 8081), {
    port: 8081,
    txt: { scheme: 'ws' },
  });
  assert.deepEqual(
    mdnsRecord(loadConfig({ DISCOVERY_URL: 'ws://192.168.1.79:9000' }), 8081),
    { port: 9000, txt: { scheme: 'ws' } },
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
    txt: { scheme: 'ws' },
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

test(
  'the PTR answer carries the SRV target address',
  { timeout: 10_000 },
  async (t) => {
    // What an ESP-IDF console sees: one PTR query, one response. It stops reading
    // a response at a zero-length record, so every record must carry data.
    const mdns = { port: 47_000 + ((process.pid + 700) % 1000), loopback: true };
    const advertiser = startMdns(
      loadConfig({}),
      8081,
      {},
      {
        mdns,
        host: 'prg32-test.local',
      },
    );
    t.after(() => advertiser.close());
    const client = multicastDns(mdns);
    t.after(() => client.destroy());
    const ptr = `_${MDNS_SERVICE_TYPE}._tcp.local`;
    const response = await new Promise((resolve) => {
      client.on('response', (packet) => {
        if (packet.answers.some((a) => a.type === 'PTR' && a.name === ptr))
          resolve(packet);
      });
      const ask = () => client.query(ptr, 'PTR');
      client.on('ready', ask);
      const timer = setInterval(ask, 500);
      timer.unref();
      t.after(() => clearInterval(timer));
    });
    // The decoded packet re-encodes byte for byte as it came off the wire.
    const records = recordsBeforeEmpty(dnsPacket.encode(response));
    const srv = records.find((r) => r.type === 'SRV');
    assert.equal(srv?.data.target, 'prg32-test.local');
    assert.equal(srv.data.port, 8081);
    const a = records.filter((r) => r.type === 'A' && r.name === srv.data.target);
    assert.ok(a.length > 0, 'an A record for the SRV target');
    const txt = records.find((r) => r.type === 'TXT');
    assert.deepEqual(txt.data.map(String), ['scheme=ws']);
  },
);
