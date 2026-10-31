import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../src/identity.js';
import { parseMessage } from '../src/protocol.js';

test('accepts the legacy firmware join message', () => {
  const message = parseMessage(
    Buffer.from('{"type":"join","signature":"lab05-demo","flags":1,"player_id":7}'),
    1024,
  );
  assert.equal(message.player_id, 7);
});

test('rejects invalid state values', () => {
  assert.throws(
    () =>
      parseMessage(
        Buffer.from(
          '{"type":"state","x":0,"y":0,"sprite":0,"flags":0,"input":128,"frame":0}',
        ),
        1024,
      ),
    /invalid_input/,
  );
});

test('stable IDs are private, stable, and platform separated', () => {
  const secret = '01234567890123456789012345678901';
  const a = createIdentity({ platform: 'qemu', device_id: 'raw-id' }, secret);
  const b = createIdentity({ platform: 'qemu', device_id: 'raw-id' }, secret);
  const c = createIdentity({ platform: 'prg32-qt', device_id: 'raw-id' }, secret);
  assert.equal(a.deviceId, b.deviceId);
  assert.notEqual(a.deviceId, c.deviceId);
  assert.notEqual(a.connectionId, b.connectionId);
  assert.equal(a.deviceId.includes('raw-id'), false);
});
