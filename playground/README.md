# VOCE Playground Host

This standalone Host provides `/playground`, upload/local preview, ScenarioPack-derived role controls, Cosplay-only access to all 30 composition presets, offline compile inspection, deterministic Mock generation, and deployment-injected Provider bridges. It does not import Core internals. Standard development and CI never call a paid model.

This Host is the fifth public package published in `v0.1.0-rc.5` under npm `next`. It passed local product acceptance, release gates, OIDC publication, and an exact-version public-registry clean consumer on 2026-08-21. The package runs a local Host; it is not a public deployment or production-readiness claim. PR D remains responsible for public deployment, shared-service limits, feedback operations, monitoring, and online acceptance.

Install and start the local Host:

```text
npm install --global @voce-engine/playground@0.1.0-rc.5
voce-playground
```

`@voce-engine/playground@next` is equivalent for the current candidate. Do not use an unversioned install during RC.5: npm's `latest` tag still identifies the non-runnable namespace-bootstrap record, not the reviewed Playground package.

From the repository root after the workspace dependencies have been installed:

```text
tsc -b
node playground/dist/server-entry.js
```

Open `http://127.0.0.1:4173/playground`.

Rendering is disabled by default. For local Mock-only generation, set `PLAYGROUND_ENABLE_MOCK_RENDER=1` and `PLAYGROUND_DEVELOPMENT_MODE=1` before starting; Mock is hidden from the ordinary product selector but remains available explicitly to development/tests. The allow-listed Cloudflare Workers AI transport is enabled only when `PLAYGROUND_ENABLE_CLOUDFLARE_TRANSPORT=1` and both server-side credential variables are present. The token stays in the Host process, is never returned to the browser, and must never be committed. The local allow-listed Seedream transport is enabled with `PLAYGROUND_ENABLE_SEEDREAM_TRANSPORT=1`; its API key is entered in the Browser for one confirmed request, cleared immediately, never stored, and never retried automatically. Grok still requires an explicitly injected matching transport.

Virtual Try-On requires one person image plus clothing. The Browser presents two exclusive paths: one Full outfit image, or Top / Bottom where either piece or both may be uploaded. It does not ask users to classify garment categories; the selected slot bounds the replacement region, while API callers may still provide optional allow-listed category/structure metadata. Uploading only an upper garment preserves the original lower garment; uploading only a lower garment preserves the original upper garment; uploading both or one full-outfit reference replaces both regions. Footwear, fit, pose, and up to four typed accessory references are optional. Each accessory keeps the meaningful ScenarioPack-declared type, placement, side, and appearance combination; when none is supplied, the original accessories are preserved. Try-On does not expose composition presets and preserves the source pose and camera framing unless a pose reference is supplied.

Cosplay keeps the 30 composition presets and their example gallery. Its model-facing identity instruction preserves the first reference person's identity and facial appearance while allowing the same face to be rendered naturally from the selected camera angle; no other reference may supply or blend into the face. A second hard instruction keeps the whole output photographic. Detailed face shape, feature, skin, makeup, expression, and age checks remain in the evaluation plan instead of being repeated in the generation prompt. The character reference supplies only hairstyle, costume, accessories, and props; it cannot supply a face or illustration style. Cosplay does not expose the dedicated typed accessory-detail uploader; accessories already present in the character-design reference remain part of that overall character design. The Browser cannot invent ontology paths, accessory item IDs, or metadata values.

The private source workspace uses `workspace:*` so CI tests the Playground against the exact Core and Contracts checkout in the same commit. A separately deployed Playground must replace those development links with the exact published RC version required by the design before real generation is enabled.

Public routes:

- `GET /api/meta`
- `GET /api/composition-presets`
- `POST /api/upload` (bounded request-scoped memory; JPEG EXIF is removed; bytes are never persisted)
- `DELETE /api/uploads` (clears all temporary uploads for the current Browser session)
- `POST /api/compile`
- `POST /api/generate` (explicit one-call confirmation, capability, plan-binding, budget, rate and render gates)

For local manual quality validation only, start with both `PLAYGROUND_DEVELOPMENT_MODE=1` and `PLAYGROUND_VALIDATION_EXPORT=1`. This reveals a loopback-only `POST /api/validation-export` route and Browser button that download a one-time ZIP containing the exact Guard-accepted prompt, ordered request-scoped references, a hash-bound manifest, and the acceptance checklist. The export performs no Provider call, grants no retry, writes no repository artifact, rejects URL/secret-like text, and is absent unless both flags are enabled. Production deployments must leave it disabled.

The ordinary selector order is Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b` (default free quick-preview profile), Seedream BYOK, and Grok Imagine BYOK. Mock is a development/test profile only. Cloudflare uses an operator-managed server credential; the browser never shows a Cloudflare key field. The profile accepts at most four ordered references, maps them mechanically to multipart `input_image_0` through `input_image_3`, and blocks any input whose width or height is 512 or greater before transport. A successful response is decoded and held in request-scoped Host memory for 15 minutes so the browser can display the generated image; neither input nor output bytes are written to disk. The shared free allocation is capped at 10,000 Neurons per UTC day and resets at 00:00 UTC; exhaustion, Cloudflare account-limited responses, and transport failures fail closed with no retry, paid continuation, or Provider switch. It is a fixed four-step distilled 4B model intended for quick previews: exact face identity, small accessory details, complete feet/framing, and complex spatial composition may be less reliable than Seedream/Grok. The deployment-only names are listed in [`cloudflare.env.example`](cloudflare.env.example); no values belong in the repository.

The browser sends role IDs, typed preset selections, uploaded request-scoped images, and—only for Generate on Seedream/Grok—an ephemeral BYOK value. Dutch angle, leading room, and negative space expose fixed direction selectors, while Profile / silhouette exposes an optional Yes/No selector. Water reflection has no surface selector: it always uses water. Its default camera looks across foreground water toward the person on a dry far bank; the shoreline sits directly below both feet and the reflection aligns below the person on the same image axis. A visible partial reflection is acceptable. Every preset that supplies a fallback background also supplies a provider-neutral `camera.composition.subjectEnvironmentPlacement` relation so the person is supported by the correct ground, opening, path, foreground layer, mirror plane, or perspective corridor. Camera-only and subject-layout presets do not force a backdrop. Prompt IR converts accepted typed constraints into provider-neutral natural English rather than sending internal `camera.*` tokens. Ontology paths, scenario prompt templates, provider endpoint/model choices, and Cloudflare credentials are not browser inputs.

Compile never needs a key. It uses a non-generating inspection profile large enough to preserve the full declared plan, then reports the selected Provider's separate `providerCapability`; a Provider reference limit can block Generate without truncating the plan. Generate recompiles against the selected profile and verifies its bound generation hash before any call. A BYOK value is removed from the browser field immediately, is passed separately to an injected transport for one attempt, and is absent from contracts, hashes, traces, logs, receipts, transport-error responses, and public results. Generate clears the session uploads on every outcome.

Seedream supports the current four/five-reference flows and up to ten declared Cosplay references under the profile. Its BYOK transport is fixed to the allow-listed Ark endpoint and the previously real-provider-tested `doubao-seedream-5-0-pro-260628`, sends one request with no retry, downloads the single returned image into request-scoped memory, and exposes it through the same 15-minute no-store local result route. Grok Imagine accepts at most three references, so a four-reference Try-On plan compiles for inspection but cannot be generated with Grok; the Host does not drop a reference or switch Provider silently. Provider calls preserve the Guard-accepted positive sections, prohibitions, typed parameters, output contract, and reference order. The Cloudflare bridge is explicitly multipart-based and the Seedream/Grok bridges are explicitly JSON-based; deployment transports are responsible only for the reviewed wire conversion, not for authoring new prompt semantics.

Provider capability notes and official-source verification are recorded in [`docs/implementation-notes/playground-provider-capability-report.md`](../docs/implementation-notes/playground-provider-capability-report.md).
