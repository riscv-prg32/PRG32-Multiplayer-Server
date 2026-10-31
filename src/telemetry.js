import fs from 'node:fs';
import path from 'node:path';

export class TelemetryStore {
  constructor(config) {
    this.config = config;
    this.events = [];
    this.devices = new Map();
    this.listeners = new Set();
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    this.eventFile = path.join(config.dataDir, 'telemetry.jsonl');
    this.deviceFile = path.join(config.dataDir, 'devices.json');
    this.#load();
  }

  record(type, details = {}) {
    const event = { timestamp: new Date().toISOString(), type, ...details };
    this.events.push(event);
    const pruned = this.#prune();
    if (pruned) this.#rewriteEvents();
    else
      fs.appendFileSync(this.eventFile, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    for (const listener of this.listeners) listener(event);
    return event;
  }

  seen(identity) {
    if (!identity) return;
    const previous = this.devices.get(identity.deviceId);
    this.devices.set(identity.deviceId, {
      device_id: identity.deviceId,
      platform: identity.platform,
      first_seen: previous?.first_seen || new Date().toISOString(),
      last_seen: new Date().toISOString(),
      connections: (previous?.connections || 0) + 1,
      blocked: previous?.blocked || false,
    });
    this.#saveDevices();
  }

  isBlocked(deviceId) {
    return this.devices.get(deviceId)?.blocked === true;
  }
  setBlocked(deviceId, blocked) {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.blocked = blocked;
    this.#saveDevices();
    this.record(blocked ? 'device_blocked' : 'device_unblocked', {
      device_id: deviceId,
    });
    return true;
  }

  erase(deviceId) {
    const existed = this.devices.delete(deviceId);
    this.events = this.events.filter((event) => event.device_id !== deviceId);
    this.#saveDevices();
    this.#rewriteEvents();
    return existed;
  }

  summary(active = {}) {
    const counts = {};
    for (const event of this.events) counts[event.type] = (counts[event.type] || 0) + 1;
    return {
      generated_at: new Date().toISOString(),
      retention_days: this.config.telemetryRetentionDays,
      retained_events: this.events.length,
      known_devices: this.devices.size,
      event_counts: counts,
      ...active,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  #prune() {
    const before = this.events.length;
    const cutoff = Date.now() - this.config.telemetryRetentionDays * 86400000;
    this.events = this.events
      .filter((event) => Date.parse(event.timestamp) >= cutoff)
      .slice(-this.config.telemetryMaxEvents);
    return this.events.length !== before;
  }
  #load() {
    try {
      const lines = fs.readFileSync(this.eventFile, 'utf8').split('\n').filter(Boolean);
      this.events = lines.flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      const devices = JSON.parse(fs.readFileSync(this.deviceFile, 'utf8'));
      this.devices = new Map(devices.map((device) => [device.device_id, device]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.#prune();
    this.#rewriteEvents();
  }
  #saveDevices() {
    fs.writeFileSync(
      this.deviceFile,
      JSON.stringify([...this.devices.values()], null, 2),
      { mode: 0o600 },
    );
  }
  #rewriteEvents() {
    const temporary = `${this.eventFile}.tmp`;
    fs.writeFileSync(
      temporary,
      this.events.map((event) => JSON.stringify(event)).join('\n') +
        (this.events.length ? '\n' : ''),
      { mode: 0o600 },
    );
    fs.renameSync(temporary, this.eventFile);
  }
}
