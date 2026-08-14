# M5 Implementation Decisions

This note records the implementation-level decisions for the Prompt IR, Prompt Guard, and offline execution runtime milestone. It is intentionally narrower than the bilingual design documents; TypeScript contracts, schemas, and tests remain the machine-facing contract.

## Prompt IR and canonicalization

- M5 uses versioned `v1alpha1` contracts for Prompt IR, candidate IR, transformations, Guard findings/results, provider render requests/results, execution runs, events, receipts, evaluation, human acceptance, cleanup, compensation, trace, and replay results.
- Prompt IR is composed of typed sections, parameters, reference mappings, prohibitions, coverage claims, and provenance IDs. The canonical hash projection sorts unordered collections by stable identifiers while retaining explicit section/reference order where order is semantic.
- The compiler rejects non-`ok`, stale, or hash-invalid M4 inputs. A supplied signature is verified before any derived signature is considered; it is never silently repaired.
- Returned contracts are defensive copies. The deterministic baseline optimizer is local and no-LLM; remote optimization is a port only and remains outside this milestone.

## Guard boundary

- Locked sections, typed output bounds, confirmed reference mappings, and locked coverage are compared structurally. Rephrase, reorder, parameter move, and suggestion transformations require declared AST records; a free-text semantic change is `PROMPT_CANDIDATE_UNVERIFIABLE` and follows the selected reject/fallback policy.
- Guard provenance is carried as source, decision, constraint, and asset IDs. The implementation does not claim deterministic understanding of arbitrary natural-language additions.

## Offline adapters and execution

- Mock adapters return hash-addressed virtual `ArtifactHandle` metadata only. They do not make network calls, download URLs, create image bytes, or invoke paid providers. The native-transparent and JPEG-plus-background-removal plans use the same provider-neutral adapter port.
- Execution calls M4 `dispatchPreflight` with an exact snapshot of the current context, plans, prompt artifact, adapters/profiles, destinations, data-transfer digest, budget digest, and bound remote authorizations. Remote mock steps use the same authorization and receipt structure as live-semantic steps.
- Events are append-only and hashes exclude only their own identity/volatile timestamp fields. `submission_unknown` is terminal until explicit reconciliation; it is never automatically resubmitted. Run retries are bounded by the step budget and never cross a terminal run boundary.
- Finally cleanup and compensation receipts are emitted for success, failure, cancellation, uncertain submission, and worker restart conditions. Cleanup failure is visible in receipts and the result code without pretending that a human decline or cleanup failure is a provider execution failure.

## Replay and trace

- Trace output is a deterministic, redacted projection containing safe identifiers and hashes. It excludes secrets, image bytes, local absolute paths, and temporary signed URLs.
- Replay verifies retained `ArtifactHandle` availability. Deleted, expired, or unknown artifacts return `ARTIFACT_UNAVAILABLE`; replay never silently changes versions, regenerates, or creates a paid call.
