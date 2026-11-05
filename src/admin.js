import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PAGE_HEADERS,
  privacyMarkdown,
  privacyNoticeReady,
  publicDirectory,
  renderPage,
} from './pages.js';

// Static assets: a fixed allowlist, so no request path ever reaches the filesystem.
const ASSETS = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/status.js': ['status.js', 'text/javascript; charset=utf-8'],
  '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/prg32-logo.png': ['prg32-logo.png', 'image/png'],
  '/favicon.png': ['favicon.png', 'image/png'],
  '/accessibility.md': ['accessibility.md', 'text/markdown; charset=utf-8'],
};
const PAGE_ROUTES = {
  '/': 'status',
  '/admin': 'admin',
  '/privacy': 'privacy',
  '/accessibility': 'accessibility',
};
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
// Absent or invalid limits use the default; valid ones are clamped to 1…5000 so
// a negative or fractional value can never turn slice(-limit) into a wrong window.
const eventLimit = (params) => {
  const value = Math.trunc(Number(params.get('limit')));
  if (!Number.isFinite(value) || value < 1) return 500;
  return Math.min(value, 5000);
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
  return (request, response, url) => {
    if (request.method === 'GET' && Object.hasOwn(PAGE_ROUTES, url.pathname)) {
      response.writeHead(200, PAGE_HEADERS);
      response.end(renderPage(PAGE_ROUTES[url.pathname], config));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/privacy.md') {
      response.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      response.end(privacyMarkdown(config));
      return true;
    }
    if (request.method === 'GET' && Object.hasOwn(ASSETS, url.pathname)) {
      const [file, type] = ASSETS[url.pathname];
      response.writeHead(200, {
        'content-type': type,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      response.end(fs.readFileSync(path.join(publicDirectory, file)));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      json(response, 200, {
        generated_at: new Date().toISOString(),
        ...relay.stats(),
      });
      return true;
    }
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!equalToken(token, config.adminToken)) {
      json(response, 401, { error: 'unauthorized' });
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/stats') {
      json(response, 200, {
        ...telemetry.summary(relay.stats()),
        privacy_notice_ready: privacyNoticeReady(),
      });
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/events') {
      json(response, 200, telemetry.events.slice(-eventLimit(url.searchParams)));
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
      /^\/api\/admin\/devices\/([A-Za-z0-9_-]{22})(?:\/(block|unblock|export))?$/,
    );
    // Everything retained about one device, for access and portability requests.
    if (match && request.method === 'GET' && match[2] === 'export') {
      const device = telemetry.devices.get(match[1]);
      if (!device) {
        json(response, 404, { error: 'not_found' });
        return true;
      }
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="prg32-device-${match[1]}.json"`,
        'cache-control': 'no-store',
      });
      response.end(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            retention_days: config.telemetryRetentionDays,
            device,
            events: telemetry.events.filter((event) => event.device_id === match[1]),
          },
          null,
          2,
        ),
      );
      return true;
    }
    if (
      match &&
      request.method === 'POST' &&
      (match[2] === 'block' || match[2] === 'unblock')
    ) {
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
