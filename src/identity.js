import { createHmac, randomUUID } from 'node:crypto';

export const PLATFORMS = new Set(['esp32c6', 'qemu', 'prg32-qt', 'prg-ios', 'unknown']);

export function createIdentity(message, secret) {
  const platform = PLATFORMS.has(message.platform) ? message.platform : 'unknown';
  const claimedId =
    typeof message.device_id === 'string' && message.device_id.length
      ? message.device_id
      : null;
  const legacyId = Number.isSafeInteger(message.player_id)
    ? message.player_id
    : randomUUID();
  const source = claimedId || `legacy:${legacyId}:${randomUUID()}`;
  const deviceId = createHmac('sha256', secret)
    .update(`${platform}\0${source}`)
    .digest('base64url')
    .slice(0, 22);
  return Object.freeze({
    connectionId: randomUUID(),
    deviceId,
    platform,
    persistent: Boolean(claimedId),
  });
}
