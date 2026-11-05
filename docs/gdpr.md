# GDPR deployment and data-protection guide

The software implements privacy-by-design controls; installing it does not by
itself make an organization GDPR compliant. The deployment operator is normally
the data controller and must complete the legal and organizational work below
with qualified counsel or a data protection officer where appropriate.

## Built-in controls

- data minimization: no intentional IP storage, message bodies, coordinates,
  inputs, names, raw MAC addresses, advertising IDs, or credentials;
- keyed pseudonymization of device sources and platform separation;
- bounded configurable retention and event count;
- authenticated export (all data, or everything retained about one device for
  access and portability requests), block/unblock, and per-device erasure;
- local file permissions, no-store API responses, TLS deployment guidance;
- web pages with no cookies, analytics, or third-party resources, enforced by a
  strict Content-Security-Policy and `Referrer-Policy: no-referrer`;
- browser storage only on request: the admin token in `sessionStorage` for one
  tab (removed on sign-out) and the Day/Night choice in `localStorage` once the
  visitor uses the switch; both are disclosed in the notice;
- an Article 13/14-structured privacy notice template at `/privacy`, which
  states the configured retention automatically, and an admin-console warning
  while the template is unmodified;
- an accessibility statement template at `/accessibility`.

Device IDs remain personal data because the operator can single out a device.

## Operator checklist

1. Identify controller, processors, purposes, data subjects, and lawful basis.
2. Edit `public/privacy.md`: fill every `[bracketed]` placeholder (controller
   and DPO contacts, legal basis, recipients, hosting, transfers, complaint
   authority), then delete the `<!-- prg32:privacy-template -->` marker so the
   admin console stops warning. `{{retention_days}}` is filled in for you. In a
   container, mount the file over `/app/public/privacy.md`.
3. Sign processor agreements with hosting/logging vendors and map transfers.
4. Set the shortest necessary retention and restrict admin access by role.
5. Terminate TLS, rotate secrets, back up securely, and document incidents.
6. Define access, portability, correction, objection, restriction, and erasure
   workflows; test them using a public device ID.
7. Assess whether a DPIA is required, especially for children, education,
   systematic monitoring, public tournaments, or large-scale deployments.
8. Avoid consent unless it is freely given and withdrawable; schools and
   employers must account for power imbalance. Record the chosen lawful basis.
9. Configure infrastructure logs not to retain IPs/query strings longer than
   necessary; reverse proxies are outside this application's controls.
10. Review the implementation, notice, access list, vendors, and deletion tests
    periodically and after every purpose or schema change.

## Data-subject requests

Ask the player for the server-returned pseudonymous device ID, not a raw MAC or
IDFV. In the admin console, find the ID under **Devices and data-subject
requests**, then **Export** a JSON copy of the device record and all its retained
events (access, portability), **Block** further processing (restriction,
objection), or **Erase** the device and all retained events after confirming. Verify the requester using a
proportionate method defined by the controller; do not collect excessive new
identity evidence. Backups and external logs need matching expiry procedures.
