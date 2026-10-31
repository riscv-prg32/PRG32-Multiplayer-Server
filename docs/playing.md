# Playing PRG32 multiplayer games

1. Start a reachable server and note its WebSocket URL.
2. Build physical firmware with `CONFIG_PRG32_MULTIPLAYER_ENABLE=y` and
   `CONFIG_PRG32_MULTIPLAYER_SERVER_URL` set. Configure Wi-Fi station mode.
3. Build a cartridge with `python3 -m prg32 cartridge build --multiplayer ...`
   or call `prg32_multiplayer_join("game-signature", PRG32_MP_FLAG_ENABLE)`.
4. Install the same cartridge build on each device. Equal signatures share a
   room; different game versions should use different signatures.
5. Start the cartridge on two or more consoles. Games call
   `prg32_multiplayer_set_input`, `prg32_multiplayer_set_local_state`, and
   `prg32_multiplayer_tick`, then render snapshots returned by
   `prg32_multiplayer_get_peer`.

QEMU's current PRG32 firmware multiplayer implementation is an offline stub.
Use `examples/client.js` to test this server until the QEMU transport sends the
documented identity envelope. PRG32-QT and PRG-iOS should implement the same
WebSocket contract and persisted IDs from [protocol.md](protocol.md).
