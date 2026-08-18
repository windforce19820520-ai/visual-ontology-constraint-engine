# 构图预设、示例图与接入方法

[English](../visual-composition.md)

VOCE 通过 `@voce-engine/core` 提供 30 个稳定的构图预设 ID。预设不是一段“魔法提示词”，而是声明式选择器：它先展开成普通的相机构图 `ChangeIntent`，再进入确定性的冲突处理、约束编译和 Prompt IR 生成流程。

本页图片只用于帮助用户理解和选择构图，也可以直接作为前端卡片素材。它们不是传给图像大模型的参考图。选择构图卡不会创建 `ReferenceCandidate`、`SourceBinding` 或 `PlannedReference`，所以不会占用参考图张数或字节预算。

> 可用性说明：本文描述构图功能合并到 `main` 后的仓库源码。npm 是否可用取决于后续发布；不要假定旧版本的已发布包已经包含这些导出。

## 前端和外部调用怎么接

```text
展示构图卡片和示例图
          ↓
只提交 { presetId, inputs? }
          ↓
expandVisualCompositionPreset(...)
          ↓
把返回的 ChangeIntent[] 加进正常编译输入
          ↓
约束编译 → 参考图规划 → Prompt IR → Prompt Guard → Provider
```

前端传的是稳定的 `presetId` 和少量强类型参数，不是示例图。提示词由后续 PromptCompiler 根据有效约束和 ScenarioPack policy 自动生成。如果声明式规则允许某个 preferred 构图要求降级，失败项会变成 `unsatisfied` 并从有效提示词中排除；required 或不可豁免冲突会直接阻断，不会偷偷“最后一个覆盖前一个”。

## 最小调用示例

```ts
import {
  VISUAL_COMPOSITION_CATALOG,
  compileConstraints,
  expandVisualCompositionPreset,
} from '@voce-engine/core'

// 前端用目录生成卡片；中文名称和说明由宿主根据 key 本地化。
const cards = VISUAL_COMPOSITION_CATALOG.presets.map((preset) => ({
  id: preset.id,
  category: preset.category,
  requiredInputs: preset.requiredInputs ?? [],
  compatibilityHints: preset.compatibilityHints ?? [],
}))

// 用户选择“荷兰角，向右倾斜”。这里只提交数据。
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

未知 ID、缺少必填参数、非法方向或反射材质、类型不匹配都会失败关闭。不要允许客户端绕过预设展开，直接提交任意本体路径或 `requestedValue`。

## 需要参数的预设

| 预设 | 参数 | 可选值 | 示例 |
| --- | --- | --- | --- |
| `dutch-angle` | `direction` | `left`、`right` | `{ direction: 'right' }` |
| `leading-room` | `direction` | `left`、`right`、`forward`、`up`、`down` | `{ direction: 'right' }` |
| `negative-space` | `direction` | `left`、`right`、`above`、`below`、`surrounding` | `{ direction: 'right' }` |
| `reflection-composition` | `surface` | `mirror`、`glass`、`water`、`screen`、`polished_surface` | `{ surface: 'water' }` |
| `profile-silhouette` | 可选 `silhouette` | `true` 会增加 `lighting.subjectRendering = silhouette` | `{ silhouette: true }` |

其他预设不需要 `inputs`。`compatibilityHints` 是给宿主和审核流程的适配提示，不会自动往场景里塞入额外内容。

## 如果以后允许用户上传“构图参考图”

准备好的图片仍然可以通过 VOCE 的普通观察与参考图流程接入，但那是另一项来源选择，会按 Provider 规则占用参考图预算。不要把图片字节或 URL 塞进构图预设。当前这 30 张图明确只是说明和 UI 选择素材。

## 取景范围

<table>
<tr><td><img src="../assets/visual-composition/extreme-close-up.jpg" alt="极特写示例" width="420"><br><code>extreme-close-up</code>（极特写）：眼睛或局部细节占据画面。</td><td><img src="../assets/visual-composition/close-up.jpg" alt="特写示例" width="420"><br><code>close-up</code>（特写）：完整脸部承载表情和细节。</td></tr>
<tr><td><img src="../assets/visual-composition/head-and-shoulders.jpg" alt="头肩近景示例" width="420"><br><code>head-and-shoulders</code>（头肩近景）：完整头部、颈部和双肩。</td><td><img src="../assets/visual-composition/bust-shot.jpg" alt="胸像构图示例" width="420"><br><code>bust-shot</code>（胸像）：胸部以上，并保留手势空间。</td></tr>
<tr><td><img src="../assets/visual-composition/medium-close-up.jpg" alt="中近景示例" width="420"><br><code>medium-close-up</code>（中近景）：上半身为主，带少量环境。</td><td><img src="../assets/visual-composition/medium-shot.jpg" alt="半身示例" width="420"><br><code>medium-shot</code>（半身）：腰部以上，人物与环境平衡。</td></tr>
<tr><td><img src="../assets/visual-composition/knee-shot.jpg" alt="膝上构图示例" width="420"><br><code>knee-shot</code>（膝上构图）：人物截取到膝盖附近。</td><td><img src="../assets/visual-composition/full-shot.jpg" alt="全身示例" width="420"><br><code>full-shot</code>（全身）：从头到双脚完整入镜。</td></tr>
<tr><td><img src="../assets/visual-composition/long-shot.jpg" alt="远景示例" width="420"><br><code>long-shot</code>（远景）：人物较小，但在环境中仍清晰。</td><td><img src="../assets/visual-composition/extreme-long-shot.jpg" alt="大远景示例" width="420"><br><code>extreme-long-shot</code>（大远景）：环境和空间尺度占主导。</td></tr>
</table>

## 观察视角

<table>
<tr><td><img src="../assets/visual-composition/low-angle.jpg" alt="低角度示例" width="420"><br><code>low-angle</code>（低角度）：镜头从下往上看。</td><td><img src="../assets/visual-composition/high-angle.jpg" alt="高角度示例" width="420"><br><code>high-angle</code>（高角度）：镜头从斜上方向下看。</td></tr>
<tr><td><img src="../assets/visual-composition/birds-eye-view.jpg" alt="鸟瞰示例" width="420"><br><code>birds-eye-view</code>（鸟瞰）：接近垂直的顶视角。</td><td><img src="../assets/visual-composition/over-the-shoulder.jpg" alt="过肩镜头示例" width="420"><br><code>over-the-shoulder</code>（过肩镜头）：前景肩部引导视线看向另一主体。</td></tr>
<tr><td><img src="../assets/visual-composition/dutch-angle.jpg" alt="荷兰角示例" width="420"><br><code>dutch-angle</code>（荷兰角）：明确向左或向右倾斜画面。</td><td><img src="../assets/visual-composition/profile-silhouette.jpg" alt="侧脸剪影示例" width="420"><br><code>profile-silhouette</code>（侧脸/剪影）：突出侧脸轮廓，可选剪影渲染。</td></tr>
</table>

## 画面布局

<table>
<tr><td><img src="../assets/visual-composition/centered-symmetry.jpg" alt="居中对称示例" width="420"><br><code>centered-symmetry</code>（居中对称）：稳定中轴和左右平衡。</td><td><img src="../assets/visual-composition/rule-of-thirds.jpg" alt="三分法示例" width="420"><br><code>rule-of-thirds</code>（三分法）：人物落在三分线或交点。</td></tr>
<tr><td><img src="../assets/visual-composition/leading-lines.jpg" alt="引导线示例" width="420"><br><code>leading-lines</code>（引导线）：道路、栏杆等线条把视线引向主体。</td><td><img src="../assets/visual-composition/leading-room.jpg" alt="前方留白示例" width="420"><br><code>leading-room</code>（前方留白）：在视线或运动方向保留空间。</td></tr>
<tr><td><img src="../assets/visual-composition/diagonal-composition.jpg" alt="对角线构图示例" width="420"><br><code>diagonal-composition</code>（对角线构图）：用受控斜线增强方向感。</td><td><img src="../assets/visual-composition/s-curve-composition.jpg" alt="S 形构图示例" width="420"><br><code>s-curve-composition</code>（S 形构图）：弯曲路径形成流动感。</td></tr>
<tr><td><img src="../assets/visual-composition/triangle-composition.jpg" alt="三角构图示例" width="420"><br><code>triangle-composition</code>（三角构图）：人物或元素形成稳定三角形。</td><td><img src="../assets/visual-composition/negative-space.jpg" alt="负空间示例" width="420"><br><code>negative-space</code>（负空间）：用大片留白包围或偏置主体。</td></tr>
</table>

## 景深关系与镜头

<table>
<tr><td><img src="../assets/visual-composition/frame-within-frame.jpg" alt="框中框示例" width="420"><br><code>frame-within-frame</code>（框中框）：门、窗、栏杆等形成内部画框。</td><td><img src="../assets/visual-composition/foreground-obstruction.jpg" alt="前景遮挡示例" width="420"><br><code>foreground-obstruction</code>（前景遮挡）：柔化前景制造层次和代入感。</td></tr>
<tr><td><img src="../assets/visual-composition/reflection-composition.jpg" alt="倒影构图示例" width="420"><br><code>reflection-composition</code>（倒影构图）：由指定表面承载人物倒影。</td><td><img src="../assets/visual-composition/mirror-composition.jpg" alt="镜中窥视示例" width="420"><br><code>mirror-composition</code>（镜中窥视）：通过镜面组织主体和观察者视角。</td></tr>
<tr><td><img src="../assets/visual-composition/telephoto-compression.jpg" alt="长焦压缩示例" width="420"><br><code>telephoto-compression</code>（长焦压缩）：远处层次看起来被拉近、堆叠。</td><td><img src="../assets/visual-composition/environmental-portrait.jpg" alt="环境肖像示例" width="420"><br><code>environmental-portrait</code>（环境肖像）：人物和环境共同讲述身份与场景。</td></tr>
</table>

## 图片资产规则

这 30 张 JPEG 是为本仓库生成的原创说明图，仅借用了附件的黑白漫画线稿和浅蓝点缀作为风格参考。附件截图本身没有进入仓库，生成图也没有复制其中的文字、编号、标识或具体人物。仓库校验要求每个规范预设都必须存在且只能存在一张同名 `<preset-id>.jpg` 示例图。

`../assets/visual-composition-overview.jpg` 是 README 使用的派生总览图，只把同一批 30 张规范示例与稳定预设 ID 拼在一起；它不代表新增预设，也不是传给图像模型的参考图。
