// Checks that a deployed server accepts WebSocket connections the way a PRG32
// console makes them: an upgrade request with no Origin header. It only opens the
// connection and closes it again; it never sends `join`, so no device is created.
//
//   npm run check:connection -- wss://multiplayer.example.edu
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

const target = process.argv[2];
if (!target || !/^wss?:\/\//.test(target)) {
  console.error('usage: npm run check:connection -- ws://HOST:PORT | wss://HOST');
  process.exit(2);
}

const url = new URL(target);
const transport = url.protocol === 'wss:' ? https : http;
const request = transport.request({
  hostname: url.hostname,
  port: url.port || (url.protocol === 'wss:' ? 443 : 80),
  path: `${url.pathname}${url.search}`,
  headers: {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
    'Sec-WebSocket-Version': '13',
  },
  timeout: 10000,
});

const finish = (ok, message) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${target}: ${message}`);
  process.exit(ok ? 0 : 1);
};

request.on('upgrade', (response, socket) => {
  socket.destroy();
  finish(true, `101 Switching Protocols; consoles can connect`);
});
request.on('response', (response) => {
  response.resume();
  const status = `${response.statusCode} ${response.statusMessage}`;
  if (response.statusCode === 403)
    finish(
      false,
      `${status}: the server refused a request without Origin. Update the server: consoles send no Origin header`,
    );
  else if (response.statusCode === 200)
    finish(
      false,
      `${status}: a reverse proxy answered the upgrade as a page request and did not pass it on. Configure WebSocket proxying (docs/docker.md, "Behind Apache or another proxy")`,
    );
  else finish(false, `${status}: expected 101 Switching Protocols`);
});
request.on('timeout', () => request.destroy(new Error('no answer within 10 s')));
request.on('error', (error) => finish(false, error.message));
request.end();
