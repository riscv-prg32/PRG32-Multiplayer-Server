import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
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
