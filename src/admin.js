import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
);
const equalToken = (actual, expected) => {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
const json = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
};
const csv = (events) => {
  const columns = ['timestamp', 'type', 'device_id', 'platform', 'room', 'bytes'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    columns.join(','),
    ...events.map((event) => columns.map((column) => quote(event[column])).join(',')),
  ].join('\n');
};

export function createAdminHandler(config, relay, telemetry) {
  return (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (
      request.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/admin')
    ) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
      });
      response.end(fs.readFileSync(path.join(publicDirectory, 'index.html')));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/app.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(fs.readFileSync(path.join(publicDirectory, 'app.js')));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/style.css') {
      response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      response.end(fs.readFileSync(path.join(publicDirectory, 'style.css')));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/privacy') {
      response.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(fs.readFileSync(path.join(publicDirectory, 'privacy.md')));
      return true;
    }
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!equalToken(token, config.adminToken)) {
      json(response, 401, { error: 'unauthorized' });
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/stats') {
      json(response, 200, telemetry.summary(relay.stats()));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/events') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 5000);
      json(response, 200, telemetry.events.slice(-limit));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/devices') {
      json(response, 200, [...telemetry.devices.values()]);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/export') {
      const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
      response.writeHead(200, {
        'content-type':
          format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="prg32-telemetry.${format}"`,
        'cache-control': 'no-store',
      });
      response.end(
        format === 'csv'
          ? csv(telemetry.events)
          : JSON.stringify(telemetry.events, null, 2),
      );
      return true;
    }
    const match = url.pathname.match(
      /^\/api\/admin\/devices\/([A-Za-z0-9_-]{22})(?:\/(block|unblock))?$/,
    );
    if (match && request.method === 'POST' && match[2]) {
      const changed = telemetry.setBlocked(match[1], match[2] === 'block');
      if (changed && match[2] === 'block')
        relay.disconnectDevice(match[1], 'device_blocked');
      json(response, changed ? 200 : 404, { changed });
      return true;
    }
    if (match && request.method === 'DELETE' && !match[2]) {
      relay.disconnectDevice(match[1], 'device_erased');
      const erased = telemetry.erase(match[1]);
      json(response, erased ? 200 : 404, { erased });
      return true;
    }
    json(response, 404, { error: 'not_found' });
    return true;
  };
}
