export const SIGNATURE = /^[A-Za-z0-9_.:-]{1,47}$/;
const integer = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

export function parseMessage(data, maximumBytes) {
  if (Buffer.byteLength(data) > maximumBytes) throw new Error('message_too_large');
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    throw new Error('invalid_json');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message))
    throw new Error('invalid_message');
  if (message.type === 'join') {
    if (typeof message.signature !== 'string' || !SIGNATURE.test(message.signature))
      throw new Error('invalid_signature');
    if (message.player_id !== undefined && !integer(message.player_id, 1, 0xffffffff))
      throw new Error('invalid_player_id');
    if (message.flags !== undefined && !integer(message.flags, 0, 0xffffffff))
      throw new Error('invalid_flags');
    if (
      message.device_id !== undefined &&
      (typeof message.device_id !== 'string' ||
        !message.device_id.length ||
        message.device_id.length > 128)
    )
      throw new Error('invalid_device_id');
    return message;
  }
  if (message.type === 'state') {
    const fields = [
      ['x', -32768, 32767],
      ['y', -32768, 32767],
      ['sprite', 0, 65535],
      ['flags', 0, 65535],
      ['input', 0, 0x7f],
      ['frame', 0, 0xffffffff],
    ];
    for (const [name, min, max] of fields)
      if (!integer(message[name], min, max)) throw new Error(`invalid_${name}`);
    return message;
  }
  if (message.type === 'leave' || message.type === 'ping') return message;
  throw new Error('unknown_type');
}

export const encode = (message) => JSON.stringify(message);
