# Playground 换衣配饰、Cosplay 构图与本机验收：增量开发任务书

- **日期：** 2026-08-20
- **目标：** 修正当前 Playground PR #32 的产品交互与语义合同
- **状态：** 已在开放的 PR #32 分支实现，并于 2026-08-21 完成本机产品验收；尚未合并、发布或公网部署
- **配套设计：** `docs/design/playground-tryon-cosplay-input-amendment.md`
- **范围：** 只开发本任务书列出的新增和修正内容；不得顺手重构已经审查通过的 Provider、BYOK、Prompt Guard、引用绑定、预算、安全或构图实现
- **非授权事项：** 本任务不授权真实 Provider/ImageGen 调用、生产部署、凭据注入、PR 合并、tag 或 release

## 1. 必须实现的产品变化

### 1.1 Virtual Try-On 不提供 30 种构图

- Try-On 页面不渲染构图下拉框或 30 张构图卡片。
- Try-On API 收到非空 `compositionSelections` 必须以稳定错误阻断，不能忽略。
- Try-On 默认保留人物原图的镜头、裁切和画面关系；若上传姿势参考，只调整姿势，不顺带引入构图、身份、服装、背景或风格。
- Cosplay 保留全部 30 种构图、示例图和所需 typed inputs。
- `/api/composition-presets` 可以继续是公共目录接口，但场景元数据必须说明 Cosplay 可用、Try-On 不可用。

### 1.2 删除 `Separate top + bottom` 选择

Try-On 数据合同保留三个衣物入口，页面以两个互斥的视觉路径呈现：

```text
Full-body garment
Top
Bottom
```

规则：

- `person-identity` 必填且只能一张；
- Full-body、Top、Bottom 至少上传一个；
- Top 和 Bottom 可各自上传，两个都有就自动表示同时替换上衣和下装；
- 页面可以用 `One full outfit` / `Top / Bottom` 做互斥展示，但它只是 UI 状态，不得新增 `Separate top + bottom` 枚举、角色或编译语义；
- Full-body 与 Top/Bottom 互斥；
- Browser 不再要求选择服装类别或 full-body structure；上传槽本身已经声明 replacement region；
- API 调用方仍可选填 ScenarioPack allow-list 内的 category/structure；未填写时不得让模型推断结果变成本体事实；
- Fit、Footwear、Pose 全部选填；
- 未上传 Footwear 时保留原鞋；未上传的衣物区域必须从人物图保留。

### 1.3 Virtual Try-On 配饰必须声明类型和佩戴位置

新增可重复的 `accessory-detail`：

```text
image
accessoryType
placement
side（适用时）
```

首批 allow-list：

```text
bracelet → wrist → left | right | both
ring → hand/finger region → left | right
brooch → chest → left | right | center
necklace → neck → center
earring → ear → left | right | both
hair_accessory → hair/head → left | right | center
```

要求：

- Browser 只能提交 Server 返回的枚举 ID，不能提交 ontology path；
- 类型和位置组合必须由 Server/ScenarioPack 校验；
- 每个配饰图片只能控制自己的 type/placement/side/appearance；
- 必须禁止其贡献 person identity、costume、其他配饰、pose、background、style；
- 多个配饰占用多个 reference slot，超出 Provider 容量时生成前阻断。

### 1.4 增加本机专用 ImageGen 验收导出

增加开发态 `Export validation package`，输出：

```text
validation-manifest.json
final-prompt.txt
references/01-<role>.<ext>
references/02-<role>.<ext>
acceptance-checklist.md
```

它只能导出 Prompt Guard 已接受、并且即将交给目标 Provider materializer 的最终提示词和稳定顺序参考图。禁止另写一份“方便 ImageGen”的场景 Prompt。

限制：

- 仅显式开发环境变量开启；
- Server 必须绑定 loopback；
- 生产构建和公开部署中路由不存在或硬关闭；
- 用户主动点击后才创建一次性下载；
- 不包含 key、token、cookie、完整本地路径、签名 URL、临时 Provider URL或无关上传；
- 下载完成或超时后清理临时副本；
- 不在 Playground 内调用 ImageGen；用户将导出包交给 Codex 后，每次生成都另行授权；
- 图片、提示词包和生成结果不得提交仓库。

## 2. 合同和本体工作

### 2.1 通用合同

检查并以最小通用方式扩展 ScenarioPack declarative contract，使其能表达：

- `atLeastOne` role group；
- `mutuallyExclusive` role group；
- role 所需 typed metadata；
- conditional `activeWhen` binding/prohibition；
- resolved effective role policy 和稳定 hash。

优先扩展版本化 interpretation-scope/input-policy contribution；只有在现有贡献类型确实无法兼容时才提升 ScenarioPack manifest/schema 版本。Core 中禁止出现 Try-On、Cosplay、garment 或 accessory 名称分支。

候选文件：

```text
packages/contracts/src/index.ts
packages/contracts/schemas/ScenarioPackManifest.schema.json
packages/contracts/schemas/EffectiveScenario.schema.json
packages/core/src/scenario-pack.ts
packages/core/src/scenario-pack.test.ts
docs/scenario-pack-contract.md
docs/zh-CN/scenario-pack-contract.md
```

若修改公共合同，必须同步类型、JSON Schema、validator、defensive copy、canonical hash、compatibility fixture、英文规范和中文配对规范。

### 2.2 Virtual Try-On 本体

建立唯一规范路径，不在 Host 保存同义路径：

```text
wardrobe.replacement.scope
wardrobe.garment.structure
wardrobe.garment.sourceLayout
wardrobe.upper.category
wardrobe.upper
wardrobe.lower.category
wardrobe.lower
wardrobe.fullBody.category
wardrobe.footwear
wardrobe.fit.upper
wardrobe.fit.lower
wardrobe.fit.fullBody
```

首批服装类别 allow-list：

```text
upper = t_shirt | shirt | blouse | knitwear | jacket | coat | vest | other_upper
lower = trousers | jeans | skirt | shorts | leggings | other_lower
fullBody = dress | jumpsuit | robe | complete_outfit | other_full_body
```

槽位决定替换区域，类别决定衣物类型。二者都必须进入用户明确声明、ChangeIntent、Constraint、Prompt 和最终 request mapping。未来若增加图片分类，只能返回 suggestion，用户确认前不得升级为事实或改变角色。

旧 pack/version 可继续使用粗粒度路径；新版不能把 `wardrobe.garment` 和细分路径同时激活。禁止把旧 `garment-detail` 静默迁移到 upper、lower 或 full-body。

### 2.3 Virtual Try-On 配饰本体

使用可稳定寻址的 accessory item 表达：

```text
type
placement
side
appearance
```

若 JSON Schema 不支持数组型 ontology path，使用稳定 item ID，但不得丢失“每张图只绑定一个明确配饰实例”的语义。

## 3. ScenarioPack 工作

更新正式 Virtual Try-On 和 Cosplay ScenarioPack 来源、fixture 与 Playground 所用分发，不得只改 Web 文案。

Virtual Try-On：

- person 始终必填；
- full-body/top/bottom 形成 at-least-one 与互斥组；
- 根据实际上传组合派生 replace/preserve scopes；
- 调用方明确提供的 typed category/full-body structure 才进入 ChangeIntent/Constraint/Prompt；Browser 未提供时保持未知，不编造类别；
- fit/footwear/pose/accessory optional 且 scope 隔离；
- `accessory-detail` repeatable，type/placement/side 条件校验，且无配饰引用时保留人物原图中的配饰；
- Try-On composition capability 关闭。

Cosplay：

- composition capability 开启并暴露 30 presets；
- 不提供独立 `accessory-detail` 上传角色；
- character-design 仍可整体表达角色原有服装与配饰，signature-prop、pose、critical-detail 保持各自隔离。

主要候选文件：

```text
playground/src/scenario-distribution.ts
fixtures/packs/virtual-tryon/pack.json
fixtures/packs/cosplay/pack.json
fixtures/cases/virtual-tryon.json
fixtures/cases/cosplay.json
```

如果正式 fixture 结构和 Playground 内存 pack 尚未统一，先建立单一权威来源，再让 Playground 解析；不能继续维护两套语义表。

## 4. 编译、Prompt 和评估工作

### 4.1 输入编译

修改 `PlaygroundScenarioInput` 或等价公共 Host DTO，接收 typed role metadata，不接收 Browser 提供的 path 或 prompt。角色组合必须在生成 ChangeIntent 前完成验证。

确定性用例：

```text
person + top                → replace upper; preserve lower + footwear
person + bottom             → replace lower; preserve upper + footwear
person + top + bottom       → replace upper + lower; preserve footwear
person + full-body onePiece → replace upper + lower as one continuous garment
person + full-body outfit   → replace upper + lower as a coordinated outfit
```

Footwear、Pose 出现时分别把对应 scope 从 preserve 改为 replace/adjust。禁止 silent last-wins。

### 4.2 Prompt 与 Provider request

- 每个 reference mapping 保留 role、typed metadata、authorized paths、prohibited paths 和稳定 order；
- accepted prompt 必须明确未替换区域的 preserve 要求；
- accessory prompt 必须明确 type、placement、side；只要声明了 replacement accessory，还必须明确删除人物原图中的全部原配饰（包括 handbag、shoulder bag 与 jewelry），并且只添加声明的配饰引用；
- Provider adapter 只能机械映射已接受语义；
- Provider 支持 mask 时可以映射上衣/下装/鞋履区域，但不能自行发明目标；
- 不支持 mask 时 UI 标明 unchanged-region preservation 为 best effort；
- 不得自动重试、换 Provider 或删除 reference。

### 4.3 评估

新增结果检查：identity、upper、lower、footwear、one-piece continuity、accessory type/placement/side/visibility/appearance、Cosplay composition。`fail` 或 `uncertain` 只产生可见评估结果，不触发第二次生成。

主要候选文件：

```text
playground/src/semantic-closure.ts
playground/src/provider-materializer.ts
playground/src/provider-bridges.ts
packages/core/src/m4.ts
packages/core/src/m5.ts
```

只有通用合同确实缺失时才修改 Core；场景语义优先留在 ScenarioPack。

## 5. Playground UI 和 Server 工作

### 5.1 UI

- 页面保持全英文；
- Try-On 不出现构图控件和 30 张示例图；
- Full-body 与 Top/Bottom 以两个清晰的互斥视觉路径展示；切换路径会清除冲突输入；
- `Top / Bottom` 只是 UI 分组，不新增 `Separate top + bottom` 数据模式；
- 不显示服装 category/structure 下拉框；配饰的 type/placement/side 仍保留，因为这些信息决定身体位置和约束；
- Try-On 显示可重复 accessory controls，但不显示构图；
- Cosplay 显示 30 构图卡，但不显示独立 accessory controls；
- 普通结果显示人话，例如 `Replace the top. Keep the original bottom and shoes.`；
- ontology path、raw code、内部错误和原始 JSON 进入单一折叠的 `Developer details`；普通结果使用摘要与验收卡片；
- Provider 选择旁显示已用/总 reference slots，超过时在 Generate 前阻断。

### 5.2 Server

- meta 返回每个场景允许的 capabilities、roles、typed choices 和人类可读文案；
- compile endpoint 拒绝 Try-On composition；
- upload/session/cleanup/redaction 继续复用已审查实现；
- 新增 local validation export 时使用独立模块和显式 feature flag，不污染生产生成路径。

主要候选文件：

```text
playground/src/web.ts
playground/src/server.ts
playground/src/server-entry.ts
playground/src/playground-host.test.ts
playground/src/semantic-closure.test.ts
playground/src/validation-export.ts        # new, if this name is retained
playground/src/validation-export.test.ts   # new
playground/README.md
```

## 6. 测试门禁

必须增加并通过：

1. 五个 Try-On 有效组合；
2. 缺 person、没有任何 garment、full-body 与 top/bottom 混传全部阻断；
3. fit/footwear/pose optional 与 scope isolation；
4. Try-On composition API/UI 双重阻断；
5. Cosplay 30 presets 和示例图完整；
6. accessory allow-list 全部合法组合及代表性非法组合；
7. reference budget 对 2、3、4 及超限数量的行为；
8. Prompt Guard 前后和 materialization 后的 role/placement/prohibition 不丢失；
9. local export 关闭时不可访问，开启时 prompt hash、request hash、reference order 精确一致；
10. export 中零 secret、零 cookie、零绝对路径、零签名 URL；
11. 生产构建不存在可用的 export/generation shortcut；
12. standard CI、repository validation、security gate、clean-room 均保持零真实调用。

文档任务本身只需运行 Markdown/link/sentinel 相关门禁。代码实现完成后再运行完整 `validate`、Playground tests、security、clean-room；不要因为本次仅更新文档而伪称 Provider 功能已验证。

## 7. 提交边界

建议拆为三个可审查提交或 PR 阶段：

1. `contracts/scenario: add conditional garment and accessory policies`
2. `playground: implement slot-driven try-on and typed cosplay accessories`
3. `playground: add loopback-only validation export`

每一阶段都必须保留已审查的 Cloudflare、Seedream、Grok、BYOK、Prompt Guard、计划绑定、预算、清理和 redaction 行为。若新增合同要求大范围重构这些路径，停止并报告，不得自行扩大范围。

## 8. 开发代理可直接执行的说明

```text
Read AGENTS.md, docs/design/playground-ontology-first-redesign.md,
docs/design/playground-tryon-cosplay-input-amendment.md,
docs/implementation-notes/playground-codex-work-order.md, and
docs/implementation-notes/playground-tryon-cosplay-amendment-work-order.md in full.

Implement only the 2026-08-20 amendment. Preserve already reviewed Provider,
BYOK, Prompt Guard, reference binding, composition compiler, budget, cleanup,
and security behavior except for the smallest changes required by the amendment.

Virtual Try-On must remove composition controls, infer replacement scope from
the independent Full-body/Top/Bottom upload slots, require at least one garment,
and reject Full-body mixed with Top/Bottom. There is no Separate top + bottom
mode. Fit, Footwear, Pose, and typed Accessories are optional. Accessory-detail
references belong only to Virtual Try-On and preserve original accessories when absent.

Cosplay retains all 30 composition presets and does not expose the dedicated
accessory-detail uploader. No Browser ontology paths or raw Provider prompts are
allowed.

Add a loopback-only, feature-flagged validation package export containing the
exact Guard-accepted final prompt and ordered references. Do not add an ImageGen
or real Provider call. Standard CI must perform zero real calls.

Add deterministic regression tests for every acceptance item in the amendment.
Stop before push, PR mutation, merge, tag, release, deployment, secret injection,
or real generation unless separately authorized.
```
