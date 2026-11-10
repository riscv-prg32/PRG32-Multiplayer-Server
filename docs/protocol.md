# PRG32 multiplayer protocol and device identity

## Abstract

This document specifies the application-layer protocol used by PRG32 consoles,
emulators, and companion applications to exchange multiplayer state through the
PRG32 Multiplayer Server. The protocol is intentionally small: a client joins a
room identified by a cartridge signature, periodically publishes a bounded
snapshot, receives snapshots from its peers, and explicitly or implicitly
leaves the room.

The design serves two related purposes. First, it provides a stable wire
contract that can be implemented independently by the ESP32-C6 firmware,
PRG32-QT, and PRG32-iOS. Second, it preserves the educational character of
PRG32: transport mechanics remain visible and understandable, while session
authority, validation, privacy, and failure behavior are defined precisely
enough for reproducible experiments.

The current protocol identifier is `prg32-multiplayer-1.0`.

## Status and normative language

This document is the normative cross-platform wire reference for the server.
The implementation-specific plan in
[firmware-enhancement.md](firmware-enhancement.md) describes how the present
PRG32 firmware can adopt the identity extension and networked QEMU transport.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** are to be interpreted as requirement levels. Explanatory paragraphs
and examples do not override the field tables or normative requirements.

Protocol changes within version 1.0 MUST be additive. Receivers MUST ignore
unknown object members. Removing a field, changing its meaning, changing a
numeric range, or reusing a message type incompatibly requires a new protocol
identifier.

## Architectural model

The system consists of three conceptual layers:

1. The **cartridge** owns game rules and decides what the numeric snapshot
   fields mean.
2. The **client runtime** owns the WebSocket connection, device identity,
   reconnection, serialization, and the mapping between messages and the PRG32
   multiplayer API.
3. The **relay server** owns admission, room membership, authoritative session
   player IDs, validation, rate limits, and fan-out to other room members.

The server is a relay, not a game simulation authority. It does not reconcile
physics, retain the latest game state, or replay missed snapshots. A cartridge
that requires deterministic lockstep, rollback, durable matches, or protection
against malicious game-state claims must define a higher-level protocol on top
of this snapshot service.

Rooms are volatile sets keyed by cartridge signature. A room is created by its
first successful join and removed when its final connection leaves. Two clients
can exchange state if and only if both have successfully joined the same exact
signature.

## Transport

Clients MUST use a WebSocket connection over TCP. Public deployments MUST use
TLS (`wss://`); unencrypted `ws://` is appropriate only for controlled local
networks and development.

Each application message MUST be one WebSocket text message containing one
UTF-8 JSON object. WebSocket implementations may fragment and reassemble that
message at the transport-frame layer; application code MUST NOT split one JSON
object across multiple WebSocket messages. Binary messages, arrays, JSON
primitives, and concatenated objects are not part of the protocol. The server
accepts at most 1,024 bytes per message by default; operators may lower or raise
that bound. Client messages SHOULD remain comfortably below 1,024 bytes for
portable deployment.

WebSocket/TCP provides reliable, ordered delivery within one connection. It
does not provide continuity across reconnection. Clients MUST treat a new
WebSocket as a new session, send `join` again, and rebuild their peer view from
subsequent traffic. Clients MUST NOT assume that the server retained snapshots
or room membership while disconnected.

The server's default client rate limit is 40 messages per second. The reference
firmware publishes at 20 snapshots per second (a 50 ms interval), leaving
capacity for control traffic. Implementations SHOULD use that interval unless a
cartridge has a measured reason to choose a lower rate. They MUST NOT exceed the
configured server limit.

## Identifiers and authority domains

The protocol deliberately distinguishes four identifiers that answer different
questions.

| Identifier                  | Assigned by                                     | Lifetime                                                      | Purpose                                              |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `signature`                 | cartridge/toolchain                             | cartridge version or compatibility domain                     | isolates rooms and incompatible games                |
| local `device_id` in `join` | client installation                             | installation or physical device                               | supplies stable source material for pseudonymization |
| returned `device_id`        | server                                          | stable while the server secret and local source remain stable | privacy-preserving device management and analysis    |
| `connection_id`             | server                                          | one WebSocket connection                                      | distinguishes concurrent sessions from one device    |
| `player_id`                 | server, with a collision-free client preference | one joined connection                                         | addresses the game actor visible to cartridges       |

These identifiers MUST NOT be substituted for one another. In particular,
`player_id` is not a persistent device identifier, and a raw local `device_id`
is not suitable for display, logging, analytics, or peer messages.

### Cartridge signature

`signature` MUST be a JSON string of 1–47 ASCII characters from `A–Z`, `a–z`, `0–9`, `_`,
`-`, `.`, and `:`. It is compared as an exact, case-sensitive string; numbers, booleans, arrays,
and objects are rejected with `invalid_signature` even when their text form
would match the grammar.

A signature denotes network compatibility, not merely a marketing title.
Cartridge maintainers SHOULD change it when two builds no longer interpret the
snapshot fields identically. A useful convention is `<game>:<protocol-version>`
or a stable build signature produced by the cartridge toolchain.

### Platform-scoped device identity

A modern client MUST send a `platform` value and a stable local `device_id` in
its `join`. The local value is source material, not the public identifier. The
server derives the public value as:

```text
base64url(HMAC-SHA-256(DEVICE_ID_SECRET, platform || NUL || local_device_id))[0:22]
```

The HMAC prevents exports, dashboards, peers, and ordinary logs from revealing
the source identifier. Including the platform and a NUL separator prevents the
same textual source value on different runtime families from producing the same
pseudonym. The 22-character truncation retains 132 bits of output.

Pseudonymization is not anonymization. The returned identifier remains personal
data when it permits a controller to single out a device. Implementations and
deployments MUST follow [the GDPR guide](gdpr.md).

| Runtime           | `platform` | REQUIRED local source                                                   | Persistence and reset semantics                                            |
| ----------------- | ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Physical ESP32-C6 | `esp32c6`  | factory base MAC encoded as exactly 12 lowercase hexadecimal characters | stable for the board; MUST NOT be shown or logged in raw form              |
| Espressif QEMU    | `qemu`     | cryptographically random UUID created for the emulator installation     | persist in dedicated NVS; clearing the installation creates a new identity |
| PRG32-QT          | `prg32-qt` | cryptographically random UUID created by the application                | persist in `QSettings`; a user identity reset creates a new value          |
| PRG32-iOS         | `prg-ios`  | cryptographically random UUID created by the application                | persist as an app-scoped Keychain item; MUST NOT use IDFA                  |

PRG32-iOS MAY use an existing IDFV once as local migration input, but it SHOULD
create and retain an independent Keychain UUID and MUST NOT transmit or retain
IDFV afterward. PRG32-QT MUST NOT derive identity from a host MAC address,
machine name, login name, disk serial, or another cross-application identifier.
Cloned QEMU images MUST receive distinct installation UUIDs before concurrent
use.

A legacy client may omit `platform` and `device_id`. The server then creates a
connection-only pseudonym, reports platform `unknown`, and returns
`persistent_device_id: false`. New implementations MUST NOT rely on this
fallback.

### Connection and player identity

The server generates a fresh UUID `connection_id` for every accepted join. Two
simultaneous connections from one installation consequently have the same
public `device_id` but different `connection_id` values.

A client MAY request a nonzero unsigned 32-bit `player_id`. This preserves the
behavior of current ESP32-C6 firmware, which begins with a random ID. The server
accepts the preference only if it is unused in the room; otherwise it allocates
a different nonzero ID. The `player_id` in `welcome` is authoritative.

After receiving `welcome`, a runtime MUST replace its provisional player ID
with the returned value. It MUST associate every later local snapshot with the
connection rather than trusting an ID supplied by cartridge code. A cartridge
API that exposes the local player ID MUST return zero until `welcome` has been
processed.

## Connection lifecycle

A conforming runtime implements the following state machine:

```text
DISCONNECTED
    | open WebSocket
    v
CONNECTED_UNJOINED
    | send join
    v
JOIN_PENDING
    | welcome                  | error / close
    v                          v
JOINED -----------------> DISCONNECTED
    | leave
    v
CONNECTED_UNJOINED
```

`join` and `ping` are meaningful before a successful join; `leave` is also
accepted as an idempotent no-op. Sending `state` before joining produces
`join_required`. A second valid `join` moves the same connection to the new
signature: the old membership is removed before the new room is entered, and
the members of the old room receive the same `leave` notification they would
see if the connection had sent `leave` or closed. This also applies when the
new `join` fails (for example `room_full`): the connection ends up unjoined.

A client enters `JOINED` only after receiving `welcome`. The firmware MAY queue
one latest local snapshot while `JOIN_PENDING`, but MUST NOT transmit it until
welcome arrives. On any socket close or transport error, the runtime MUST clear
its peer table, mark the session unjoined, and initiate its bounded reconnection
policy if the cartridge still requests membership.

Reconnect backoff SHOULD include jitter and SHOULD grow to avoid a synchronized
classroom reconnection storm. After reconnecting, the client sends a new `join`;
it MUST NOT reuse the old `connection_id`. It MAY request the previous
`player_id`, but must accept the authoritative replacement in `welcome`.

## Message envelope and common rules

Every message has a string member `type`. Integers are JSON numbers whose value
must be an exact integer in the stated range. Numeric strings, `null`, booleans,
floating-point values, infinities, and values outside the range are invalid.

Receivers MUST ignore unknown members. Senders SHOULD omit fields they do not
implement rather than transmitting `null`. Strings are case-sensitive unless a
field explicitly says otherwise.

### Client-to-server: `join`

`join` requests membership and supplies the identity source.

| Field       | Presence                    | Type/range                              | Meaning                                      |
| ----------- | --------------------------- | --------------------------------------- | -------------------------------------------- |
| `type`      | REQUIRED                    | string `join`                           | message discriminator                        |
| `signature` | REQUIRED                    | signature grammar above                 | target compatibility room                    |
| `flags`     | OPTIONAL                    | integer `0…4,294,967,295`               | cartridge/runtime feature flags; default `0` |
| `player_id` | OPTIONAL                    | integer `1…4,294,967,295`               | preferred session actor ID                   |
| `protocol`  | RECOMMENDED                 | string `prg32-multiplayer-1.0`          | diagnostic/version declaration               |
| `platform`  | REQUIRED for modern clients | one registered platform string          | runtime family                               |
| `device_id` | REQUIRED for modern clients | nonempty string, at most 128 characters | stable local identity source                 |

Example:

```json
{
  "type": "join",
  "signature": "poing-wall:v1",
  "flags": 1,
  "player_id": 2718281828,
  "protocol": "prg32-multiplayer-1.0",
  "platform": "qemu",
  "device_id": "d3b07384-d9a0-4c2c-8a58-57f7b70b77e6"
}
```

The server currently normalizes an unregistered `platform` to `unknown` rather
than rejecting the join. Implementers MUST use a registered value; future
protocol versions may make this validation strict.

### Server-to-client: `welcome`

`welcome` confirms room membership and communicates authoritative identity.

| Field                  | Presence | Type/range                    | Meaning                                     |
| ---------------------- | -------- | ----------------------------- | ------------------------------------------- |
| `type`                 | REQUIRED | string `welcome`              | message discriminator                       |
| `protocol`             | REQUIRED | protocol identifier           | server wire version                         |
| `player_id`            | REQUIRED | integer `1…4,294,967,295`     | authoritative actor ID                      |
| `connection_id`        | REQUIRED | UUID string                   | this socket's session identity              |
| `device_id`            | REQUIRED | 22-character base64url string | server pseudonym                            |
| `platform`             | REQUIRED | registered value or `unknown` | normalized runtime family                   |
| `persistent_device_id` | REQUIRED | boolean                       | whether stable source material was supplied |

Example:

```json
{
  "type": "welcome",
  "protocol": "prg32-multiplayer-1.0",
  "player_id": 2718281828,
  "connection_id": "00c799e6-d5e7-4db5-a816-a4a24912bc35",
  "device_id": "T_3fYx-w5Qd3P2vHaZJ9cA",
  "platform": "qemu",
  "persistent_device_id": true
}
```

For staged rollout, new clients MUST also accept the legacy welcome shape that
contains only `type` and `player_id`. Missing extended fields mean that identity
management is unavailable; they do not invalidate the gameplay session.

### Client-to-server: `state`

`state` publishes the sender's latest bounded gameplay snapshot.

| Field       | Presence               | Type/range                | Meaning                                        |
| ----------- | ---------------------- | ------------------------- | ---------------------------------------------- |
| `type`      | REQUIRED               | string `state`            | message discriminator                          |
| `player_id` | OPTIONAL and untrusted | unsigned 32-bit integer   | legacy diagnostic value; ignored for authority |
| `x`         | REQUIRED               | integer `-32,768…32,767`  | cartridge-defined horizontal state             |
| `y`         | REQUIRED               | integer `-32,768…32,767`  | cartridge-defined vertical state               |
| `sprite`    | REQUIRED               | integer `0…65,535`        | cartridge-defined visual/state selector        |
| `flags`     | REQUIRED               | integer `0…65,535`        | cartridge-defined bit field                    |
| `input`     | REQUIRED               | integer `0…127`           | PRG32 controller mask (`UP` through `START`)   |
| `frame`     | REQUIRED               | integer `0…4,294,967,295` | sender's monotonically advancing frame counter |

Example:

```json
{
  "type": "state",
  "player_id": 2718281828,
  "x": 148,
  "y": 91,
  "sprite": 3,
  "flags": 1,
  "input": 16,
  "frame": 9402
}
```

The server derives the sender from the WebSocket session and ignores the
claimed `player_id`. This invariant prevents one connection from impersonating
another actor merely by changing a JSON field. The server validates the
snapshot, records minimized traffic metadata, and relays it to every other
connection in the room. It does not echo the snapshot to the sender.

The `frame` counter supports stale-snapshot rejection and measurements; it does
not establish global time. Receivers SHOULD compare frame values using unsigned
32-bit wraparound semantics and SHOULD reject a snapshot that is older than the
latest accepted frame from that peer. Cartridges remain responsible for
interpolation, extrapolation, and conflict resolution.

### Server-to-client: `peer`

`peer` is the validated relay form of `state`. It contains all required state
fields plus server-bound identity:

| Additional field | Presence | Meaning                            |
| ---------------- | -------- | ---------------------------------- |
| `player_id`      | REQUIRED | authoritative sender actor ID      |
| `device_id`      | REQUIRED | sender's server pseudonym          |
| `platform`       | REQUIRED | sender's normalized runtime family |

Clients MUST key their volatile peer table by `player_id`, not by array order,
IP address, platform, or `device_id`. The public device ID is supplied for
administrative/user-facing identity and cross-connection analysis; it MUST NOT
silently merge two concurrent players from one device.

Receiving the first `peer` for an unknown player creates that peer. A later
message replaces its snapshot and refreshes its last-seen time. The reference
runtime expires a peer after 3,000 ms without a snapshot. Implementations SHOULD
use the same timeout so gameplay behavior is comparable across platforms.

### Bidirectional control: `leave`

A client may send:

```json
{ "type": "leave" }
```

The server removes that connection from its room but keeps the WebSocket open.
Other members receive:

```json
{ "type": "leave", "player_id": 2718281828 }
```

Clients MUST remove the named player promptly. Closing a joined WebSocket has
the same room-membership effect and causes the server to broadcast `leave`.
`leave` is advisory cleanup; peer timeout remains the safety mechanism for
abrupt network failure where a notification cannot be observed.

### Liveness: `ping` and `pong`

An application-level `{ "type": "ping" }` receives:

```json
{ "type": "pong", "time": 1793456789012 }
```

`time` is the server's Unix epoch time in milliseconds and is diagnostic only.
It MUST NOT be treated as synchronized game time. WebSocket control-frame
ping/pong may additionally be used by network infrastructure; it is separate
from this JSON message.

### Server-to-client: `error`

Errors have the form:

```json
{ "type": "error", "code": "invalid_signature" }
```

Defined codes include:

| Code                                                                                          | Meaning                                      | Typical client action                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `invalid_json`                                                                                | frame is not valid JSON                      | fix serializer; do not retry unchanged               |
| `invalid_message`                                                                             | JSON value is not an object                  | fix serializer                                       |
| `unknown_type`                                                                                | unsupported `type`                           | negotiate/use supported protocol                     |
| `message_too_large`                                                                           | configured size limit exceeded               | reduce payload                                       |
| `invalid_signature`                                                                           | signature grammar failed                     | fix cartridge metadata                               |
| `invalid_player_id`, `invalid_flags`, `invalid_device_id`                                     | join field failed validation                 | fix identity/join construction                       |
| `invalid_x`, `invalid_y`, `invalid_sprite`, `invalid_flags`, `invalid_input`, `invalid_frame` | state field failed validation                | clamp or fix ABI mapping                             |
| `join_required`                                                                               | state arrived before welcome/join            | restore lifecycle sequencing                         |
| `room_full`                                                                                   | room reached its configured capacity         | inform user or retry later                           |
| `device_blocked`                                                                              | administrator denied the pseudonymous device | stop automatic reconnect and inform user             |
| `rate_limited`                                                                                | message rate exceeded policy                 | back off; connection is closed with policy code 1008 |
| `internal_error`                                                                              | server failed while handling the message     | retry later with backoff; connection stays open      |
| `binary_not_supported`                                                                        | client sent a binary frame                   | use UTF-8 text JSON                                  |

Validation errors ordinarily reject only the message so a client can recover.
Policy violations such as rate limiting or blocking may close the WebSocket.
Clients MUST NOT reconnect immediately and indefinitely after a policy error.

## LAN discovery

Discovery is optional and additive: it does not change the WebSocket protocol,
and a client that knows its server URL never needs it. It lets a console on a
local network find a server whose address was not compiled in.

A client sends a UDP datagram to the broadcast address `255.255.255.255`, port
8082 (`DISCOVERY_PORT`):

```json
{ "type": "discover", "protocol": "prg32-multiplayer-1.0" }
```

The server answers the sender's address and port with:

```json
{
  "type": "server",
  "protocol": "prg32-multiplayer-1.0",
  "url": "ws://192.168.1.77:8081"
}
```

The URL uses the server's address on the network the query came from, unless
`DISCOVERY_URL` sets one. The server also broadcasts the same `server` message
on each of its IPv4 networks every `DISCOVERY_INTERVAL_MS`, so a client that only
listens on port 8082 finds it too.

Rules:

- Datagrams are UTF-8 JSON objects of at most 512 bytes. Anything else, another
  `type`, or another `protocol` is ignored without an answer.
- A client MUST accept only `type` `server`, its own `protocol`, and a printable
  `ws://` or `wss://` URL that fits its buffer; it then connects and joins as
  usual. The answer is unauthenticated: on an untrusted network, compile the URL
  in and do not use discovery.
- The server logs no discovery datagram and stores nothing about the sender.
- PRG32 firmware queries every 2 seconds only while a cartridge has asked for a
  room and the client has been disconnected for at least 3 seconds.

## mDNS advertising

The server also advertises itself with multicast DNS service discovery
(RFC 6762, RFC 6763). Like LAN discovery it is optional and additive. The
records are:

| Record | Name                                    | Data                                             |
| ------ | --------------------------------------- | ------------------------------------------------ |
| PTR    | `_prg32mp._tcp.local`                   | `PRG32 Multiplayer._prg32mp._tcp.local`          |
| SRV    | `PRG32 Multiplayer._prg32mp._tcp.local` | `<host>.local`, port 8081 (`PORT`)               |
| TXT    | `PRG32 Multiplayer._prg32mp._tcp.local` | optional `scheme=ws\|wss` and `path=/…`          |
| A      | `<host>.local`                          | each of the server's non-loopback IPv4 addresses |

A client builds the URL `<scheme>://<address>:<port><path>` from the first IPv4
address, the SRV port, and the TXT keys. `scheme` defaults to `ws` and `path` to
`/`, so the server sends them only when `DISCOVERY_URL` needs them; that URL
also sets the SRV port (443 for `wss://` without a port). `MDNS_NAME` sets the
instance name, and `MDNS=off` turns advertising off.

Rules:

- A client MUST accept only `scheme` `ws` or `wss` and a printable `path` that
  starts with `/` and fits its buffer, then connects and joins as usual.
- The answer is unauthenticated, as for LAN discovery: on an untrusted network,
  compile the URL in.
- The server answers mDNS queries only; it logs none and stores nothing about
  the asker.
- PRG32 firmware on ESP32-C6 queries every 6 seconds, under the same conditions
  as LAN discovery, and takes the first answer from either.

## Runtime implementation profiles

All runtimes share the wire contract, but their integration boundaries differ.

### ESP32-C6 firmware

The firmware SHOULD keep transport ownership inside the resident PRG32 runtime,
not in cartridge memory. It obtains the factory base MAC once, serializes the
extended join into a statically bounded buffer, parses welcome before exposing
availability, and updates the existing `prg32_player_state_t` peer table under
the multiplayer mutex.

JSON parsing MUST validate types before numeric conversion. Event callbacks
MUST copy WebSocket data using the supplied length rather than assume NUL
termination. Buffer sizes MUST be derived from maximum field lengths and every
`snprintf` result checked for truncation. Identity source material MUST NOT be
written to logs.

The cartridge-facing ABI SHOULD remain snapshot-oriented. The proposed
append-only `prg32_multiplayer_local_player_id()` returns the welcome ID or zero
before admission, enabling deterministic authority election such as the POING
multi-screen demonstration.

### QEMU firmware

QEMU SHOULD execute the same transport code and cartridge ABI as ESP32-C6. Its
installation UUID belongs in dedicated emulated NVS rather than in the firmware
image. Classroom images cloned from one template require first-boot UUID
generation or explicit identity injection so multiple instances do not appear
as one device.

The emulator network configuration must make the server reachable. An offline
stub may remain as an explicit deterministic-test profile, but it MUST NOT be
reported as real network multiplayer. Tests must use separate NVS images,
separate device-protocol endpoints, and one shared cartridge signature.

### PRG32-QT

PRG32-QT SHOULD model the lifecycle explicitly with Qt socket signals rather
than infer admission from TCP connection alone. The installation UUID is read
from `QSettings` and created with `QUuid::createUuid()` when absent. Incoming
JSON numbers must be checked for integral value and range before narrowing to C
or C++ integer types.

Socket callbacks SHOULD marshal peer-table changes onto the owning thread. The
UI SHOULD show connection state, the server-returned public device ID, and a
deliberate installation-identity reset action. Resetting identity while joined
requires leaving, deleting the local UUID, creating a replacement, and joining
again; it does not change a server secret or erase historical data by itself.

### PRG32-iOS

PRG32-iOS SHOULD use `URLSessionWebSocketTask` (or its maintained equivalent),
encode/decode explicit `Codable` message structures, and serialize peer-table
mutation through one actor or dispatch queue. A random installation UUID must
be stored as an app-scoped Keychain generic-password item with an accessibility
class appropriate to the application's threat model.

The application MUST NOT use IDFA. It SHOULD avoid platform APIs that imply
cross-app tracking. Network loss, background suspension, and foreground resume
must pass through the same lifecycle: invalidate stale membership, clear peers,
reconnect when policy permits, send join, and await welcome before publishing.
The UI must expose the public device ID and the operator's privacy notice.

## Security and privacy properties

The server establishes session authority but does not authenticate a human or
prove ownership of a local identity source. A modified client can claim another
client's raw source if it learns it, publish dishonest coordinates, or automate
input. Therefore the base protocol is appropriate for classrooms, cooperative
games, experiments, and trusted local competitions. Adversarial tournaments
require an additive authenticated admission mechanism, such as server-verified
short-lived join tokens.

The following invariants are REQUIRED:

- the server, not a state payload, determines authoritative `player_id`;
- raw local identity sources never appear in peer messages, exports, ordinary
  logs, or the administration interface;
- admin credentials never travel in WebSocket query strings;
- public deployments use TLS and protect the administration API separately;
- client implementations do not add SSID, IP address, user name, host name,
  board serial, advertising identifier, or unrelated device attributes;
- new telemetry fields have an explicit purpose, lawful basis, retention
  period, export path, and erasure path before collection begins.

## Compatibility and evolution

The server accepts the original PRG32 join shape containing only `signature`,
`flags`, and `player_id`. New clients accept the original welcome shape. This
two-way tolerance permits a staged migration:

1. deploy the identity-aware server;
2. update clients to send identity and parse extended welcome;
3. expose the public ID and privacy controls in client UIs;
4. measure adoption through `persistent_device_id` without rejecting legacy
   firmware;
5. require modern identity only in a future, explicitly versioned policy.

New optional message members may be added within 1.0 when older receivers can
safely ignore them. A capability that changes state interpretation SHOULD use a
new cartridge signature even if the transport protocol remains 1.0. A change
to framing, required fields, type meaning, or numeric ranges requires a new
protocol identifier and a documented coexistence strategy.

## Conformance requirements

An implementation is conforming when it demonstrates all of the following:

1. It connects with WebSocket text frames and rejects or ignores malformed
   messages without memory corruption or undefined narrowing conversions.
2. It sends the registered platform and correct stable identity source, and it
   never displays or logs that raw source.
3. It waits for welcome, adopts the authoritative player ID, and clears peers
   on disconnect.
4. It publishes all required bounded state fields no faster than policy allows.
5. It keys peers by player ID, applies unsigned frame ordering, processes leave,
   and expires silent peers after approximately three seconds.
6. Reconnection creates a new connection identity and repeats join without
   assuming retained state.
7. Legacy join/welcome shapes remain interoperable during migration.
8. Two connections from one installation receive equal public device IDs and
   different connection IDs.
9. Two installations of every platform receive different public device IDs.
10. A client cannot impersonate another room member by changing the
    `player_id` in `state`.
11. ESP32-C6, QEMU, PRG32-QT, and PRG32-iOS can join one test signature and
    exchange equivalent snapshots.
12. The three-QEMU POING wall test maintains one simulation authority and one
    ball across screen boundaries without duplicate ownership or peer churn.

Protocol conformance tests SHOULD record client version, server version,
platform, send interval, duration, reconnect events, validation errors, and
peer-expiry observations. This makes results suitable for regression analysis
and academic reproduction rather than relying only on a visual demonstration.

## Reference constants

| Constant                        |                              Value |
| ------------------------------- | ---------------------------------: |
| Protocol identifier             |            `prg32-multiplayer-1.0` |
| Default state interval          |                              50 ms |
| Default peer timeout            |                           3,000 ms |
| Default idle connection timeout |                          15,000 ms |
| Default maximum message size    |                        1,024 bytes |
| Default maximum client rate     |                 40 messages/second |
| Signature maximum               |                47 ASCII characters |
| Device source maximum           |                     128 characters |
| Public device pseudonym         | 22 base64url characters (132 bits) |
| Maximum firmware peers          |                                  8 |
| Controller input mask           |                   7 bits (`0…127`) |
| LAN discovery port (UDP)        |                             `8082` |
| Discovery datagram maximum      |                          512 bytes |
| mDNS service type               |                    `_prg32mp._tcp` |

## Implementation companion documents

- [Firmware enhancement specification](firmware-enhancement.md) translates
  this contract into concrete changes for PRG32 firmware and companion clients.
- [GDPR deployment guide](gdpr.md) covers controller obligations and
  data-subject workflows.
- [Configuration and deployment](configuration.md) defines server limits and
  public deployment requirements.
- [POING multiplayer wall](../examples/poing-multiplayer/README.md) is the
  cross-device visual integration test.
