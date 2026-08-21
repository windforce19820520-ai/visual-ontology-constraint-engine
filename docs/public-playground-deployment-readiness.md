# Public Playground deployment readiness

PR A prepares the Playground Host for a later, separately authorized public deployment. It does not create a cloud service, domain, DNS record, TLS certificate, GitHub Secret, npm publication, Release, or tag.

## Runtime modes

Local mode is the default: `PLAYGROUND_PUBLIC_MODE=0`, `PLAYGROUND_HOST=127.0.0.1`, `PLAYGROUND_PORT=4173`, external scheme `http`, and a non-`Secure` HttpOnly `SameSite=Strict` session cookie. This exception exists only because loopback development does not normally terminate TLS.

Public mode must be explicit. The Host refuses to start unless all of the following are true:

- `PLAYGROUND_PUBLIC_MODE=1` and `PLAYGROUND_BEHIND_REVERSE_PROXY=1` are set;
- `PLAYGROUND_HOST` is an intentional bind address; the PR B single-host baseline uses loopback so the Node port is never public;
- `PLAYGROUND_EXTERNAL_SCHEME=https` confirms TLS termination outside this process;
- development Mock rendering and validation-package export are disabled;
- `PLAYGROUND_SINGLE_INSTANCE=1` and `PLAYGROUND_PROVIDER_HARD_LIMITS_CONFIRMED=1` acknowledge the current quota durability boundary; and
- per-session, per-client, daily, concurrency, and per-Provider limits are explicitly supplied.

The process reads `PLAYGROUND_HOST` and `PLAYGROUND_PORT`, exposes `GET /healthz` and `GET /readyz`, and closes idle connections and clears all request-scoped in-memory uploads/results on `SIGINT`, `SIGTERM`, or normal server close.

## Reverse proxy contract

PR A does not configure a proxy or HTTPS. PR B supplies reviewed generic Nginx and systemd templates in [`deploy/public-playground`](../deploy/public-playground/README.md). An authorized deployment must render the hostname outside source control, terminate HTTPS, preserve same-origin routing, set a request-body limit no larger than `PLAYGROUND_REQUEST_BODY_LIMIT_BYTES` (default `20,100,000` bytes), disable proxy request buffering and request/response body logging, and avoid caching `/api/*` responses. The server enforces the same body ceiling independently.

Forwarded client IP headers are ignored by default. `PLAYGROUND_TRUST_PROXY=1` is valid only when reverse-proxy mode is explicit and a non-empty `PLAYGROUND_TRUSTED_PROXY_CIDRS` allow-list is supplied. The Host uses the first forwarded address only when the immediate socket peer matches that list. The single-host template trusts only `127.0.0.1/32`; it must never be broadened to a public network.

Generated images are served from an opaque same-origin path and authorized by the HttpOnly session cookie. Session identifiers never appear in query parameters. Public cookies are `Secure`, `HttpOnly`, `SameSite=Strict`, host-only, and scoped to `/`.

## Capacity and quota boundary

Uploads allow PNG, JPEG, and WebP only after MIME, signature, byte, decoded-dimension, and 40 megapixel checks. Privacy-bearing PNG/JPEG/WebP metadata is removed before hashing or retention. Default request-scoped upload TTL is 15 minutes. The in-memory upload store defaults to 12 items/32 MB per session and 64 items/128 MB globally.

Generated results default to a 15-minute TTL, four items per session, 32 items/128 MB globally. A worst-case 50 MB result reservation is checked before a real Provider call; capacity exhaustion therefore rejects before transport. Generation completion always releases request uploads and the ephemeral BYOK value. Session deletion and process shutdown clear both stores.

`RequestQuotaStore` is the storage interface for per-session, trusted-client, Provider-rate, global-concurrency, and daily-call accounting. PR A ships only `InMemoryRequestQuotaStore`. It is deterministic and suitable for local tests but is not a reliable multi-process or restart-durable global daily counter. Therefore public mode permits it only with an explicitly declared single instance and independently configured Provider/platform hard limits. A future durable store must provide an atomic implementation of the same transaction boundary before horizontal scaling.

Cloudflare additionally has a fail-closed Host cap no greater than 10,000 Neurons per UTC day. Seedream and Grok remain paid BYOK calls and are also subject to their Provider account limits. No gate retries, switches Provider, or continues into paid overage silently.

## Provider activation

- Seedream is the recommended high-quality option. `PLAYGROUND_ENABLE_SEEDREAM_TRANSPORT=1` enables the allow-listed Ark BYOK transport. The user supplies the key for one request.
- Grok is optional high quality. `PLAYGROUND_ENABLE_GROK_TRANSPORT=1` enables the allow-listed xAI `/v1/images/edits` JSON BYOK transport. Its Mock-HTTP success/failure paths are tested; PR A makes no real Grok call or quality claim.
- Cloudflare is a free experimental preview, not the quality default. It requires `PLAYGROUND_ENABLE_CLOUDFLARE_TRANSPORT=1` plus server-side `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

Compile/Inspect remains available with every transport disabled or every Generate quota exhausted.

## PR B baseline and Provider-enabled deployment

The checked-in PR B environment example is compile-only. All three real transports and Mock rendering are disabled, so the effective Provider-call and spend ceiling is zero. It binds Node to loopback, uses one systemd process, caps memory, exposes only Nginx, and keeps validation export disabled.

After separate authorization, a deployment may enable Seedream and Grok BYOK transports without storing either user key. Cloudflare may be enabled with an operator-managed credential stored only in the root-owned `0600` `/etc/voce-playground/cloudflare.env` file. The compile-only systemd unit denies non-loopback networking; Provider activation therefore also requires the reviewed `voce-playground-provider-egress.conf` drop-in. Application adapters continue to allow-list the exact Cloudflare, Ark, xAI, and Provider-owned output hosts. Deployment acceptance must use Mock tests and capability metadata unless a real call is separately authorized.

Before deployment, the owner must separately authorize the cloud account/project, exact region, hostname/DNS/TLS, proxy CIDRs/body limit, single-instance process policy, monitoring destination, public privacy/contact text, secret injection, and real Provider calls. PR B does not change PR A into a release, merge, npm publication, or tag operation.
