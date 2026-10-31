# POING multi-screen test cartridge

This integration cartridge turns all joined PRG32 devices into one horizontal
display wall. The device with the lowest authoritative player ID advances the
global ball and publishes it; every device orders the roster by player ID and
draws the ball only while it is inside that device's 320-pixel segment. It
therefore visibly bounces from one QEMU/console screen into the next while
continuously exercising server traffic and peer expiry.

It targets the firmware enhancement in
[docs/firmware-enhancement.md](../../docs/firmware-enhancement.md): networked
QEMU multiplayer plus `prg32_multiplayer_local_player_id()`. Current PRG32
`main` cannot run this test because QEMU uses an offline multiplayer stub and
the local authoritative ID is not exposed to cartridges.

After that enhancement lands:

```bash
./build.sh /path/to/PRG32 qemu
# Start three QEMU instances with separate NVS images and UART ports.
# Upload dist/poing-multiplayer-qemu.prg32 to all three, then run each cartridge.
```

Acceptance: three devices remain in the same `poing-wall-v1` room; exactly one
ball is visible; it crosses all screens in roster order; disconnecting a
non-authority screen compacts the wall; disconnecting the authority elects the
next-lowest player ID within the peer timeout.
