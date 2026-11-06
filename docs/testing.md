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
and test a physical ESP32-C6 on the same network.

`test/discovery.test.js` sends a real UDP query to a discovery socket on an
ephemeral port and checks the answer. It also checks the parser's rejection of
datagrams that are not discovery JSON, the URL chosen for the asker's network,
the broadcast address of each network, and the production default (off). On a LAN,
start the server without `DISCOVERY_PORT=0` and check that a console built with
another server URL still finds it (it shows the lobby within a few seconds).
The container image sets `NODE_ENV=production`, so discovery is off there
unless `DISCOVERY_PORT=8082` is set and the UDP port is published
(`-p 8082:8082/udp`); broadcast reaches a container only with host networking. CI repeats checks on supported
Node releases and builds/scans the container.

The full container acceptance procedure, including dashboard asset retrieval,
persistence, graceful shutdown, and Compose validation, is in
[Docker and Docker Compose deployment](docker.md#container-validation-checklist).
