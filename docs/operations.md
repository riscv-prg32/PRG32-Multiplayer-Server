# Operations and security

Terminate TLS, restrict browser origins, keep `DEVICE_ID_SECRET` in a secret
manager, and rotate it deliberately (rotation changes every public device ID).
The relay validates every field, limits frames/rooms/connections/message rate,
does not retain state, and times out silent clients.

Monitor `/readyz` connection and room counts. Do not expose it if topology
counts are sensitive. Logs must never include message bodies, query strings, or
raw client identifiers. Use infrastructure connection metrics for capacity.

The protocol provides identity, not authentication: a client can claim another
client's local ID. Internet tournaments should add signed short-lived join
tokens at a trusted gateway before treating identity as an account or enforcing
bans. Run one instance unless a shared room/pub-sub layer is implemented.
