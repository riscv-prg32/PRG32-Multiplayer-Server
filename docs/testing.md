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
(`-p 8082:8082/udp`); broadcast reaches a container only with host networking.

`test/mdns.test.js` checks the `MDNS` defaults, the SRV port and TXT keys taken
from `DISCOVERY_URL`, and the `.local` host name. It then browses for
`_prg32mp._tcp` with a second mDNS socket on a private multicast port (not 5353)
and checks the service it finds. Last, it sends one PTR query and reads the
response the way an ESP-IDF console does (stopping at any record with no data),
and checks that the SRV target's A record is still there. A second server
with the same `MDNS_NAME` must come up as `… (2)` while the first stays
browsable. On a Mac, start the server and run
`dns-sd -B _prg32mp._tcp` and `dns-sd -L "PRG32 Multiplayer" _prg32mp._tcp local`;
the lookup shows `<host>.local.:8081`. In a container mDNS is off
(`NODE_ENV=production`); with `MDNS=on` it needs host networking, because
multicast does not cross the Docker bridge. CI repeats checks on supported
Node releases and builds/scans the container.

The full container acceptance procedure, including dashboard asset retrieval,
persistence, graceful shutdown, and Compose validation, is in
[Docker and Docker Compose deployment](docker.md#container-validation-checklist).
