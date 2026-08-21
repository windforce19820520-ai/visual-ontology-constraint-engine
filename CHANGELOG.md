# Changelog

## 0.1.0-rc.5

- Publishes the VOCE Playground Host as a separate fifth package, `@voce-engine/playground`: an English, mobile-friendly local web UI for request-scoped image upload, ScenarioPack-derived role declaration, readable plan inspection, exact guarded-prompt validation export, and one explicitly confirmed Provider call. The npm package includes all 30 Cosplay composition examples and remains separate from public deployment.
- Replaces the earlier fixed Try-On input model with one required person plus either one full-outfit reference or independently optional Top and Bottom references. Full outfit is mutually exclusive with Top/Bottom; omitted garment regions, footwear, pose, framing, and accessories are preserved unless their corresponding optional reference is supplied.
- Adds typed Virtual Try-On accessory declarations for supported item, placement, and side combinations; replacement accessories remove original bags and jewelry, while the absence of a replacement accessory preserves the originals. The Browser no longer asks users to classify garment categories, while trusted API callers may still provide optional allow-listed metadata.
- Keeps all 30 visual-composition presets and example artwork in Cosplay only. The compiled prompt preserves the first person reference's face and photographic appearance, replaces character hair/costume/props from their declared references, and adds logical default environments plus subject/environment placement constraints for compositions that require them.
- Adds allow-listed local transports for Cloudflare Workers AI FLUX.2 klein 4B and Seedream 5.0 Pro, while retaining Grok Imagine as an explicitly injected BYOK boundary. Cloudflare is the default free quick-preview profile, uses operator-managed server credentials, accepts at most four references strictly smaller than 512×512, and is documented as lower fidelity for exact identity, small accessories, complete feet/framing, and complex spatial composition.
- Caps every model-facing Playground prompt at 4,000 characters and tests all 30 Cosplay compositions for both Cloudflare and Seedream without dropping guarded semantics or changing reference order.
- Adds declarative input-policy and interpretation-scope contracts, conditional role-group validation, reference-isolation fields, deterministic binding/materialization coverage, upload deletion and cleanup, Provider capability/budget/rate gates, and safe one-call error handling. Standard tests remain offline and never use real credentials or paid calls.
- Extends compatibility, packed-consumer, clean-room, reproducibility, checksum, and OIDC publication gates from four packages to five. The installed-package consumer starts the Playground and verifies its page, scenario metadata, 30-preset catalog, and bundled example artwork without a real Provider call.

## 0.1.0-rc.4

This release candidate publishes the visual-composition work that followed RC.3:

- Adds host-facing documentation for all 30 declarative visual-composition presets, including typed-input examples, prompt-compilation flow, reference-budget semantics, and original manga-line-art selection examples; repository validation now requires one example image for every canonical preset ID.
- Exposes the catalog through the public Core package and reports its stable ID, hash, 29 ontology paths, and 30 presets through `voce doctor --json`.
- Compiles preset selections into ordinary typed `ChangeIntent` records, resolves incompatible shot-scale preferences deterministically, and carries active and excluded composition choices into PromptIR without treating selection artwork as a model reference.
- Adds an explicitly authorized, ignored-local Seedream composition acceptance runner capped at three paid calls with no retries. All three transport calls succeeded; the samples are recorded as qualitative evidence rather than an automated release blocker.
- Hardens the offline execution result contract so `OfflineExecutionResult.status` reflects the full `ExecutionRunState` set instead of silently narrowing it through a type cast; reconciliation to an in-flight state now reports the pending status without resubmitting.
- Makes `RecordingMockTransport` match enqueued provider responses by `requestHash` (with an empty-hash wildcard fallback) instead of FIFO-only consumption, so concurrent sends cannot bind a queued response to the wrong request.
- Documents the M9 Seedream runner's `RemoteCallAuthorization` as a self-attested data claim at a trusted, human-operated tool boundary rather than a cryptographic authorization mechanism.

Standard CI, examples, and release gates remain offline and Mock-only. Private inputs, generated outputs, credentials, and temporary Provider URLs are not release artifacts. This release candidate does not claim production readiness.

PR [#28](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/pull/28) was squash-merged as `70ecee52665c0d0002751e00896618ac0b74877a`. The annotated tag, [GitHub prerelease](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/releases/tag/v0.1.0-rc.4), and npm publication all use that source revision. All four packages were published under `next` by [OIDC workflow run 32127701215](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/actions/runs/32127701215), and an exact public-registry consumer passed imports, declarations, schemas, CLI doctor, the 30-preset catalog, and all three bundled offline ScenarioPack paths.

## 0.1.0-rc.3

This release candidate repairs the Cosplay signature-prop fidelity path reported in issue #19 and keeps the repair inside the existing declarative and deterministic boundaries:

- expands the data-only Cosplay ScenarioPack with explicit signature-prop ontology paths, source-isolation policies, required detail dependencies, prompt coverage, and separate semantic-review criteria;
- makes required signature-prop references fail closed when the effective reference budget cannot retain them, while optional pose references remain omittable with a reason;
- keeps evaluation in `needs_review` for unadjudicated semantic `fail` or `uncertain` findings and rejects human decisions bound to a different execution run;
- binds generated CaseSpec roots to the exact loaded ScenarioPack version instead of a CLI hard-coded fixture version; and
- adds deterministic regression coverage for the evaluation, ScenarioPack, and reference-budget behavior plus an RC.3 compatibility snapshot.

Standard CI, examples, and automatic release-candidate checks remain offline and Mock-only. PR [#21](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/pull/21) was merged as `f424705bbf554e23336e8b4179f24b287145cdf6`, and the reviewed tag and [GitHub prerelease](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/releases/tag/v0.1.0-rc.3) were published on 2026-08-17. On 2026-08-18 the four npm packages were published under `next`, a clean public-registry consumer passed, and a separately authorized one-call Seedream Cosplay acceptance confirmed the repaired visible signature-weapon path. Issue #19 was closed. This release candidate does not claim production readiness.

## 0.1.0-rc.2

This maintenance release candidate adds no runtime features. It validates and exposes the release-engineering path added after RC.1:

- tokenless npm Trusted Publishing through GitHub Actions OIDC for all four public packages;
- npm provenance generation for packages published from the public GitHub repository;
- publication of the exact release-candidate tarballs that passed clean-consumer and checksum verification;
- a public `v0.1 stabilization` milestone and tracker for known limitations, feedback, and stable-release gates; and
- an RC.2 compatibility snapshot with the same candidate public surface as RC.1.

Standard CI, examples, and public acceptance remain offline and Mock-only. This release does not call a paid Provider and does not claim production readiness.

## 0.1.0-rc.1

The first public release candidate packages the product-neutral OSS core extracted and generalized from earlier commercial AI content-platform R&D. It is not a stable release and is not production-ready.

Highlights:

- local-tarball consumer validation for `@voce-engine/contracts`, `@voce-engine/core`, `@voce-engine/testkit`, and `@voce-engine/cli`;
- versioned candidate compatibility fixtures and deterministic renamed-third-party pack checks;
- strict package tarball allowlists, checksum verification, reproducibility checks, and a metadata-only local SBOM/license report;
- offline security regression corpus for unsafe bundle/package inputs and a static network/provider gate;
- Ubuntu/Windows Node 20 CI coverage plus a Node 22 public consumer job;
- explicit release-readiness and compatibility documentation.
- scope cleanup that removes the concrete veImageX/background-removal adapter and transparent-cutout scenario assumptions, while retaining provider-neutral optional postprocessing contracts.
- credentialed M9 Seedream validation for the product-relevant multi-reference virtual try-on and cosplay paths, including request receipts, timings, saved results, and fail-closed parameter validation;
- a Seedream payload fix that always includes the configured model and supports the documented watermark option.

The standard development and CI gates remain offline and never require credentials or paid Provider calls. The release is distributed with the npm `next` tag and as a GitHub prerelease. It does not claim production readiness or an official artifact attestation.
