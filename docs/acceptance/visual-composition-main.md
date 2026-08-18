# Visual-composition main-branch acceptance note

> Historical record: this deterministic check was completed after RC.3 and before RC.4. It is superseded by the [v0.1.0-rc.4 composition and release acceptance report](v0.1.0-rc.4.md), which records public npm consumption and three separately authorized real-Provider composition calls. The observations below remain unchanged as evidence of that earlier point in time.

## Scope

This note records a deterministic check of the visual-composition feature on `main@1e8baf8dc4049a34e9d14d621cc9d864047cf0db`. The feature was merged after the RC.3 source tag and is not part of the RC.3 npm packages.

## Selected example

- Preset: `environmental-portrait`
- Host scene choice: lakeside
- Stable source hint: `acceptance:2026-08-18:lakeside`

`expandVisualCompositionPreset` produced exactly two preferred `ChangeIntent` records:

| Target path | Requested value |
| --- | --- |
| `camera.composition.framingDevices.environmentalPortrait` | `true` |
| `camera.composition.environmentRelationship` | `contextual` |

Both records retained the preset ID and acceptance source hint. The targeted PromptCompiler test for compatible composition sections and losing-preference exclusion passed (`1/1`). The full repository and pull-request gates had already passed when the feature merged.

## Provider boundary

The separately authorized one-call Cosplay request had already been submitted before the lakeside composition selection was added. It was not interrupted or resubmitted. Therefore this note validates preset expansion and the deterministic PromptCompiler closure only; it does not claim that the generated Cosplay image visually validated a lakeside environmental portrait.

Example artwork remains UI/documentation guidance and was not sent as a model reference image.
