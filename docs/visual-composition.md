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
  optionalInputs: preset.optionalInputs ?? [],
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
| `profile-silhouette` | optional `silhouette` | `true` adds `lighting.subjectRendering = silhouette` | `{ silhouette: true }` |

All other presets expand without `inputs`. `reflection-composition` is the fixed **Water reflection** preset: it always selects a water surface and exposes no surface input. Compatibility hints are advisory host/review requirements.

Presets that require physical scene geometry include both a preferred `environment.background` fallback and a `camera.composition.subjectEnvironmentPlacement` relation. The fallback is used only when no approved background reference or explicit user background exists; the placement relation always states how the person, camera, ground, foreground, opening, mirror, or perspective corridor connect. Water reflection looks across foreground water toward a person on a dry far bank: the shoreline sits directly below both feet and the reflection aligns below the person on the same image axis. A partial visible reflection is valid. Mirror composition places the person on the floor in front of one mirror and uses one plausible oblique camera view. Frame within frame places the person beyond and inside one opening. Long-distance, bird's-eye, over-the-shoulder, centered-symmetry, leading-lines, diagonal, S-curve, negative-space, foreground-obstruction, profile-silhouette, telephoto-compression, and environmental-portrait presets each define an equivalent physical relationship. Pure framing, camera-angle, rule-of-thirds, leading-room, and subject-pose layouts do not force a backdrop.

## Model-facing prompt semantics

Constraint IR continues to retain typed paths and values for audit, but Prompt IR now renders every composition constraint as provider-neutral natural English. Internal tokens such as `camera.composition.*` and `value=` are not used as the model instruction. All 30 presets have a concrete observable acceptance statement, and the regression suite compiles every preset independently.

The strengthened presets also close the ambiguous cases visible in image-model testing:

- extreme close-up targets one eye rather than an unspecified local crop;
- over-the-shoulder keeps the declared person visible beyond an anonymous foreground shoulder and forbids duplicating that person;
- rule of thirds uses the right third to match the canonical example;
- triangle composition uses the single person's pose rather than inventing extra people;
- ordinary reflection makes the person and reflection co-primary and physically consistent; and
- mirror composition makes the mirror primary, requires the face to be visible in it, and requires pose, action, hands, props, costume, hairstyle, hair ornaments, and accessories to match the real person at the same instant, apart from physically correct reflection reversal.

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
<tr><td><img src="assets/visual-composition/birds-eye-view.jpg" alt="Bird's-eye view example" width="420"><br><code>birds-eye-view</code> — near-vertical overhead view.</td><td><img src="assets/visual-composition/over-the-shoulder.jpg" alt="Over the shoulder example" width="420"><br><code>over-the-shoulder</code> — an anonymous foreground shoulder frames the declared person beyond it.</td></tr>
<tr><td><img src="assets/visual-composition/dutch-angle.jpg" alt="Dutch angle example" width="420"><br><code>dutch-angle</code> — deliberate left or right camera roll.</td><td><img src="assets/visual-composition/profile-silhouette.jpg" alt="Profile silhouette example" width="420"><br><code>profile-silhouette</code> — side profile, optionally rendered as a silhouette.</td></tr>
</table>

## Layout presets

<table>
<tr><td><img src="assets/visual-composition/centered-symmetry.jpg" alt="Centered symmetry example" width="420"><br><code>centered-symmetry</code> — stable central axis and mirrored balance.</td><td><img src="assets/visual-composition/rule-of-thirds.jpg" alt="Rule of thirds example" width="420"><br><code>rule-of-thirds</code> — subject sits on the right third with deliberate context on the left.</td></tr>
<tr><td><img src="assets/visual-composition/leading-lines.jpg" alt="Leading lines example" width="420"><br><code>leading-lines</code> — scene geometry guides attention.</td><td><img src="assets/visual-composition/leading-room.jpg" alt="Leading room example" width="420"><br><code>leading-room</code> — open space is retained in front of gaze or motion.</td></tr>
<tr><td><img src="assets/visual-composition/diagonal-composition.jpg" alt="Diagonal composition example" width="420"><br><code>diagonal-composition</code> — a controlled diagonal adds direction.</td><td><img src="assets/visual-composition/s-curve-composition.jpg" alt="S-curve composition example" width="420"><br><code>s-curve-composition</code> — a winding visual path creates flow.</td></tr>
<tr><td><img src="assets/visual-composition/triangle-composition.jpg" alt="Triangle composition example" width="420"><br><code>triangle-composition</code> — one person's pose forms a stable triangle.</td><td><img src="assets/visual-composition/negative-space.jpg" alt="Negative space example" width="420"><br><code>negative-space</code> — deliberate open area surrounds or offsets the subject.</td></tr>
</table>

## Depth and lens presets

<table>
<tr><td><img src="assets/visual-composition/frame-within-frame.jpg" alt="Frame within frame example" width="420"><br><code>frame-within-frame</code> — scene elements create an inner frame.</td><td><img src="assets/visual-composition/foreground-obstruction.jpg" alt="Foreground obstruction example" width="420"><br><code>foreground-obstruction</code> — soft foreground elements add depth.</td></tr>
<tr><td><img src="assets/visual-composition/reflection-composition.jpg" alt="Water reflection example" width="420"><br><code>reflection-composition</code> — the camera looks across foreground water toward the person on a dry far bank; the reflection aligns directly below the person.</td><td><img src="assets/visual-composition/mirror-composition.jpg" alt="Mirror composition example" width="420"><br><code>mirror-composition</code> — a softly blurred partial back and shoulder frame the foreground while the sharp front-facing reflection dominates an ornate full-length mirror in an elegant, warmly lit dressing room.</td></tr>
<tr><td><img src="assets/visual-composition/telephoto-compression.jpg" alt="Telephoto compression example" width="420"><br><code>telephoto-compression</code> — long-lens perspective stacks distant layers.</td><td><img src="assets/visual-composition/environmental-portrait.jpg" alt="Environmental portrait example" width="420"><br><code>environmental-portrait</code> — subject and setting jointly carry meaning.</td></tr>
</table>

## Artwork policy

The 30 JPEGs are original documentation artwork generated for this repository from style-only references. The source screenshots are not included. The images intentionally contain no copied labels, numbering, logos, or watermarks. Repository validation requires exactly one JPEG named `<preset-id>.jpg` for every canonical preset.

`assets/visual-composition-overview.jpg` is a derived contact sheet used by the README. It combines the same 30 canonical examples with their stable preset IDs and does not add another preset or model reference.
