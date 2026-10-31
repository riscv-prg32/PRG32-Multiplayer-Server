# Getting started

Install Node.js 22+, clone this repository, run `npm ci`, copy `.env.example`
to `.env`, choose a secret, and run `npm start`. Check `/healthz`, then point a
PRG32 client at `ws://SERVER:8081` and join the same cartridge signature from
two devices. For a local smoke test, run two copies of `npm run example:client`.

Read [installation](installation.md) for platform details,
[configuration](configuration.md) before exposing the service, and
[playing](playing.md) for console/game setup.
