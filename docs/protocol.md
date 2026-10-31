# Protocol and device identity

The JSON WebSocket protocol is `prg32-multiplayer-1.0`. One text frame contains
one object. Existing PRG32 firmware's smaller messages remain valid.

## Unique device identity

Each modern client sends `platform` and a stable local `device_id`. The server
returns `device_id = HMAC-SHA256(DEVICE_ID_SECRET, platform || local ID)` in a
truncated base64url form. This separates equal IDs on different platforms and
avoids relaying raw hardware identifiers.

| Client            | `platform` | Stable local source                                                         |
| ----------------- | ---------- | --------------------------------------------------------------------------- |
| Physical ESP32-C6 | `esp32c6`  | factory base MAC rendered as 12 lowercase hex characters                    |
| Espressif QEMU    | `qemu`     | UUID created once and persisted in emulator storage                         |
| PRG32-QT          | `prg32-qt` | UUID created once in `QSettings`                                            |
| PRG-iOS           | `prg-ios`  | random UUID stored in Keychain (not IDFA); use IDFV only as migration input |

Reinstalling or clearing emulator/application storage intentionally creates a
new identity. Legacy clients that omit these fields receive a connection-only
identity (`persistent_device_id: false`). Every socket also gets a unique
`connection_id`, so two simultaneous connections from one device are distinct.

## Messages

Join a cartridge room (signature uses 1–47 letters, digits, `_ . : -`):

```json
{
  "type": "join",
  "signature": "pong-v1",
  "flags": 1,
  "player_id": 42,
  "platform": "qemu",
  "device_id": "018f..."
}
```

The server answers with `welcome`, including authoritative `player_id`,
`connection_id`, hashed `device_id`, `platform`, and `persistent_device_id`.

State fields are required and bounded to the firmware structures:

```json
{
  "type": "state",
  "player_id": 42,
  "x": 10,
  "y": 20,
  "sprite": 0,
  "flags": 0,
  "input": 1,
  "frame": 9
}
```

The server ignores the state message's claimed `player_id` and relays a `peer`
message with the connection's authoritative ID. `leave` exits a room; `ping`
returns `pong`. Errors are `{ "type":"error", "code":"..." }`.

Rooms exist only in memory and disappear when empty. State is not retained;
clients publish snapshots periodically as PRG32 firmware does every 50 ms.
