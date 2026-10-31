import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { MultiplayerRelay } from './multiplayer.js';
import { TelemetryStore } from './telemetry.js';
import { createAdminHandler } from './admin.js';

export function createServer(config = loadConfig(), logger = console) {
  const telemetry = new TelemetryStore(config);
  const relay = new MultiplayerRelay(config, logger, telemetry);
  const admin = createAdminHandler(config, relay, telemetry);
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    if (admin(request, response)) return;
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200).end(JSON.stringify({ status: 'ok' }));
    } else if (request.method === 'GET' && request.url === '/readyz') {
      response
        .writeHead(200)
        .end(JSON.stringify({ status: 'ready', ...relay.stats() }));
    } else response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
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
  app.server.listen(config.port, config.host, () =>
    console.log(`PRG32 multiplayer server listening on ${config.host}:${config.port}`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
