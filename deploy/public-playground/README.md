# Public Playground single-instance deployment

These files define the PR B baseline for a small Linux host behind Nginx. They do not create infrastructure, DNS, certificates, secrets, releases, or Provider calls by themselves. Replace `__VOCE_HOSTNAME__` during an authorized deployment; never commit the resulting operator-specific file.

## Safety boundary

The checked-in environment remains compile-only as a safe source default: Seedream, Grok, Cloudflare, and Mock transports are disabled so copying the example cannot accidentally make a real call. This is not the Public Playground product contract. A normal public user-facing deployment enables all three reviewed transports after explicit authorization; compile-only operation is for development, regression, or a communicated maintenance window. Compile/Inspect remains available in every state. Because the current `RequestQuotaStore` is in process memory, run exactly one Node process and one server instance. Do not configure a process cluster, multiple replicas, or automatic horizontal scaling.

The service listens only on `127.0.0.1:4173`. Nginx is the sole public listener and the only trusted proxy. Port 4173 must remain closed in both the host firewall and cloud firewall. The compile-only systemd unit also denies every non-loopback network connection from Node. After explicit Provider authorization, install `voce-playground-provider-egress.conf` as a systemd drop-in; this clears only the unit's compile-only IP filter. Provider adapters still reject endpoints and output-download hosts outside their fixed allow-lists.

## Installation outline

1. Install a supported Node.js release (Node 22 is the deployment baseline), pnpm, Git, Nginx, Certbot, and the Nginx Certbot integration from trusted package sources.
2. Create an unprivileged `voce` service account and an immutable release directory under `/opt/voce-playground/releases/<commit-sha>`.
3. Check out the reviewed commit, run a frozen dependency install, then build and test before changing `/opt/voce-playground/current`.
4. Copy `voce-playground.env.example` to `/etc/voce-playground/voce-playground.env`, owned by root with mode `0600`. Do not add BYOK keys. A Cloudflare operator credential, when separately authorized, belongs in `/etc/voce-playground/cloudflare.env` using `cloudflare.env.example` as the shape; Seedream and Grok keys never belong in either file.
5. Install `voce-playground.service`, reload systemd, and verify that Node binds only to loopback. If real transports were separately authorized, install `voce-playground-provider-egress.conf` under `/etc/systemd/system/voce-playground.service.d/provider-egress.conf` before restart.
6. Render `nginx-http.conf.template` with the authorized hostname, validate Nginx, obtain the certificate, then install the rendered `nginx-https.conf.template` and validate again.
7. Permit only SSH, HTTP, and HTTPS at the host and cloud firewalls. Keep SSH access constrained by the platform's administrative controls.

## Acceptance and rollback

Before exposing the route, verify `GET /healthz`, `GET /readyz`, the Playground page, Compile/Inspect, secure session cookies, request-size rejection, and sanitized logs. In compile-only mode, verify the safe disabled-Generate message. In an authorized Provider-enabled deployment, verify `/api/meta` reports only the intended transports and that BYOK fields are not persisted; do not use a real key or generate an image as part of deployment acceptance unless separately authorized. Test graceful stop and start once.

Keep the previous release directory. Roll back by atomically pointing `/opt/voce-playground/current` to the previous reviewed commit, restarting the service, and repeating health/readiness checks. Do not scale beyond one process until an atomic durable quota store is implemented and reviewed.
