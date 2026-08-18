# Candidate public compatibility surface

The current versioned machine-readable checklist is [`compatibility/v0.1.0-rc.3/manifest.json`](../compatibility/v0.1.0-rc.3/manifest.json). It is a candidate compatibility fixture for `0.1.0-rc.3`, not a stable-major compatibility promise. The RC.1 and RC.2 fixtures remain available as historical snapshots.

The candidate surface is limited to:

- `ScenarioPack`
- `ScenarioPackRegistry`
- `ScenarioPackManifest`
- `DeclarativeRulePackContribution`
- `ProviderAdapter`
- `ProviderCapabilityProfile`
- `BundleManifest`
- the offline `@voce-engine/testkit` fixture helpers used by the consumer sample

The fixture records the public export names, schema `$id` values, TypeScript consumer sample, deterministic pack lock/effective-scenario hashes, Mock profile behavior, and bundle safety behavior. `pnpm run compatibility` checks the workspace declarations and repeats first-party/renamed-third-party pack tests to ensure semantic JSON and hashes are stable.

The contracts package includes JSON Schemas in its tarball. The documented installed-package path is, for example, `@voce-engine/contracts/schemas/BundleManifest.schema.json`. No other internal source path is part of this candidate surface.

`ProviderAdapter` remains a trusted local-code port. ScenarioPack artifacts are declarative data; executable files, lifecycle scripts, dynamic discovery, marketplace behavior, automatic installation, and untrusted plugin isolation are not promised.

## Visual composition alpha additions

The visual-composition MVP adds alpha-schema records for typed ontology paths, declarative rule conditions/operands/resolutions, rule-pack contributions, prompt-section policy, prompt exclusions, and the shared visual-composition catalog. The historical `0.1.0-rc.3` manifest and its `v1alpha1` Prompt schemas remain unchanged. The new prompt closure uses `voce.prompt-ir/v1alpha2`, `voce.prompt-candidate-ir/v1alpha2`, `voce.prompt-compilation-input/v1alpha2`, and matching `v1alpha2` optimization/Guard schemas for explicit exclusion and effective-scenario fields. These additions target the `0.2.0-alpha.1` development line and are not a production-stability claim.
