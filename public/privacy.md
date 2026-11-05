<!-- prg32:privacy-template -->
<!--
  This is the shipped template. Replace every [bracketed] placeholder, check each
  section with your data protection officer or counsel, and delete the
  prg32:privacy-template marker above: the admin console warns until you do.
  See docs/gdpr.md. Supported formatting: # headings, paragraphs, - lists,
  1. lists, **bold**, `code`, and [links](https://example.org).
  {{retention_days}} is replaced with the configured TELEMETRY_RETENTION_DAYS.
-->

# Privacy notice

This notice explains how the PRG32 multiplayer server operated by
**[controller name]** processes personal data, as required by Articles 13 and 14
of the EU General Data Protection Regulation (GDPR).

Last updated: [date].

## Who is responsible

- Controller: [legal name, postal address]
- Contact for privacy questions and requests: [email address or web form]
- Data protection officer: [name or role, contact], if one is appointed

## What we process

When a console, emulator, or app connects to play, the server processes:

- a **pseudonymous device ID**, derived on the server with a secret key from the
  identifier your client sends. The raw MAC address, IDFV, or installation ID is
  never stored or logged;
- the client **platform** (for example `esp32c6`, `qemu`, `ios`, `qt`);
- the **room**, which is the signature of the cartridge being played;
- **connection times** and **message sizes in bytes**;
- operational **event types** such as join, leave, rejected, blocked.

We do **not** store IP addresses, names, e-mail addresses, advertising
identifiers, game positions, button inputs, or message contents. Game state is
relayed to the other players in the room and immediately discarded.

The public status page shows only aggregate counts of connections and rooms.

## Why, and on what legal basis

- To run multiplayer sessions and relay game state between players.
- To keep the service secure and available: rate limiting, abuse prevention,
  blocking misbehaving devices.
- To produce aggregate statistics about service use.

Legal basis: [choose and justify, for example Article 6(1)(e) public task for a
university or school, or Article 6(1)(f) legitimate interests, with the balancing
test documented]. We do not rely on consent for this processing.

Providing the data is necessary to use online multiplayer; you can always play
cartridges offline without connecting.

## Who receives the data

Administrators of this server, authorized by [controller], can see the
telemetry. Hosting is provided by [hosting provider, location] under a data
processing agreement. Data is not sold and not shared with advertisers.

International transfers: [none, or the destination and the safeguard used, for
example an adequacy decision or standard contractual clauses].

## How long we keep it

Telemetry events are deleted automatically after **{{retention_days}} days**, or
earlier when the configured event limit is reached. Erasing a device removes its
record and all of its events at once. Backups follow [backup expiry policy].

## Your rights

You have the right to access, rectify, and erase your data, to restrict or
object to processing, and to data portability. To exercise them, contact
[contact] and give the **public device ID** your client shows. We will not ask
for your MAC address or other raw identifiers. We answer within one month.

You also have the right to lodge a complaint with a supervisory authority, in
particular in your country of residence. Our lead authority is [authority name,
website].

There is no automated decision-making or profiling with legal or similarly
significant effects.

## Data stored in your browser

These web pages set **no cookies** and load **no third-party resources**, fonts,
analytics, or trackers, so nothing needs your consent.

- If you choose Day or Night with the switch in the menu bar, that choice is
  saved in your browser's local storage under `prg32-theme`. If you never use the
  switch, nothing is stored. Switch back to your system setting to remove it.
- Administrators who sign in have their admin token kept in session storage under
  `prg32-admin-token` for that browser tab only. It is removed on sign-out or when
  the tab is closed.

## Changes

We will update this notice when processing changes and show the date of the
latest version above.
