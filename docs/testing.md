# Testing

`npm test` uses Node's built-in test runner. `npm run check` also performs
syntax and formatting checks. Integration tests launch the service on an
ephemeral port and use real WebSocket clients.

Before release:

```bash
npm ci
npm run check
docker build -t prg32-multiplayer-server:test .
docker run --rm \
  -e DEVICE_ID_SECRET=01234567890123456789012345678901 \
  -e ADMIN_TOKEN=abcdefghijklmnopqrstuvwxyz012345 \
  -v prg32-multiplayer-test:/data \
  -p 8081:8081 \
  prg32-multiplayer-server:test
```

Then connect two clients, confirm cross-room isolation and disconnect notices,
and test a physical ESP32-C6 on the same network. CI repeats checks on supported
Node releases and builds/scans the container.

The full container acceptance procedure, including dashboard asset retrieval,
persistence, graceful shutdown, and Compose validation, is in
[Docker and Docker Compose deployment](docker.md#container-validation-checklist).
