# Configuration and deployment

| Variable                  |           Default | Meaning                                            |
| ------------------------- | ----------------: | -------------------------------------------------- |
| `HOST`                    |         `0.0.0.0` | Listen address                                     |
| `PORT`                    |            `8081` | HTTP/WebSocket port                                |
| `DEVICE_ID_SECRET`        | development value | HMAC key; 32+ characters required in production    |
| `MAX_CONNECTIONS`         |            `1024` | Concurrent WebSocket limit                         |
| `MAX_ROOM_CLIENTS`        |              `16` | Clients per cartridge signature                    |
| `MAX_MESSAGE_BYTES`       |            `1024` | Maximum WebSocket message size                     |
| `MAX_MESSAGES_PER_SECOND` |              `40` | Per-connection message limit                       |
| `IDLE_TIMEOUT_MS`         |           `15000` | Disconnect silence threshold                       |
| `ALLOWED_ORIGINS`         |             empty | Comma-separated browser origins; empty permits all |

Put TLS at a reverse proxy and expose `wss://` on public networks. Proxy
WebSocket upgrades without buffering and use `/healthz` for liveness and
`/readyz` for readiness. The service is intentionally stateless: use sticky
connections or one instance unless a shared-room backplane is added.

PRG32 firmware uses `CONFIG_PRG32_MULTIPLAYER_SERVER_URL`; set it to the final
`ws://` or `wss://` URL when building the physical ESP32-C6 firmware.
