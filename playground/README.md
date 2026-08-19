# VOCE Playground Host

This standalone Host provides `/playground`, upload/local preview, ScenarioPack-derived role controls, composition preset selection, and offline compile inspection. It does not import Core internals and it never calls a paid model in development.

From the repository root after the workspace dependencies have been installed:

```text
tsc -b
node playground/dist/server-entry.js
```

Open `http://127.0.0.1:4173/playground`.

Public routes:

- `GET /api/meta`
- `GET /api/composition-presets`
- `POST /api/upload` (request-scoped in-memory bytes; never persisted)
- `POST /api/compile`
- `POST /api/generate` (explicit confirmation and render gate; Mock only in this phase)

The browser sends role IDs and typed preset selections only. Ontology paths, scenario prompt templates, credentials, and provider endpoint choices are not browser inputs. The compile response explicitly reports empty observed facts and confirmed source bindings for the zero-observation V1 path.

Provider capability notes and official-source verification are recorded in [`docs/implementation-notes/playground-provider-capability-report.md`](../docs/implementation-notes/playground-provider-capability-report.md).
