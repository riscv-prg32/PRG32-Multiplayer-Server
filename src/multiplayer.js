import { createIdentity } from './identity.js';
import { encode, parseMessage } from './protocol.js';

const OPEN = 1;

export class MultiplayerRelay {
  constructor(config, logger = console, telemetry = null) {
    this.config = config;
    this.logger = logger;
    this.clients = new Set();
    this.rooms = new Map();
    this.telemetry = telemetry;
  }

  attach(socket) {
    if (this.clients.size >= this.config.maxConnections)
      return socket.close(1013, 'server_full');
    const now = Date.now();
    const client = {
      socket,
      identity: null,
      room: null,
      playerId: null,
      lastSeen: now,
      rateWindow: now,
      rateCount: 0,
    };
    this.clients.add(client);
    this.telemetry?.record('connection_opened');
    socket.on('message', (data, isBinary) => {
      try {
        this.#message(client, data, isBinary);
      } catch (error) {
        // An unexpected failure (for example a telemetry write error) must only
        // affect this message, never crash the process and every other room.
        this.logger.error?.('message handling failed', error.message);
        this.#fail(client, 'internal_error');
      }
    });
    socket.on('close', () => this.#remove(client));
    socket.on('error', (error) => this.logger.warn?.('websocket error', error.message));
  }

  sweep(now = Date.now()) {
    for (const client of this.clients)
      if (now - client.lastSeen > this.config.idleTimeoutMs) {
        client.socket.close(1001, 'idle_timeout');
        this.#remove(client);
      }
  }

  stats() {
    return { connections: this.clients.size, rooms: this.rooms.size };
  }
  disconnectDevice(deviceId, reason = 'admin_action') {
    let count = 0;
    for (const client of [...this.clients]) {
      if (client.identity?.deviceId !== deviceId) continue;
      client.socket.close(1008, reason);
      this.#remove(client);
      count += 1;
    }
    return count;
  }
  close() {
    for (const client of this.clients) client.socket.close(1001, 'server_shutdown');
    this.clients.clear();
    this.rooms.clear();
  }

  #message(client, data, isBinary) {
    client.lastSeen = Date.now();
    if (isBinary) return this.#fail(client, 'binary_not_supported');
    if (!this.#withinRate(client)) return this.#fail(client, 'rate_limited', 1008);
    let message;
    try {
      message = parseMessage(data, this.config.maxMessageBytes);
    } catch (error) {
      return this.#fail(client, error.message);
    }
    if (message.type === 'join') return this.#join(client, message);
    if (message.type === 'state') return this.#state(client, message);
    if (message.type === 'leave') return this.#leave(client);
    this.#send(client, { type: 'pong', time: Date.now() });
  }

  #join(client, message) {
    this.#leave(client);
    client.identity = createIdentity(message, this.config.deviceIdSecret);
    if (this.telemetry?.isBlocked(client.identity.deviceId))
      return this.#fail(client, 'device_blocked', 1008);
    let room = this.rooms.get(message.signature);
    if (!room) this.rooms.set(message.signature, (room = new Set()));
    if (room.size >= this.config.maxRoomClients) return this.#fail(client, 'room_full');
    const requestedId = message.player_id;
    const collision = [...room].some((peer) => peer.playerId === requestedId);
    client.playerId =
      requestedId && !collision ? requestedId : this.#uniquePlayerId(room);
    client.room = message.signature;
    room.add(client);
    this.telemetry?.seen(client.identity);
    this.telemetry?.record('room_joined', {
      device_id: client.identity.deviceId,
      platform: client.identity.platform,
      room: message.signature,
    });
    this.#send(client, {
      type: 'welcome',
      protocol: 'prg32-multiplayer-1.0',
      player_id: client.playerId,
      connection_id: client.identity.connectionId,
      device_id: client.identity.deviceId,
      platform: client.identity.platform,
      persistent_device_id: client.identity.persistent,
    });
  }

  #state(client, message) {
    if (!client.room) return this.#fail(client, 'join_required');
    this.telemetry?.record('state_relayed', {
      device_id: client.identity.deviceId,
      platform: client.identity.platform,
      room: client.room,
      bytes: Buffer.byteLength(JSON.stringify(message)),
    });
    this.#broadcast(client, {
      type: 'peer',
      player_id: client.playerId,
      device_id: client.identity.deviceId,
      platform: client.identity.platform,
      x: message.x,
      y: message.y,
      sprite: message.sprite,
      flags: message.flags,
      input: message.input,
      frame: message.frame,
    });
  }

  #leave(client) {
    if (!client.room) return;
    const room = this.rooms.get(client.room);
    this.#broadcast(client, { type: 'leave', player_id: client.playerId });
    room?.delete(client);
    if (room?.size === 0) this.rooms.delete(client.room);
    client.room = null;
  }

  #remove(client) {
    this.#leave(client);
    if (this.clients.delete(client)) this.telemetry?.record('connection_closed');
  }
  #broadcast(sender, message) {
    const room = this.rooms.get(sender.room);
    if (room)
      for (const client of room) if (client !== sender) this.#send(client, message);
  }
  #send(client, message) {
    if (client.socket.readyState === OPEN) client.socket.send(encode(message));
  }
  #fail(client, code, closeCode) {
    this.#send(client, { type: 'error', code });
    if (closeCode) client.socket.close(closeCode, code);
  }
  #withinRate(client) {
    const now = Date.now();
    if (now - client.rateWindow >= 1000) {
      client.rateWindow = now;
      client.rateCount = 0;
    }
    return ++client.rateCount <= this.config.maxMessagesPerSecond;
  }
  #uniquePlayerId(room) {
    const used = new Set([...room].map((client) => client.playerId));
    let id;
    do id = Math.floor(Math.random() * 0xffffffff) + 1;
    while (used.has(id));
    return id;
  }
}
