import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { TelemetryStore } from '../src/telemetry.js';

function makeStore(t, overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prg32-telemetry-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return new TelemetryStore({
    dataDir,
    telemetryRetentionDays: 30,
    telemetryMaxEvents: 100,
    ...overrides,
  });
}

const fileLines = (store) =>
  fs.readFileSync(store.eventFile, 'utf8').split('\n').filter(Boolean).length;

test('recording at the limit does not rewrite the file for every event', (t) => {
  const store = makeStore(t);
  const originalRename = fs.renameSync;
  let rewrites = 0;
  fs.renameSync = (...args) => {
    rewrites += 1;
    return originalRename(...args);
  };
  t.after(() => {
    fs.renameSync = originalRename;
  });

  for (let i = 0; i < 1000; i += 1) store.record('state_relayed');

  // 1,000 events over a limit of 100 with 10% slack: one rewrite per 10 events.
  assert.ok(rewrites <= 100, `${rewrites} rewrites`);
  assert.ok(store.events.length <= 110);
  assert.equal(fileLines(store), store.events.length);
});

test('the limit holds exactly again after a restart', (t) => {
  const store = makeStore(t);
  for (let i = 0; i < 105; i += 1) store.record('state_relayed');
  assert.equal(store.events.length, 105);

  const reopened = new TelemetryStore(store.config);
  assert.equal(reopened.events.length, 100);
  assert.equal(fileLines(reopened), 100);
});

test('expired events go at the next age check', (t) => {
  const store = makeStore(t);
  store.events.push({
    timestamp: new Date(Date.now() - 31 * 86400000).toISOString(),
    type: 'old',
  });
  store.record('recent');
  assert.equal(store.events.length, 2, 'not checked yet');

  store.lastAgeCheck = 0;
  store.record('recent');
  assert.deepEqual(
    store.events.map((event) => event.type),
    ['recent', 'recent'],
  );
  assert.equal(fileLines(store), 2);
});
