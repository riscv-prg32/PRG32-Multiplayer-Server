const boolean = (env, name, fallback) => {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  if (['1', 'true', 'on', 'yes'].includes(raw)) return true;
  if (['0', 'false', 'off', 'no'].includes(raw)) return false;
  throw new Error(`${name} must be on or off`);
};

const integer = (env, name, fallback, minimum, maximum) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
};

export function loadConfig(env = process.env) {
  const secret = env.DEVICE_ID_SECRET || 'development-only-secret-change-me';
  if (env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error(
      'DEVICE_ID_SECRET must contain at least 32 characters in production',
    );
  }
  const adminToken = env.ADMIN_TOKEN || 'development-admin-token';
  if (env.NODE_ENV === 'production' && adminToken.length < 32) {
    throw new Error('ADMIN_TOKEN must contain at least 32 characters in production');
  }
  return Object.freeze({
    host: env.HOST || '0.0.0.0',
    port: integer(env, 'PORT', 8081, 1, 65535),
    deviceIdSecret: secret,
    maxConnections: integer(env, 'MAX_CONNECTIONS', 1024, 1, 100000),
    maxRoomClients: integer(env, 'MAX_ROOM_CLIENTS', 16, 2, 256),
    maxMessageBytes: integer(env, 'MAX_MESSAGE_BYTES', 1024, 128, 65536),
    maxMessagesPerSecond: integer(env, 'MAX_MESSAGES_PER_SECOND', 40, 1, 1000),
    idleTimeoutMs: integer(env, 'IDLE_TIMEOUT_MS', 15000, 1000, 300000),
    allowedOrigins: new Set(
      (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
    adminToken,
    dataDir: env.DATA_DIR || './data',
    telemetryRetentionDays: integer(env, 'TELEMETRY_RETENTION_DAYS', 30, 1, 365),
    telemetryMaxEvents: integer(env, 'TELEMETRY_MAX_EVENTS', 100000, 100, 1000000),
    privacyNoticeUrl: env.PRIVACY_NOTICE_URL || '/privacy',
    // LAN discovery (src/discovery.js). On by default for a classroom server,
    // off by default in production, where consoles are given the address.
    discoveryPort: integer(
      env,
      'DISCOVERY_PORT',
      env.NODE_ENV === 'production' ? 0 : 8082,
      0,
      65535,
    ),
    discoveryIntervalMs: integer(env, 'DISCOVERY_INTERVAL_MS', 2000, 0, 60000),
    discoveryUrl: env.DISCOVERY_URL || '',
    // mDNS / DNS-SD advertising (src/mdns.js), with the same defaults.
    mdns: boolean(env, 'MDNS', env.NODE_ENV !== 'production'),
    mdnsName: (env.MDNS_NAME || 'PRG32 Multiplayer').slice(0, 63),
  });
}
