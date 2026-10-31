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
  });
}
