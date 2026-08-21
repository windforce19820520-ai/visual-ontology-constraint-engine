# Public Playground single-instance deployment acceptance

- **Acceptance date:** 2026-08-21
- **Deployed source:** `879ec6066b1bbd379b388424b6c38658e0f3ee96`
- **Deployment shape:** one Ubuntu Node process on Tencent Cloud International Lighthouse in Tokyo, behind Nginx
- **Temporary endpoint:** `https://voce-playground.43-165-176-201.sslip.io/playground`
- **Scope:** deployment and Browser acceptance only; no Release, tag, npm publication, repository About change, stable-domain claim, or real Provider acceptance call

## Runtime and network evidence

- Node listens only on `127.0.0.1:4173`; Nginx is the public HTTP/HTTPS listener.
- The Host runs as the unprivileged `voce` service account under the reviewed single-process systemd unit.
- `/healthz` returned `{"status":"ok"}` and `/readyz` returned `{"status":"ready"}` after the bounded restart wait.
- `/api/meta` reported `renderEnabled=true`, `validationExportEnabled=false`, and reviewed transports enabled for Seedream, Grok, and Cloudflare.
- The TLS endpoint received an SSL Labs A+ grade with no warnings, TLS 1.2/1.3, and HSTS present.
- The hostname is a temporary `sslip.io` identity. It is not an owned production domain and is not advertised from the root README.

## Product-path evidence

- Compile/Inspect remained available independently of Generate credentials.
- The ordinary Provider order was Seedream recommended BYOK, Grok optional BYOK, and Cloudflare Free experimental preview.
- Seedream and Grok were shown as deployed transports without any server-stored user key; an ephemeral BYOK value is requested only for the individual Generate attempt.
- Cloudflare used the separately injected root-owned operator credential and did not expose a Browser key field.
- Virtual Try-On displayed the open `Optional refinements — Fit, Footwear, Pose, Accessories` section and the `Add accessory image` action without an extra click.
- The typed accessory role, placement, side, preservation, replacement, prompt isolation, and Provider materialization paths were exercised by deterministic tests.

## Automated evidence

- Repository validation passed for 47 required files.
- Typecheck and build passed.
- Full repository run: 214 total, 212 passed, 0 failed, and 2 Windows symlink-permission skips.
- Playground suite after the accessory-visibility correction: 94 passed, 0 failed.
- Exact deployed-commit server suite: 94 passed, 0 failed, with Mock HTTP only.
- GitHub Actions passed all five required Linux/Windows validation, offline, public-consumer, and release-candidate checks.
- No Cloudflare, Seedream, or Grok model was called during deployment acceptance. No test used a real Provider key.

## Security and privacy evidence

- Public session identity is server-issued through a Secure, HttpOnly, SameSite cookie; generated-result URLs do not contain a session identifier.
- Upload and result stores remained request/session scoped, bounded, TTL-limited, and in memory.
- Validation-package export and Mock rendering were disabled in the public environment.
- Seedream/Grok BYOK values were not stored on the server. The Cloudflare credential remained outside the repository in the root-owned deployment environment file.
- The diff and repository contained no Provider credential, personal image, Base64 payload, generated download package, or temporary output URL.

## Known limitations

- `InMemoryRequestQuotaStore` resets on process restart and is not a durable global counter. This deployment must remain exactly one process and one instance, with Provider/platform hard limits as the final protection.
- Cloudflare is a constrained free experimental preview, not the quality representative.
- Grok transport passed reviewed Mock-HTTP success and failure paths but did not receive a maintainer-run real acceptance call.
- The temporary hostname and certificate do not replace the separately authorized owned-domain, DNS, and long-term HTTPS work.
- The Cloudflare credential should be rotated if its exposure history is not acceptable; rotation remains a separately authorized operator action.
