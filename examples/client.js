import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const [name = 'qemu-example', signature = 'demo-room'] = process.argv.slice(2);
const socket = new WebSocket(process.env.SERVER_URL || 'ws://localhost:8081');
socket.on('open', () =>
  socket.send(
    JSON.stringify({
      type: 'join',
      signature,
      flags: 1,
      platform: 'qemu',
      device_id: name || randomUUID(),
    }),
  ),
);
socket.on('message', (data) => console.log(data.toString()));
setInterval(
  () =>
    socket.send(
      JSON.stringify({
        type: 'state',
        x: Math.floor(Math.random() * 320),
        y: Math.floor(Math.random() * 200),
        sprite: 0,
        flags: 0,
        input: 0,
        frame: Date.now() >>> 0,
      }),
    ),
  1000,
).unref();
