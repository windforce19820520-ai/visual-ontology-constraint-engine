# Visual composition presets and host integration

[简体中文](zh-CN/visual-composition.md)

VOCE exposes 30 stable visual-composition preset IDs through `@voce-engine/core`. A preset is a declarative selector: it expands into ordinary camera-owned `ChangeIntent` records, participates in deterministic constraint resolution, and is then rendered into Prompt IR under the active ScenarioPack policy.

The example images in this guide are selection artwork for people and host interfaces. They are not inputs to the image model. Selecting a card does not create a `ReferenceCandidate`, `SourceBinding`, or `PlannedReference`, and therefore does not consume reference count or byte budget.

> Availability: these exports are published in `@voce-engine/core@0.1.0-rc.4` under npm `next`. RC.3 and earlier packages do not contain the visual-composition catalog.

## Host flow

```text
Display catalog card and example artwork
                  ↓
Submit { presetId, inputs? }
                  ↓
expandVisualCompositionPreset(...)
                  ↓
Append returned ChangeIntent[] to the normal compilation input
                  ↓
compileConstraints → planReferences → compilePromptIR → Prompt Guard
```

The host should send the stable preset ID rather than copying the example image into a provider request. Prompt text is compiled downstream from active or satisfied constraints. If a declared rule degrades a preferred composition request, the losing constraint becomes `unsatisfied` and is excluded from effective Prompt IR; required or non-waivable conflicts block instead of silently selecting a winner.

## Minimal API usage

```ts
import {
  VISUAL_COMPOSITION_CATALOG,
  compileConstraints,
  expandVisualCompositionPreset,
} from '@voce-engine/core'

// Use this catalog to render cards. Hosts provide localized strings for
// labelKey and descriptionKey and may map preset.id to the artwork below.
const cards = VISUAL_COMPOSITION_CATALOG.presets.map((preset) => ({
  id: preset.id,
  category: preset.category,
  requiredInputs: preset.requiredInputs ?? [],
  compatibilityHints: preset.compatibilityHints ?? [],
}))

// The UI submits data, not the card image.
const selection = {
  presetId: 'dutch-angle',
  inputs: { direction: 'right' },
}

const compositionChanges = expandVisualCompositionPreset(
  selection.presetId,
  {
    inputs: selection.inputs,
    sourceHintIds: [`ui-card:${selection.presetId}`],
  },
)

const compilation = compileConstraints({
  ...existingCompilationInput,
  changeIntents: [
    ...existingCompilationInput.changeIntents,
    ...compositionChanges,
  ],
})
```

Unknown IDs, missing required inputs, invalid direction/surface values, and incompatible typed values fail closed. Do not allow a client to submit arbitrary ontology paths or `requestedValue` objects as a substitute for preset expansion.

## Presets with inputs

| Preset | Input | Accepted values | Example |
| --- | --- | --- | --- |
| `dutch-angle` | `direction` | `left`, `right` | `{ direction: 'right' }` |
| `leading-room` | `direction` | `left`, `right`, `forward`, `up`, `down` | `{ direction: 'right' }` |
| `negative-space` | `direction` | `left`, `right`, `above`, `below`, `surrounding` | `{ direction: 'right' }` |
| `reflection-composition` | `surface` | `mirror`, `glass`, `water`, `screen`, `polished_surface` | `{ surface: 'water' }` |
| `profile-silhouette` | optional `silhouette` | `true` adds `lighting.subjectRendering = silhouette` | `{ silhouette: true }` |

All other presets expand without `inputs`. Compatibility hints are advisory host/review requirements; they do not silently inject scene content.

## Reference images remain separate

If a product later lets a user upload a prepared example image, register that image through the normal observation/reference path. It is a separate source decision and may consume provider reference budget. Do not attach image bytes or URLs to a composition preset. The artwork in this directory is intentionally documentation-only.

## Framing presets

<table>
<tr><td><img src="assets/visual-composition/extreme-close-up.jpg" alt="Extreme close-up example" width="420"><br><code>extreme-close-up</code> — eye or local detail dominates the frame.</td><td><img src="assets/visual-composition/close-up.jpg" alt="Close-up example" width="420"><br><code>close-up</code> — the complete face carries expression and detail.</td></tr>
<tr><td><img src="assets/visual-composition/head-and-shoulders.jpg" alt="Head and shoulders example" width="420"><br><code>head-and-shoulders</code> — complete head, neck, and shoulders.</td><td><img src="assets/visual-composition/bust-shot.jpg" alt="Bust shot example" width="420"><br><code>bust-shot</code> — chest-up portrait with room for gesture.</td></tr>
<tr><td><img src="assets/visual-composition/medium-close-up.jpg" alt="Medium close-up example" width="420"><br><code>medium-close-up</code> — upper torso with modest environment.</td><td><img src="assets/visual-composition/medium-shot.jpg" alt="Medium shot example" width="420"><br><code>medium-shot</code> — waist-up balance of subject and setting.</td></tr>
<tr><td><img src="assets/visual-composition/knee-shot.jpg" alt="Knee shot example" width="420"><br><code>knee-shot</code> — the figure is shown to around the knees.</td><td><img src="assets/visual-composition/full-shot.jpg" alt="Full shot example" width="420"><br><code>full-shot</code> — complete body, including both feet.</td></tr>
<tr><td><img src="assets/visual-composition/long-shot.jpg" alt="Long shot example" width="420"><br><code>long-shot</code> — a small full figure remains readable in context.</td><td><img src="assets/visual-composition/extreme-long-shot.jpg" alt="Extreme long shot example" width="420"><br><code>extreme-long-shot</code> — the environment dominates spatial scale.</td></tr>
</table>

## View presets

<table>
<tr><td><img src="assets/visual-composition/low-angle.jpg" alt="Low angle example" width="420"><br><code>low-angle</code> — camera looks upward.</td><td><img src="assets/visual-composition/high-angle.jpg" alt="High angle example" width="420"><br><code>high-angle</code> — camera looks downward at an oblique angle.</td></tr>
<tr><td><img src="assets/visual-composition/birds-eye-view.jpg" alt="Bird's-eye view example" width="420"><br><code>birds-eye-view</code> — near-vertical overhead view.</td><td><img src="assets/visual-composition/over-the-shoulder.jpg" alt="Over the shoulder example" width="420"><br><code>over-the-shoulder</code> — a foreground shoulder guides the view to another subject.</td></tr>
<tr><td><img src="assets/visual-composition/dutch-angle.jpg" alt="Dutch angle example" width="420"><br><code>dutch-angle</code> — deliberate left or right camera roll.</td><td><img src="assets/visual-composition/profile-silhouette.jpg" alt="Profile silhouette example" width="420"><br><code>profile-silhouette</code> — side profile, optionally rendered as a silhouette.</td></tr>
</table>

## Layout presets

<table>
<tr><td><img src="assets/visual-composition/centered-symmetry.jpg" alt="Centered symmetry example" width="420"><br><code>centered-symmetry</code> — stable central axis and mirrored balance.</td><td><img src="assets/visual-composition/rule-of-thirds.jpg" alt="Rule of thirds example" width="420"><br><code>rule-of-thirds</code> — subject sits on a third or intersection.</td></tr>
<tr><td><img src="assets/visual-composition/leading-lines.jpg" alt="Leading lines example" width="420"><br><code>leading-lines</code> — scene geometry guides attention.</td><td><img src="assets/visual-composition/leading-room.jpg" alt="Leading room example" width="420"><br><code>leading-room</code> — open space is retained in front of gaze or motion.</td></tr>
<tr><td><img src="assets/visual-composition/diagonal-composition.jpg" alt="Diagonal composition example" width="420"><br><code>diagonal-composition</code> — a controlled diagonal adds direction.</td><td><img src="assets/visual-composition/s-curve-composition.jpg" alt="S-curve composition example" width="420"><br><code>s-curve-composition</code> — a winding visual path creates flow.</td></tr>
<tr><td><img src="assets/visual-composition/triangle-composition.jpg" alt="Triangle composition example" width="420"><br><code>triangle-composition</code> — subject geometry forms a stable triangle.</td><td><img src="assets/visual-composition/negative-space.jpg" alt="Negative space example" width="420"><br><code>negative-space</code> — deliberate open area surrounds or offsets the subject.</td></tr>
</table>

## Depth and lens presets

<table>
<tr><td><img src="assets/visual-composition/frame-within-frame.jpg" alt="Frame within frame example" width="420"><br><code>frame-within-frame</code> — scene elements create an inner frame.</td><td><img src="assets/visual-composition/foreground-obstruction.jpg" alt="Foreground obstruction example" width="420"><br><code>foreground-obstruction</code> — soft foreground elements add depth.</td></tr>
<tr><td><img src="assets/visual-composition/reflection-composition.jpg" alt="Reflection composition example" width="420"><br><code>reflection-composition</code> — a declared surface carries the reflection.</td><td><img src="assets/visual-composition/mirror-composition.jpg" alt="Mirror composition example" width="420"><br><code>mirror-composition</code> — a mirror mediates the subject and viewpoint.</td></tr>
<tr><td><img src="assets/visual-composition/telephoto-compression.jpg" alt="Telephoto compression example" width="420"><br><code>telephoto-compression</code> — long-lens perspective stacks distant layers.</td><td><img src="assets/visual-composition/environmental-portrait.jpg" alt="Environmental portrait example" width="420"><br><code>environmental-portrait</code> — subject and setting jointly carry meaning.</td></tr>
</table>

## Artwork policy

The 30 JPEGs are original documentation artwork generated for this repository from style-only references. The source screenshots are not included. The images intentionally contain no copied labels, numbering, logos, or watermarks. Repository validation requires exactly one JPEG named `<preset-id>.jpg` for every canonical preset.

`assets/visual-composition-overview.jpg` is a derived contact sheet used by the README. It combines the same 30 canonical examples with their stable preset IDs and does not add another preset or model reference.
