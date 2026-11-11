# Configuration and deployment

| Variable                   |             Default | Meaning                                                                                     |
| -------------------------- | ------------------: | ------------------------------------------------------------------------------------------- |
| `HOST`                     |           `0.0.0.0` | Listen address                                                                              |
| `PORT`                     |              `8081` | HTTP/WebSocket port                                                                         |
| `DEVICE_ID_SECRET`         |   development value | HMAC key; 32+ characters required in production                                             |
| `MAX_CONNECTIONS`          |              `1024` | Concurrent WebSocket limit                                                                  |
| `MAX_ROOM_CLIENTS`         |                `16` | Clients per cartridge signature                                                             |
| `MAX_MESSAGE_BYTES`        |              `1024` | Maximum WebSocket message size                                                              |
| `MAX_MESSAGES_PER_SECOND`  |                `40` | Per-connection message limit                                                                |
| `IDLE_TIMEOUT_MS`          |             `15000` | Disconnect silence threshold                                                                |
| `ALLOWED_ORIGINS`          |               empty | Comma-separated browser origins; empty permits all. Clients with no `Origin` are admitted   |
| `ADMIN_TOKEN`              |   development value | Admin bearer token; 32+ characters required in production                                   |
| `DATA_DIR`                 |            `./data` | Persistent telemetry/device directory (`/data` in containers)                               |
| `TELEMETRY_RETENTION_DAYS` |                `30` | Maximum event age, 1–365 days                                                               |
| `TELEMETRY_MAX_EVENTS`     |            `100000` | Maximum retained event count                                                                |
| `PRIVACY_NOTICE_URL`       |          `/privacy` | Published privacy notice location                                                           |
| `DISCOVERY_PORT`           |              `8082` | UDP LAN discovery port; `0` turns discovery off (production default `0`)                    |
| `DISCOVERY_INTERVAL_MS`    |              `2000` | Discovery beacon period, 0–60000; `0` answers queries only                                  |
| `DISCOVERY_URL`            |               empty | URL to advertise; empty means `ws://<this host on the asker's network>:PORT`                |
| `MDNS`                     |                `on` | mDNS / DNS-SD advertising of `_prg32mp._tcp`; `off` turns it off (production default `off`) |
| `MDNS_NAME`                | `PRG32 Multiplayer` | mDNS service instance name, at most 63 characters                                           |

`TELEMETRY_MAX_EVENTS` is enforced in batches, because rewriting the event file
pauses the relay. The retained count can run up to 10% over the limit before it
is trimmed, and expired events are removed within about a minute of expiring.
Every relayed snapshot is one event, so a room of four consoles at 20 snapshots
per second writes about 80 events per second: the default limit then holds about
20 minutes of traffic.

Put TLS at a reverse proxy and expose `wss://` on public networks. Proxy
WebSocket upgrades without buffering and use `/healthz` for liveness and
`/readyz` for readiness. The service is intentionally stateless: use sticky
connections or one instance unless a shared-room backplane is added.

PRG32 firmware uses `CONFIG_PRG32_MULTIPLAYER_SERVER_URL`; set it to the final
`ws://` or `wss://` URL when building the physical ESP32-C6 firmware.

On a local network the firmware does not need the right URL compiled in. When it
cannot reach its server for 3 seconds while a cartridge wants a room, it asks the
LAN over UDP (see [LAN discovery](protocol.md#lan-discovery)) and switches to the
URL this server answers with. Discovery is on by default for a classroom server
and off when `NODE_ENV=production`; behind a reverse proxy, set `DISCOVERY_URL`
to the public `wss://` URL or leave discovery off. Discovery needs UDP port 8082
open in the host firewall, and it does not cross routers or most guest Wi-Fi
networks that isolate clients.

The server also advertises itself with mDNS / DNS-SD as the service
`_prg32mp._tcp` (see [mDNS advertising](protocol.md#mdns-advertising)). PRG32
firmware on ESP32-C6 asks for that service every 6 seconds and tries it before
UDP discovery. The SRV port is `PORT`; when `DISCOVERY_URL` is set, its port
and the TXT keys `scheme=wss` and `path` come from that URL, but the
address is still this host's own. `MDNS` follows the same defaults as discovery
(on, off when `NODE_ENV=production`). It needs UDP port 5353 (multicast
`224.0.0.251`) open in the host firewall and, like discovery, stays on one local
network. It runs alongside the system responder on macOS (mDNSResponder) and
Linux (Avahi); no `dns-sd -R` or `avahi-publish-service` is needed. Check it
from macOS with:

```bash
dns-sd -B _prg32mp._tcp
```

```bash
dns-sd -L "PRG32 Multiplayer" _prg32mp._tcp local
```

For container-specific values, secret handling, volumes, TLS, and operational
commands, use [Docker and Docker Compose deployment](docker.md). For component
and data-flow relationships, see [System architecture](architecture.md).
