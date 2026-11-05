# Operations and security

Terminate TLS, restrict browser origins, keep `DEVICE_ID_SECRET` in a secret
manager, and rotate it deliberately (rotation changes every public device ID).
The relay validates every field, limits frames/rooms/connections/message rate,
does not retain state, and times out silent clients.

The public status page (`/`) and unauthenticated `GET /api/stats` endpoint
expose only current connection and room counts. Retained event totals, device aggregates, event
details, exports, and administrative actions remain behind the admin token.
Monitor `/readyz` for readiness and the same live counts. Do not expose the
service publicly if topology counts are sensitive. Logs must never include
message bodies, query strings, or raw client identifiers. Use infrastructure
connection metrics for capacity.

The HTTP routes match on the path only, so probes such as `/healthz?source=lb`
work. Request targets that cannot be parsed are answered with `400 bad_request`,
and any unexpected failure while serving a request or handling a WebSocket
message is logged (message only, never the request target or body) and
answered with `500 internal_error` or an `internal_error` WebSocket error,
instead of terminating the process for every connected room. The admin
`GET /api/admin/events?limit=N` endpoint returns the newest `N` events, where
`N` is truncated to an integer and clamped to 1–5000; missing, non-numeric, or
non-positive values use the default of 500.

Container deployments must persist `/data`, keep the root filesystem read-only,
run as the image's non-root user, and expose the application directly only on a
trusted local network. Public deployments use the TLS proxy topology documented
in [Docker and Docker Compose deployment](docker.md). Backups inherit the same
personal-data classification and retention duties as the live volume.

The protocol provides identity, not authentication: a client can claim another
client's local ID. Internet tournaments should add signed short-lived join
tokens at a trusted gateway before treating identity as an account or enforcing
bans. Run one instance unless a shared room/pub-sub layer is implemented.
