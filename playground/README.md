# VOCE Playground Host

This standalone Host provides `/playground`, upload/local preview, ScenarioPack-derived role controls, all 30 composition presets, offline compile inspection, deterministic Mock generation, and deployment-injected Seedream/Grok bridges. It does not import Core internals. Standard development and CI never call a paid model.

From the repository root after the workspace dependencies have been installed:

```text
tsc -b
node playground/dist/server-entry.js
```

Open `http://127.0.0.1:4173/playground`.

Rendering is disabled by default. For local Mock-only generation, set `PLAYGROUND_ENABLE_MOCK_RENDER=1` before starting. Real transports cannot be enabled by an environment flag: the deployment Host must explicitly inject an allow-listed `PlaygroundProviderTransport` for the matching Provider. That separate deployment step owns HTTPS and wire-level Provider handling.

The private source workspace uses `workspace:*` so CI tests the Playground against the exact Core and Contracts checkout in the same commit. A separately deployed Playground must replace those development links with the exact published RC version required by the design before real generation is enabled.

Public routes:

- `GET /api/meta`
- `GET /api/composition-presets`
- `POST /api/upload` (bounded request-scoped memory; JPEG EXIF is removed; bytes are never persisted)
- `POST /api/compile`
- `POST /api/generate` (explicit one-call confirmation, capability, plan-binding, budget, rate and render gates)

The browser sends role IDs, typed preset selections, uploaded request-scoped images, and—only for Generate—an ephemeral BYOK value. Presets that require an extra value expose a generated selector (direction, empty-space placement, or reflection surface), so all 30 catalog entries are executable rather than display-only. Ontology paths, scenario prompt templates, and provider endpoint/model choices are not browser inputs.

Compile never needs a key. It uses a non-generating inspection profile large enough to preserve the full declared plan, then reports the selected Provider's separate `providerCapability`; a Provider reference limit can block Generate without truncating the plan. Generate recompiles against the selected profile and verifies its bound generation hash before any call. A BYOK value is removed from the browser field immediately, is passed separately to an injected transport for one attempt, and is absent from contracts, hashes, traces, logs, receipts, transport-error responses, and public results. Generate clears the session uploads on every outcome.

Seedream supports the current four/five-reference flows and up to ten declared Cosplay references under the profile. Grok Imagine accepts at most three references, so a four-reference Try-On plan compiles for inspection but cannot be generated with Grok; the Host does not drop a reference or switch Provider silently. Provider calls preserve the Guard-accepted positive sections, prohibitions, typed parameters, output contract, and reference order. The Grok bridge is explicitly JSON-based; a deployment transport is responsible only for the reviewed wire conversion, not for authoring new prompt semantics.

Provider capability notes and official-source verification are recorded in [`docs/implementation-notes/playground-provider-capability-report.md`](../docs/implementation-notes/playground-provider-capability-report.md).
