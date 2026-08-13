# M2 implementation notes

- M2 exposes an in-memory `ScenarioPackRegistry` and rejects directory/archive sources with `PACK_SOURCE_UNSUPPORTED`. This keeps discovery explicit and bounded while avoiding an unreviewed filesystem/archive loader in the first runtime milestone.
- The registry computes memory-source distribution, package, manifest, catalog, lock, effective-scenario, and report hashes from the M1 canonical JSON/SHA-256 profile. Local acquisition locators are not included in semantic projections.
- v0.1 request, dependency, and `extensionOf` versions accept only exact normal SemVer. Root composition is ordered before extensions, then dependency and manifest edges are topologically sorted with lexical tie breaking.
- Override validation is intentionally limited to declared typed points and primitive `valueSchema` checks. It does not claim to evaluate future hard/required constraint semantics; unavailable proof blocks the override.
- Scenario contribution bodies remain declarative data. No provider, model, network, execution, interpreter, compiler, optimizer, prompt, or post-processing behavior is implemented in M2.
