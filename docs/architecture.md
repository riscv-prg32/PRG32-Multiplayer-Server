# System architecture

The PRG32 Multiplayer Server is a single-process, event-driven relay with a
small persistent administrative plane. Its separation of concerns is designed
for inspectability in systems and networking courses: the cartridge owns game
semantics, each runtime owns transport adaptation, and the server owns session
authority without becoming a game engine.

![PRG32 multiplayer architecture](images/architecture-overview.svg)

## Context and trust boundaries

```mermaid
flowchart LR
  subgraph Clients[Untrusted client runtimes]
    ESP[Physical ESP32-C6]
    QEMU[PRG32 QEMU]
    QT[PRG32-QT]
    IOS[PRG32-iOS]
  end
  subgraph Edge[Deployment edge]
    TLS[TLS reverse proxy]
  end
  subgraph Server[PRG32 Multiplayer Server]
    HTTP[HTTP and WebSocket server]
    Relay[Room and relay engine]
    Identity[Identity pseudonymizer]
    Admin[Admin API and dashboard]
    Telemetry[Bounded telemetry store]
  end
  Operator[Authenticated operator]
  ESP & QEMU & QT & IOS -->|wss JSON snapshots| TLS
  TLS --> HTTP
  HTTP --> Relay
  Relay --> Identity
  Relay --> Telemetry
  Operator -->|HTTPS + bearer token| TLS
  TLS --> Admin
  Admin --> Telemetry
```

Client input is untrusted even when it originates from physical firmware. The
server validates types and ranges, binds actor identity to a WebSocket session,
and enforces room/rate limits. The administrator is a separate trust domain:
the admin token authorizes telemetry export and device-management actions but
is never accepted in WebSocket URLs.

## Runtime components

```mermaid
flowchart TB
  Config[src/config.js<br/>validated environment]
  HTTP[src/server.js<br/>HTTP, upgrade, shutdown]
  Protocol[src/protocol.js<br/>JSON schema and bounds]
  Relay[src/multiplayer.js<br/>connections, rooms, fan-out]
  ID[src/identity.js<br/>HMAC pseudonyms]
  Store[src/telemetry.js<br/>retention, export, erasure]
  Admin[src/admin.js + public/<br/>dashboard and admin API]
  Disc[src/discovery.js<br/>UDP LAN discovery]

  Config --> HTTP
  Config --> Relay
  Config --> Store
  HTTP --> Relay
  Relay --> Protocol
  Relay --> ID
  Relay --> Store
  HTTP --> Admin
  Admin --> Store
  Admin --> Relay
  HTTP --> Disc
  Config --> Disc
```

The room graph and latest connection state exist only in memory. The telemetry
event history and pseudonymous device registry persist under `/data`. This is a
deliberate consistency boundary: gameplay favors low-latency transient state;
administration requires bounded history, export, and erasure.

`src/discovery.js` is a separate UDP socket (port 8082 by default) that answers
LAN discovery queries with the WebSocket URL and broadcasts it every 2 seconds;
it keeps no state. It is described in [the protocol](protocol.md#lan-discovery).

## Join and relay sequence

```mermaid
sequenceDiagram
  participant A as Client A
  participant S as Relay server
  participant B as Client B
  A->>S: WebSocket connect
  A->>S: join(signature, platform, local device source)
  S->>S: validate, HMAC identity, allocate player ID
  S-->>A: welcome(authoritative IDs)
  B->>S: connect + join(same signature)
  S-->>B: welcome(authoritative IDs)
  loop every ~50 ms
    A->>S: state(x, y, sprite, flags, input, frame)
    S->>S: validate and bind sender to connection
    S-->>B: peer(authoritative player/device identity + state)
  end
  A-xS: disconnect
  S-->>B: leave(player_id)
```

The server does not echo state to its sender and does not replay a latest
snapshot to a new joiner. Clients rebuild peer state from live traffic and
expire silent peers locally.

## Container deployment

```mermaid
flowchart LR
  Internet((Internet/LAN)) -->|80/443| Caddy[Caddy container<br/>TLS + WebSocket proxy]
  Caddy -->|8081, internal network| App[PRG32 server container<br/>read-only, non-root]
  App --> Data[(multiplayer-data<br/>named volume)]
  Caddy --> Certs[(caddy-data<br/>certificates)]
```

The local Compose topology publishes the application directly on port 8081.
The production topology publishes only Caddy. Neither topology scales the relay
horizontally because rooms are process-local; a future distributed architecture
requires a shared membership and pub/sub backplane.

## Data lifecycle

```mermaid
flowchart LR
  Join[Validated join] --> HMAC[Keyed pseudonym]
  HMAC --> Registry[(devices.json)]
  State[Validated state] --> Minimize[Keep event type, time,<br/>pseudonym, platform, room, bytes]
  Minimize --> Events[(telemetry.jsonl)]
  Events --> Retain[Age and count retention]
  Registry & Events --> Export[Authenticated JSON/CSV export]
  Registry & Events --> Erase[Authenticated device erasure]
```

Raw local identity sources are transformed in memory and are not written to the
persistent plane. State coordinates, controller input, and message bodies are
validated for relay but excluded from telemetry. Deployment infrastructure can
still generate access logs, so proxy and hosting policies remain part of the
GDPR boundary.

## Quality attributes and limitations

- **Compatibility:** additive JSON fields and tolerant readers permit staged
  firmware, Qt, and iOS rollout.
- **Privacy:** keyed pseudonyms, minimized telemetry, bounded retention, export,
  blocking, and erasure provide privacy-by-design mechanisms.
- **Availability:** health/readiness probes, graceful shutdown, restart policy,
  and stateless gameplay simplify recovery.
- **Security:** strict field bounds, connection-bound authority, origin policy,
  rate limits, TLS edge, non-root containers, and protected admin APIs reduce
  attack surface.
- **Reproducibility:** explicit constants, deterministic test fixtures, Compose
  topology, and protocol conformance criteria support academic experiments.
- **Limitation:** one process is one room universe; there is no cross-replica
  coordination, durable match state, human authentication, or anti-cheat game
  authority.

## Web interface

The browser pages are part of the administration plane, not the player
protocol. `src/pages.js` renders a public status page (`/`), the admin console
(`/admin`), the privacy notice (`/privacy`), and the accessibility statement
(`/accessibility`) in the shared PRG32 SDK look. The admin console begins with a
token gate; the token is retained in browser `sessionStorage` only and is sent
as an authorization header to admin APIs.

![Administration login](images/admin-login.png)

After authentication, the dashboard presents live connection/room counts,
retention, historical event flux, pseudonymous devices with export, block, and
erase actions, and recent minimized events. See [Web interface](web-interface.md)
for pages, accessibility, and privacy-by-design details.

![Populated administration dashboard](images/admin-dashboard.png)
