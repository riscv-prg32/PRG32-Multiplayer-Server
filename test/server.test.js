import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';

const next = (socket) =>
  new Promise((resolve) => socket.once('message', (data) => resolve(JSON.parse(data))));
const open = (url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });

test('relays state only inside a cartridge room and reports leave', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'prg32-test-'));
  const app = createServer(
    loadConfig({
      PORT: '8081',
      DEVICE_ID_SECRET: '01234567890123456789012345678901',
      DATA_DIR: dataDir,
    }),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const { port } = app.server.address();
  const a = await open(`ws://127.0.0.1:${port}`);
  const b = await open(`ws://127.0.0.1:${port}`);
  t.after(() => {
    a.close();
    b.close();
  });
  a.send(
    JSON.stringify({
      type: 'join',
      signature: 'game',
      player_id: 11,
      platform: 'esp32c6',
      device_id: 'aabbccddeeff',
    }),
  );
  b.send(
    JSON.stringify({
      type: 'join',
      signature: 'game',
      player_id: 12,
      platform: 'qemu',
      device_id: 'uuid-b',
    }),
  );
  const [welcomeA, welcomeB] = await Promise.all([next(a), next(b)]);
  assert.equal(welcomeA.player_id, 11);
  assert.equal(welcomeB.platform, 'qemu');
  const peerPromise = next(b);
  a.send(
    JSON.stringify({
      type: 'state',
      player_id: 999,
      x: 1,
      y: 2,
      sprite: 3,
      flags: 4,
      input: 5,
      frame: 6,
    }),
  );
  const peer = await peerPromise;
  assert.equal(peer.type, 'peer');
  assert.equal(peer.player_id, 11);
  assert.equal(peer.x, 1);
  const leavePromise = next(b);
  a.close();
  assert.deepEqual(await leavePromise, { type: 'leave', player_id: 11 });
});

test('serves health and readiness', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'prg32-test-'));
  const app = createServer(
    loadConfig({
      DEVICE_ID_SECRET: '01234567890123456789012345678901',
      DATA_DIR: dataDir,
    }),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const { port } = app.server.address();
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json(), {
    status: 'ok',
  });
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/readyz`)).json(), {
    status: 'ready',
    connections: 0,
    rooms: 0,
  });
  const publicStats = await (await fetch(`http://127.0.0.1:${port}/api/stats`)).json();
  assert.equal(publicStats.connections, 0);
  assert.equal(publicStats.rooms, 0);
  assert.match(publicStats.generated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('admin API authenticates, exports telemetry, and erases a device', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'prg32-test-'));
  const adminToken = '01234567890123456789012345678901';
  const app = createServer(
    loadConfig({
      DEVICE_ID_SECRET: adminToken,
      ADMIN_TOKEN: adminToken,
      DATA_DIR: dataDir,
    }),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const { port } = app.server.address();
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/admin/stats`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/events`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/devices`)).status, 401);

  const socket = await open(`ws://127.0.0.1:${port}`);
  t.after(() => socket.close());
  socket.send(
    JSON.stringify({
      type: 'join',
      signature: 'admin-test',
      platform: 'qemu',
      device_id: 'qemu-installation',
    }),
  );
  const welcome = await next(socket);
  const headers = { authorization: `Bearer ${adminToken}` };
  const devices = await (await fetch(`${base}/api/admin/devices`, { headers })).json();
  assert.equal(devices[0].device_id, welcome.device_id);
  assert.match(
    await (await fetch(`${base}/api/admin/export?format=csv`, { headers })).text(),
    /room_joined/,
  );
  const erased = await fetch(`${base}/api/admin/devices/${welcome.device_id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(erased.status, 200);
  assert.deepEqual(
    await (await fetch(`${base}/api/admin/devices`, { headers })).json(),
    [],
  );
});

test('three QEMU identities coexist and duplicate player IDs are reassigned', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'prg32-test-'));
  const app = createServer(
    loadConfig({
      DEVICE_ID_SECRET: '01234567890123456789012345678901',
      DATA_DIR: dataDir,
    }),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const { port } = app.server.address();
  const clients = await Promise.all(
    [1, 2, 3].map(() => open(`ws://127.0.0.1:${port}`)),
  );
  t.after(() => clients.forEach((client) => client.close()));
  clients.forEach((client, index) =>
    client.send(
      JSON.stringify({
        type: 'join',
        signature: 'poing-wall-v1',
        player_id: 77,
        platform: 'qemu',
        device_id: `qemu-${index}`,
      }),
    ),
  );
  const welcomes = await Promise.all(clients.map(next));
  assert.equal(new Set(welcomes.map((welcome) => welcome.player_id)).size, 3);
  assert.equal(new Set(welcomes.map((welcome) => welcome.device_id)).size, 3);
  assert.equal(app.relay.stats().rooms, 1);
});

const startServer = async (t, env = {}) => {
  const app = createServer(
    loadConfig({
      DEVICE_ID_SECRET: '01234567890123456789012345678901',
      DATA_DIR: mkdtempSync(join(tmpdir(), 'prg32-test-')),
      ...env,
    }),
    { warn() {}, error() {} },
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  return { app, port: app.server.address().port };
};
const rawRequest = (port, text) =>
  new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(text));
    let reply = '';
    socket.on('data', (chunk) => (reply += chunk));
    socket.on('end', () => resolve(reply.split('\r\n')[0]));
    socket.on('error', reject);
  });

test('an unparsable request target is rejected without crashing', async (t) => {
  const { port } = await startServer(t);
  assert.match(
    await rawRequest(
      port,
      'GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n',
    ),
    /^HTTP\/1\.1 400/,
  );
  const health = await fetch(`http://127.0.0.1:${port}/healthz?probe=1`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
});

test('admin event limit is clamped to a sane window', async (t) => {
  const adminToken = '01234567890123456789012345678901';
  const { app, port } = await startServer(t, { ADMIN_TOKEN: adminToken });
  for (let index = 0; index < 10; index += 1) app.telemetry.record('probe');
  const headers = { authorization: `Bearer ${adminToken}` };
  const count = async (limit) =>
    (
      await (
        await fetch(`http://127.0.0.1:${port}/api/admin/events?limit=${limit}`, {
          headers,
        })
      ).json()
    ).length;
  assert.equal(await count(3), 3);
  assert.equal(await count(2.9), 2);
  assert.equal(await count(-3), 10);
  assert.equal(await count('abc'), 10);
});

test('joining another room notifies the peers left behind', async (t) => {
  const { port } = await startServer(t);
  const a = await open(`ws://127.0.0.1:${port}`);
  const b = await open(`ws://127.0.0.1:${port}`);
  t.after(() => {
    a.close();
    b.close();
  });
  a.send(
    JSON.stringify({ type: 'join', signature: 'one', player_id: 5, device_id: 'a' }),
  );
  await next(a);
  b.send(JSON.stringify({ type: 'join', signature: 'one', device_id: 'b' }));
  await next(b);
  const leavePromise = next(b);
  a.send(
    JSON.stringify({ type: 'join', signature: 'two', player_id: 5, device_id: 'a' }),
  );
  assert.deepEqual(await leavePromise, { type: 'leave', player_id: 5 });
  assert.equal((await next(a)).type, 'welcome');
});

test('a failing telemetry write is reported to the client, not thrown', async (t) => {
  const { app, port } = await startServer(t);
  const socket = await open(`ws://127.0.0.1:${port}`);
  t.after(() => socket.close());
  app.telemetry.record = () => {
    throw new Error('disk full');
  };
  socket.send(JSON.stringify({ type: 'join', signature: 'game', device_id: 'x' }));
  assert.deepEqual(await next(socket), { type: 'error', code: 'internal_error' });
  socket.send(JSON.stringify({ type: 'ping' }));
  assert.equal((await next(socket)).type, 'pong');
});
