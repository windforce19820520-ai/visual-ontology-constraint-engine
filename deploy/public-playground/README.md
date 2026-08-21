# Public Playground single-instance deployment

These files define the PR B baseline for a small Linux host behind Nginx. They do not create infrastructure, DNS, certificates, secrets, releases, or Provider calls. Replace `__VOCE_HOSTNAME__` during an authorized deployment; never commit the resulting operator-specific file.

## Safety boundary

The checked-in environment is compile-only: Seedream, Grok, Cloudflare, and Mock transports are disabled. Compile/Inspect remains available, while Generate reports that no transport is enabled. Because the current `RequestQuotaStore` is in process memory, run exactly one Node process and one server instance. Do not configure a process cluster, multiple replicas, or automatic horizontal scaling.

The service listens only on `127.0.0.1:4173`. Nginx is the sole public listener and the only trusted proxy. Port 4173 must remain closed in both the host firewall and cloud firewall. The compile-only systemd unit also denies every non-loopback network connection from Node; activating a Provider requires a separately reviewed unit and explicit authorization.

## Installation outline

1. Install a supported Node.js release (Node 22 is the deployment baseline), pnpm, Git, Nginx, Certbot, and the Nginx Certbot integration from trusted package sources.
2. Create an unprivileged `voce` service account and an immutable release directory under `/opt/voce-playground/releases/<commit-sha>`.
3. Check out the reviewed commit, run a frozen dependency install, then build and test before changing `/opt/voce-playground/current`.
4. Copy `voce-playground.env.example` to `/etc/voce-playground/voce-playground.env`, owned by root with mode `0600`. Do not add BYOK keys.
5. Install `voce-playground.service`, reload systemd, and verify that Node binds only to loopback.
6. Render `nginx-http.conf.template` with the authorized hostname, validate Nginx, obtain the certificate, then install the rendered `nginx-https.conf.template` and validate again.
7. Permit only SSH, HTTP, and HTTPS at the host and cloud firewalls. Keep SSH access constrained by the platform's administrative controls.

## Acceptance and rollback

Before exposing the route, verify `GET /healthz`, `GET /readyz`, the Playground page, Compile/Inspect, secure session cookies, the safe disabled-Generate message, request-size rejection, and sanitized logs. Confirm that no Provider request was made. Test graceful stop and start once.

Keep the previous release directory. Roll back by atomically pointing `/opt/voce-playground/current` to the previous reviewed commit, restarting the service, and repeating health/readiness checks. Do not scale beyond one process until an atomic durable quota store is implemented and reviewed.
