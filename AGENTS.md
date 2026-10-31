# PRG32 Multiplayer Server Agent Guide

Prefer explicit, readable code and standard Node.js APIs. `src/server.js` wires
HTTP and WebSocket services; `src/multiplayer.js` owns rooms;
`src/protocol.js` validates the wire format; and `src/identity.js` owns private
device identity. Tests use `node:test`.

Legacy `join`, `state`, and `leave` messages are public API. Changes must be
additive unless a new protocol version is introduced. Never log raw MAC, IDFV,
installation IDs, tokens, or query strings. Update relevant `docs/` content
with behavior changes. Before committing run `npm ci`, `npm run check`,
`docker build -t prg32-multiplayer-server:test .`, and `git diff --check`.
