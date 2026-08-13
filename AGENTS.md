# AGENTS.md

## Purpose

This repository develops an open-source visual ontology, constraint compiler, reference planner, prompt optimization, execution planning, and evaluation runtime for controllable reference-guided image generation.

## Boundaries

- Keep account, commerce, catalog, publishing, and private deployment concerns outside the repository.
- Keep the ontology domain-rich but instances sparse and evidence-backed.
- Separate Observation, SourceBinding, and OntologyInstance.
- Provider-specific behavior belongs in adapters.
- Standard development, tests, CI, and examples must not call real paid models.

## Development

- Use a feature branch and pull request for changes after repository initialization.
- Add deterministic tests for public contracts and planning behavior.
- Record major architecture changes in `docs/`.
- Never commit secrets, personal images, private assets, or temporary URLs.
- Do not claim production readiness before a published release and acceptance suite exist.
