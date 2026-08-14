## Summary

Describe the problem, the proposed change, and the user or developer impact.

## Validation

List deterministic tests, fixtures, and documentation checks that were run. Real paid-provider calls must be explicitly identified and must never run in standard CI.

## Checklist

- [ ] The change stays within the public Core, ScenarioPack, declarative-rule, adapter, runtime, or evaluation scope.
- [ ] Scenario-specific behavior is delivered through the public `ScenarioPack`/`DeclarativeRulePackContribution` registration path; Core contains no import, comparison, or branch keyed to a scenario ID.
- [ ] First-party and third-party packages follow the same manifest, explicit local registry, validation, fixture, and activation path; no dynamic scan, marketplace lookup, automatic installation, or implicit activation was added.
- [ ] Package, manifest, contribution, and dependency versions/digests are pinned where the change affects composition or replay.
- [ ] Any third-party executable extension is described as trusted local code; manifest validation is not represented as a sandbox or proof of safety.
- [ ] Candidate v0.1 contracts are treated as compatibility-stable only after their schemas and compatibility fixtures are released; other extension ports remain explicitly experimental.
- [ ] No credentials, private user assets, temporary signed URLs, or private product artifacts are included.
- [ ] Provider capabilities are declared by a versioned profile and are not inferred from prompt wording.
- [ ] Remote data destinations, possible fees, budgets, retries, cancellation, and redaction behavior are disclosed where relevant.
- [ ] Deterministic tests and offline fixtures cover the changed behavior.
- [ ] Scenario, system-design, glossary, or ScenarioPack-contract changes update the paired English and Simplified Chinese documents, or this change has no semantic effect on that specification set.
- [ ] Stable IDs, enums, code identifiers, TypeScript contracts, and Mermaid topology remain synchronized.
