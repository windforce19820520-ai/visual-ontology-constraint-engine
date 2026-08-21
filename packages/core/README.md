# @voce-engine/core

Deterministic ScenarioPack resolution, constraint compilation, reference planning, Prompt IR, offline execution, and evaluation primitives.

> `0.1.0-rc.5` is a release candidate, not production-ready. APIs may change before `0.1.0`.

```bash
npm install @voce-engine/core@0.1.0-rc.5
```

## Visual composition presets

```ts
import { compileConstraints, expandVisualCompositionPreset } from '@voce-engine/core'

const compositionChanges = expandVisualCompositionPreset('dutch-angle', {
  inputs: { direction: 'right' },
  sourceHintIds: ['ui-card:dutch-angle'],
})

const result = compileConstraints({
  ...existingCompilationInput,
  changeIntents: [
    ...existingCompilationInput.changeIntents,
    ...compositionChanges,
  ],
})
```

Hosts should display the example artwork but submit only the stable preset ID and typed inputs. The artwork is not a reference asset and the selector does not consume reference budget. See the [complete preset and integration guide](../../docs/visual-composition.md) or its [简体中文 version](../../docs/zh-CN/visual-composition.md).
