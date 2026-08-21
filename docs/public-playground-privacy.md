# Public Playground data lifecycle and privacy

This document describes the repository Host prepared by PR A. A future deployment must publish an operator-specific notice covering its jurisdiction, contact, hosting region, and current Provider terms.

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

## Keys, logs, and errors

BYOK values are removed from the parsed body, kept only in the Generate call stack, cleared after the single attempt, and excluded from contracts, hashes, traces, responses, logs, result URLs, and validation packages. The browser clears the password field immediately after starting the request and does not use localStorage, sessionStorage, cookies, IndexedDB, or analytics for the key.

Runtime logs are structured and allow-list only request ID, route, method, status, safe error code, Provider/profile identifiers, elapsed time, and one-way hashes of session/client identity. External Provider messages, headers, and response bodies are not logged or returned. Unknown exceptions become `PLAYGROUND_INTERNAL_ERROR`. The browser may show a collapsed technical section containing only a safe code, request ID, and limit reason.

Validation-package export intentionally contains reference images and the complete Guard-accepted prompt. It is available only in explicit loopback development/regression mode and is absent in public production mode.
