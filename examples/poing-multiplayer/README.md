# POING multi-screen test cartridge

This integration cartridge turns all joined PRG32 devices into one horizontal
display wall. The device with the lowest authoritative player ID advances the
global ball and publishes it; every device orders the roster by player ID and
draws the ball only while it is inside that device's 320-pixel segment. It
therefore visibly bounces from one QEMU/console screen into the next while
continuously exercising server traffic and peer expiry.

It needs PRG32 firmware with ABI 1.7, which has networked QEMU multiplayer and
`prg32_multiplayer_local_player_id()`. The firmware repository also has a fuller
version with a takeover that keeps the ball in place, `cartridges/poingwall`, and
an automated test, `tools/multiplayer_wall_test.py`.

```bash
./build.sh /path/to/PRG32 qemu
# Start three QEMU instances: python3 -m prg32 qemu run --instance N --no-audio
# Upload dist/poing-multiplayer-qemu.prg32 to all three, then run each cartridge.
```

Acceptance: three devices remain in the same `poing-wall-v1` room; exactly one
ball is visible; it crosses all screens in roster order; disconnecting a
non-authority screen compacts the wall; disconnecting the authority elects the
next-lowest player ID within the peer timeout.
