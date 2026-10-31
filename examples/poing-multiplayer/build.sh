#!/usr/bin/env sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${PRG32_REPO:-${1:?usage: build.sh /path/to/PRG32 [architecture]}}
ARCH=${2:-qemu}
mkdir -p "$HERE/dist"
cd "$ROOT"
python3 -m prg32 cartridge build "$HERE/poing_multiplayer.c" \
  --portable --entry-prefix poing_multiplayer --name "POING Multiplayer Wall" \
  --architecture "$ARCH" --required-feature multiplayer --multiplayer \
  --out "$HERE/dist/poing-multiplayer-$ARCH.prg32"
