# PRG32 firmware enhancement specification: multiplayer identity and transports

Status: implementation-ready proposal for the PRG32 firmware and companion
clients. Server protocol target: `prg32-multiplayer-1.0`.

## Goal

Extend PRG32's existing additive WebSocket join contract so every physical
ESP32-C6, QEMU instance, PRG32-QT installation, and PRG-iOS installation sends
a stable platform-scoped identity. Enable real network multiplayer for QEMU,
whose current `prg32_multiplayer.c` path is an offline stub. Preserve binary and
source compatibility for cartridges and compatibility with legacy servers.

## Wire change

Add two optional fields to the existing `join` JSON:

```json
{
  "type": "join",
  "signature": "pong-v1",
  "flags": 1,
  "player_id": 123,
  "protocol": "prg32-multiplayer-1.0",
  "platform": "esp32c6",
  "device_id": "aabbccddeeff"
}
```

Do not add identity to `state`; the server binds state to the socket. Parse the
extended `welcome` fields when present, but retain current behavior when they
are absent. Never log raw `device_id` at normal log levels.

## ESP32-C6 implementation

In `components/prg32/prg32_multiplayer.c`, obtain the factory base MAC once at
initialization with the ESP-IDF base-MAC API, render its six bytes as exactly 12
lowercase hexadecimal characters, and keep it in the multiplayer state. Set
`platform` to `esp32c6`. Do not use the current randomized `player_id` as device
identity; keep it as the session/game actor ID. Increase the join buffer after
calculating the maximum JSON size and check `snprintf` truncation as today.

Do not persist another copy of the MAC in NVS. Do not include SSID, IP, user
name, board serial, or chip revision. The server converts this raw local source
to a secret-keyed public pseudonym before relaying it.

## QEMU implementation

Remove QEMU from the compile-time offline multiplayer stub when networking is
enabled. Add a small identity provider which loads `device_id` from a dedicated
NVS key such as namespace `prg32id`, key `install`. If absent, generate 128
random bits, encode as lowercase UUID, store, and commit. QEMU images cloned for
classrooms must clear this key on first boot or inject distinct values.

Set `platform` to `qemu`. Reuse the ESP WebSocket client path with a configurable
URL. Ensure the QEMU network backend can reach the host (document the host alias
or port forwarding). Keep the offline stub available behind a separate explicit
configuration option for deterministic tests.

## PRG32-QT implementation

In the Qt multiplayer client, read an installation UUID from `QSettings` under
`multiplayer/deviceId`; create it with `QUuid::createUuid().toString(WithoutBraces)`
if missing. Set `platform` to `prg32-qt`. Do not derive it from a machine MAC,
host name, login name, disk serial, or other cross-application identifier.

## PRG-iOS implementation

Generate a random UUID on first use and store it as a generic-password Keychain
item scoped to the app. Set `platform` to `prg-ios`. Do not use IDFA. Existing
IDFV may be used only once as migration input and should not be transmitted or
retained afterward. Handle Keychain reset by creating a new identity.

## Welcome parsing

Extend the internal connection metadata (not the public cartridge ABI unless a
separate need is approved) to accept:

- `protocol`: server protocol string;
- `connection_id`: unique UUID for this socket;
- `device_id`: server-generated pseudonym;
- `platform`: normalized platform string;
- `persistent_device_id`: whether the server received a stable client source.

Unknown fields must remain ignored. A legacy welcome containing only
`type`/`player_id` must continue to work.

Add `uint32_t prg32_multiplayer_local_player_id(void)` to the portable ABI as an
append-only function and increase the ABI minor version. It returns the
authoritative ID from `welcome`, or zero before welcome. This is required by
multi-screen cartridges that deterministically order the local device among
peers. Regenerate ABI artifacts rather than editing generated files.

## GDPR and privacy requirements

Display or link the operator's privacy notice before enabling internet
multiplayer. Provide a UI action that reveals the server-returned public
`device_id` so a player can make an access/erasure request. Provide a reset
identity action for QEMU, PRG32-QT, and PRG-iOS with a warning that bans and
history associations will be lost. Physical factory MAC cannot be reset, so
only its server pseudonym should appear in UI or logs.

Do not add telemetry fields without a documented purpose, retention period,
and server-side export/erasure handling. Identity is pseudonymous personal data,
not anonymous data.

## Tests and acceptance criteria

1. Existing legacy server accepts the extended join or ignores new fields.
2. Current server accepts an old firmware join and marks identity non-persistent.
3. Two connections from one installation have equal public `device_id` and
   different `connection_id` values.
4. Two installations of every platform have different public device IDs.
5. The same raw local ID under two platform strings produces different public IDs.
6. Reconnect and reboot preserve identity; clearing app/emulator identity changes it.
7. State messages cannot spoof another socket's `player_id` or `device_id`.
8. Raw identifiers never appear in normal logs, peer messages, exports, or UI.
9. QEMU and one physical ESP32-C6 exchange state through the server for five
   minutes without peer-expiry churn at the 50 ms send period.
10. Run the PRG32 repository's mandated protocol, ABI, QEMU, and ESP32-C6 checks;
    update `docs/software/framework_manual.md`, `docs/usage/network.md`, and the
    relevant protocol compatibility record in the same firmware change.
11. Build and run `examples/poing-multiplayer` from this server repository on
    three QEMU instances; the ball must traverse left-to-right across their
    ordered screens with one authority and no duplicate ball.

## Recommended implementation sequence

Implement and test welcome parsing first, then the four identity providers,
then QEMU transport enablement, UI privacy/reset affordances, and finally the
cross-platform soak test. Keep each wire change additive and coordinate
PRG32-QT and PRG-iOS releases before requiring identity on any server.
