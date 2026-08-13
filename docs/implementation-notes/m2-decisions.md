# M2 implementation notes

- M2 exposes an in-memory `ScenarioPackRegistry` and rejects directory/archive sources with `PACK_SOURCE_UNSUPPORTED`. This keeps discovery explicit and bounded while avoiding an unreviewed filesystem/archive loader in the first runtime milestone.
- The registry computes memory-source distribution, package, manifest, catalog, lock, effective-scenario, and report hashes from the M1 canonical JSON/SHA-256 profile. Local acquisition locators are not included in semantic projections.
- v0.1 request, dependency, and `extensionOf` versions accept only exact normal SemVer. Root composition is ordered before extensions, then dependency and manifest edges are topologically sorted with lexical tie breaking.
- HostOverride hashes cover `{id, operation, reasonCode}`; overlay hashes cover the case-bound overlay with overrides sorted by content hash and ID. A typed override uses JSON Pointer for configuration targets and a stable contribution ID for default/activation targets. Equal target operations are deduplicated; unequal operations block.
- Effective configuration is copied from the selected request and updated immutably by JSON Pointer. Declared-default overrides update the matching default contribution value, and activation overrides disable the matching contribution ID. Future hard/required constraint semantics remain outside M2; unavailable proof blocks the override.
- Scenario contribution bodies remain declarative data. No provider, model, network, execution, interpreter, compiler, optimizer, prompt, or post-processing behavior is implemented in M2.
