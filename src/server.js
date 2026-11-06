import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { MultiplayerRelay } from './multiplayer.js';
import { TelemetryStore } from './telemetry.js';
import { createAdminHandler } from './admin.js';
import { startDiscovery } from './discovery.js';

// The request target is client-controlled; an unparsable one is a 400, not a crash.
const parseRequestUrl = (target) => {
  try {
    return new URL(target, 'http://localhost');
  } catch {
    return null;
  }
};

export function createServer(config = loadConfig(), logger = console) {
  const telemetry = new TelemetryStore(config);
  const relay = new MultiplayerRelay(config, logger, telemetry);
  const admin = createAdminHandler(config, relay, telemetry);
  const route = (request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    const url = parseRequestUrl(request.url);
    if (!url)
      return response.writeHead(400).end(JSON.stringify({ error: 'bad_request' }));
    if (admin(request, response, url)) return;
    if (request.method === 'GET' && url.pathname === '/healthz') {
      response.writeHead(200).end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && url.pathname === '/readyz') {
      response
        .writeHead(200)
        .end(JSON.stringify({ status: 'ready', ...relay.stats() }));
    } else response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
  };
  // A throwing request handler would otherwise crash the whole relay.
  const server = http.createServer((request, response) => {
    try {
      route(request, response);
    } catch (error) {
      logger.error?.('request failed', error.message);
      if (response.headersSent) response.end();
      else response.writeHead(500).end(JSON.stringify({ error: 'internal_error' }));
    }
  });
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxMessageBytes,
  });
  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (config.allowedOrigins.size && (!origin || !config.allowedOrigins.has(origin))) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) =>
      relay.attach(webSocket),
    );
  });
  const timer = setInterval(() => relay.sweep(), Math.min(config.idleTimeoutMs, 5000));
  timer.unref();
  const close = () => {
    clearInterval(timer);
    relay.close();
    webSockets.close();
    return new Promise((resolve) => server.close(resolve));
  };
  return { server, relay, telemetry, close };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const config = loadConfig();
  const app = createServer(config);
  let discovery = null;
  app.server.listen(config.port, config.host, () => {
    console.log(`PRG32 multiplayer server listening on ${config.host}:${config.port}`);
    discovery = startDiscovery(config, app.server.address().port);
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await discovery?.close();
      await app.close();
      process.exit(0);
    });
}
