# Contributing

Thank you for helping improve Visual Ontology & Constraint Engine.

## Before opening a change

1. Open an issue for public API, ontology, planner, provider, or evaluation changes.
2. Describe the user problem, explicit non-goals, and measurable acceptance criteria.
3. Keep provider-specific behavior behind an adapter.
4. Add deterministic tests and offline fixtures.

## Development rules

- Use Node.js 20 or later.
- Run `npm run validate` before submitting a pull request.
- Standard tests and CI must not call real model providers.
- Never commit credentials, user images, temporary provider URLs, or private product artifacts.
- Observations from a model must carry provenance and confidence.
- Hard constraints must not depend on unverified low-confidence observations.
- Major architecture decisions require a document under `docs/`.

## Pull requests

Pull requests should explain:

- what problem is solved;
- what changed;
- user and developer impact;
- tests and fixtures used;
- compatibility or migration implications;
- any provider cost or privacy considerations.

By contributing, you agree that your contributions are licensed under Apache-2.0.
