# Contributing

Thank you for helping improve Visual Ontology & Constraint Engine.

## Before opening a change

1. Open an issue for public API, ontology, scenario-pack, rule-pack, planner, provider, or evaluation changes.
2. Describe the user problem, explicit non-goals, and measurable acceptance criteria.
3. Keep provider-specific behavior behind an adapter.
4. Add deterministic tests and offline fixtures.

## Extension contributions

- First-party and third-party `ScenarioPack` packages use the same manifest, explicit local registry, resolver, testkit, and activation path.
- Core changes must not import a scenario package, compare a scenario ID, or add a scenario-name branch. Scenario-specific knowledge belongs in a package or `DeclarativeRulePackContribution`.
- Candidate public v0.1 contracts are limited to `ScenarioPack`, `ScenarioPackRegistry`, `ScenarioPackManifest`, `DeclarativeRulePackContribution`, `ProviderAdapter`, `ProviderCapabilityProfile`, and the offline testkit, and become compatibility-stable only with released schemas plus compatibility fixtures. Treat all other ports, including `RulePackPlugin`, as experimental.
- A Host must explicitly supply and register a local ScenarioPack manifest source. Any separately selected executable plugin is reviewed and registered through its own trusted-plugin path and is not a ScenarioPack dependency. Do not add directory scanning, global `node_modules` discovery, marketplace lookup, automatic download/install/update, or implicit activation.
- Scenario packages use ordinary npm or GitHub distribution. Pin exact package, manifest, contribution, and dependency digests in fixtures and composition locks; never use a floating package as replay evidence.
- Every package change includes redistributable offline fixtures and canonical IR or resolution expectations. Standard CI never requires credentials, network access, or paid providers.
- ScenarioPack runtime artifacts are declarative data and declare no network, fee, destination, or secret access. Any executable plugin or adapter is separately trusted local code and uses its own Plugin Manifest for those disclosures. Neither Manifest is a sandbox, code audit, or proof of safety.

## Development rules

- Use Node.js 20 or later.
- Run `npm run validate` before submitting a pull request.
- Standard tests and CI must not call real model providers.
- Never commit credentials, user images, temporary provider URLs, or private product artifacts.
- Observations from a model must be immutable candidates with provenance and confidence; acceptance belongs in an authorized decision record.
- Hard constraints must not depend on unverified low-confidence observations.
- Major architecture decisions require a document under `docs/`.

## Documentation languages

English is the normative language for public contracts. The scenario design, system design, glossary, and ScenarioPack contract form the four-document paired core specification set and maintain complete Simplified Chinese translations.

A change to one of those specifications must update both language editions in the same pull request. Stable scenario IDs, requirement IDs, enums, code identifiers, TypeScript contracts, and Mermaid topology must remain synchronized. Natural prose should be idiomatic in each language rather than translated sentence by sentence.

Architecture summaries, roadmaps, ordinary issues, discussions, and most ADRs may remain English-only unless a maintainer marks them as part of the paired core specification set.

## Pull requests

Pull requests should explain:

- what problem is solved;
- what changed;
- user and developer impact;
- tests and fixtures used;
- compatibility or migration implications;
- any provider cost or privacy considerations.

If the change affects a paired specification, state how semantic equivalence was reviewed in addition to passing the structural repository checks.

By contributing, you agree that your contributions are licensed under Apache-2.0.
