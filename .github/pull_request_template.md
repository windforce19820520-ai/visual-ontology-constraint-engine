## Summary

Describe the problem, the proposed change, and the user or developer impact.

## Validation

List deterministic tests, fixtures, and documentation checks that were run. Real paid-provider calls must be explicitly identified and must never run in standard CI.

## Checklist

- [ ] The change stays within the public Core, rule-pack, adapter, runtime, or evaluation scope.
- [ ] No credentials, private user assets, temporary signed URLs, or private product artifacts are included.
- [ ] Provider capabilities are declared by a versioned profile and are not inferred from prompt wording.
- [ ] Remote data destinations, possible fees, budgets, retries, cancellation, and redaction behavior are disclosed where relevant.
- [ ] Deterministic tests and offline fixtures cover the changed behavior.
- [ ] Scenario, system-design, or glossary changes update the paired English and Simplified Chinese documents, or this change has no semantic effect on that specification set.
- [ ] Stable IDs, enums, code identifiers, TypeScript contracts, and Mermaid topology remain synchronized.
