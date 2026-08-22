# Public Playground data lifecycle and privacy

**Effective date:** 2026-08-22

**Last updated:** 2026-08-22

## Current public preview

The public preview at [voce-playground.43-165-176-201.sslip.io](https://voce-playground.43-165-176-201.sslip.io/playground) is operated by the VOCE repository maintainer on one Tencent Cloud International Lighthouse instance in Tokyo. The `sslip.io` hostname is a temporary preview identity, not an owned long-term product domain. This notice describes that preview and does not make a production-readiness, legal-jurisdiction, account, or service-level commitment.

For a general privacy question, open a [sanitized repository issue](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/issues/new?labels=documentation&title=Privacy%20question%3A%20) without personal data, images, credentials, prompts, cookies, or temporary URLs. Report a security-sensitive privacy issue through [GitHub private vulnerability reporting](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/security/advisories/new).

## What the Host receives

The browser sends selected reference images, declared ScenarioPack roles, composition selections, output settings, the image-rights confirmation, and the single-call confirmation. For Seedream or Grok Generate only, it also sends the user's BYOK API key in that one HTTPS request body.

The Host does not provide accounts, payment, history, a gallery, analytics, or a product database. It does not intentionally log raw images, Base64, full prompts, API keys, temporary output addresses, session cookies, or raw IP addresses.

## Processing and retention

1. The Host verifies MIME, file signature, byte size, dimensions, total pixels, and capacity, removes privacy-bearing metadata, then keeps sanitized bytes only in process memory.
2. Compile/Inspect uses those request-scoped bytes and declarations locally to build the plan. It does not call Cloudflare, Seedream, or Grok and does not require an API key.
3. Generate performs plan-binding, rights, capability, session/client, concurrency, rate, daily-budget, and Provider-specific gates first.
4. Only after those gates pass does the Host send the sanitized reference images and Guard-accepted prompt to the selected Provider. Seedream and Grok receive the ephemeral BYOK key; Cloudflare receives the operator's server credential.
5. One returned image may be kept in process memory for same-session display. The URL is opaque and contains no session identifier.

Uploads and results default to a 15-minute TTL. Generate clears its session uploads on every outcome. `DELETE /api/session`, TTL sweeping, and process shutdown release the corresponding temporary buffers. The Host does not persist them to disk. A Provider may have its own retention and abuse-monitoring rules; the UI and Provider documentation must not describe Provider-side processing as zero retention unless the deployed account has a verified contractual setting.

## Current Provider destinations

Generate sends data only to the Provider selected and confirmed for that request:

| Provider | Credential and destination | Provider-side boundary |
| --- | --- | --- |
| Seedream 5.0 Pro | The user's request-scoped Ark API key; sanitized references and the Guard-accepted prompt are sent to the allow-listed Volcengine Ark endpoint. | Paid on the user's Ark account. See [Volcengine privacy and data security](https://www.volcengine.com/trust/privacy). No Provider-side zero-retention claim is made. |
| Grok Imagine | The user's request-scoped xAI API key; sanitized references and the Guard-accepted prompt are sent to the allow-listed xAI image-edit endpoint. | Paid or quota-backed on the user's xAI account. See [xAI API security and retention](https://docs.x.ai/developers/faq/security). No maintainer-run real Grok quality acceptance or Provider-side zero-retention claim is made. |
| Cloudflare Workers AI | The operator-managed server credential; sanitized references and the Guard-accepted prompt are sent to the configured Workers AI account. | Free experimental preview within shared Host quota. See [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/). It is not VOCE's quality representative. |

The hosting platform and each selected Provider may process network, security, billing, or abuse-prevention metadata under their own current terms. Provider terms and account settings can change independently of this repository.

## Keys, logs, and errors

BYOK values are removed from the parsed body, kept only in the Generate call stack, cleared after the single attempt, and excluded from contracts, hashes, traces, responses, logs, result URLs, and validation packages. The browser clears the password field immediately after starting the request and does not use localStorage, sessionStorage, cookies, IndexedDB, or analytics for the key.

Runtime logs are structured and allow-list only request ID, route, method, status, safe error code, Provider/profile identifiers, elapsed time, and one-way hashes of session/client identity. External Provider messages, headers, and response bodies are not logged or returned. Unknown exceptions become `PLAYGROUND_INTERNAL_ERROR`. The browser may show a collapsed technical section containing only a safe code, request ID, and limit reason.

Validation-package export intentionally contains reference images and the complete Guard-accepted prompt. It is available only in explicit loopback development/regression mode and is absent in public production mode.

## Deletion and expiry

The browser can end its server session through `DELETE /api/session`. Generate clears session uploads after the attempt, whether it succeeds or fails. Any remaining in-memory upload or result expires under the 15-minute TTL, and process shutdown clears the temporary stores. Because the preview has no account, history, gallery, analytics profile, or product database, it does not offer a persistent user-record deletion workflow.
