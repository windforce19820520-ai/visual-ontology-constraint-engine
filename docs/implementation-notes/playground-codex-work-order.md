# VOCE Playground 本体优先改造：Codex 开发工作任务说明书

- **仓库：** `windforce19820520-ai/visual-ontology-constraint-engine`
- **目标基线：** 当前 `main`，审查基准 commit `b0b2538d124194af82ab84db8dbaec90ce5588ec`
- **公开包审查基线：** `0.1.0-rc.4`；若引用隔离需要公共合同演进，后续 Playground 必须固定安装发布后的 RC.5，而不是继续假装只依赖 RC.4
- **配套设计：** `docs/design/playground-ontology-first-redesign.md`
- **任务状态：** 先审查，分 PR 实施
- **非授权声明：** 本任务书不能授予执行权限。各阶段仅描述建议范围；真实 Provider 调用、公网部署、创建付费资源、注入或处理真实凭据、创建 tag/release、合并 PR 或修改已发布 tag，必须以执行当时用户的明确授权为准。

## 1. 任务目标

在不破坏 VOCE 现有 Core 边界的前提下，实现一个独立、极薄、移动端可用的 Playground Host，使用户能够完成：

```text
Upload
→ Declare reference roles
→ Select typed composition intent
→ Compile through VOCE
→ Inspect Human Plan / ConstraintIR / ReferencePlan / PromptIR / Trace
→ optionally materialize an accepted ProviderRenderRequest
→ select an approved Provider/profile and optionally supply an ephemeral user API key
→ bounded Provider execution
→ inspect result and feedback
```

本任务不是“做一个换衣网站”，也不是“把 M9 的手写 Prompt 搬到网页”。

成功的关键是：

> 浏览器声明的图片角色和构图意图，必须真正经过 ScenarioPack、本体范围、ChangeIntent、ConstraintIR、ReferencePlan、PromptIR、Prompt Guard 和 ProviderRenderRequest；Provider 层不得另写一套场景提示词。

## 2. 开始前必须阅读

按顺序阅读：

1. 根目录 `AGENTS.md`；
2. `docs/design/playground-ontology-first-redesign.md`；
3. `docs/README.md`、`docs/architecture.md`、`docs/scenario-pack-contract.md`；
4. `packages/core/src/index.ts`；
5. `packages/core/src/evidence.ts`；
6. `packages/core/src/m4.ts`；
7. `packages/core/src/m5.ts`；
8. `packages/core/src/m6.ts`；
9. `packages/core/src/composition.ts`；
10. `packages/contracts/schemas/RequestedScopePlan.schema.json`；
11. `packages/contracts/schemas/ChangeIntent.schema.json`；
12. `packages/contracts/schemas/SourceBinding.schema.json`；
13. `packages/contracts/schemas/ReferenceCandidate.schema.json`；
14. Prompt IR、Prompt Candidate、Prompt Guard、ProviderRenderRequest、Provider capability、RemoteCallAuthorization 相关 schemas；
15. `fixtures/packs/cosplay/pack.json`；
16. `fixtures/packs/virtual-tryon/pack.json`；
17. `scripts/m9-seedream-smoke.mjs`；
18. 根 `package.json`、workspace/release/validator/clean-room 相关脚本。

不要只读 README 后凭经验设计。

## 3. 第一阶段：repository-grounded implementation review

### 3.1 第一条指令

收到本任务后，先不要编码。先提交一份审查结论，至少回答：

1. 当前 public package surface 中，从 ScenarioPack 到 `ProviderRenderRequest` 的可复用函数、类型和缺口分别是什么；
2. 当前 Evidence Resolver 对 `RequestedScopePlan`、Observation、ObservationDecision、SourceBinding、BindingDecision 的实际要求；
3. 为什么“上传到某个槽位”不能直接伪造成 Observation 或 confirmed SourceBinding；
4. `ChangeIntent` 无 `requestedValue` 时如何进入 ConstraintIR；
5. `ReferenceCandidate.constraintIds`、`ontologyScopes`、`sourceBindingIds` 在 ReferencePlan 和 PromptIR 中实际保留到什么程度，以及为什么 final `ReferenceCandidate` 必须在 `ConstraintIR` 生成后再绑定；
6. 当前 Cosplay `interpretationScopes` 与 Virtual Try-On `interpretationScopes` 的结构差异；
7. 四个必选 Try-On 角色、可选姿势参考，以及 Cosplay 可重复 supplemental reference 还缺哪些 ontology path、role policy、rule、fixture 和 acceptance test；
8. M9 中哪些内容是可复用的真实 Provider 基础设施，哪些是不能进入 Playground 的手写语义；
9. 当前 `ProviderRenderRequest` 是否足够承载 Provider 所需语义，特别是 prohibition / negative prompt / reference-isolation；在引用隔离进入 Prompt Guard 与 accepted request 之前，不得宣称语义闭环完成；
10. `/playground` 如何加入而不进入 `packages/*` 发布边界；
11. 如何建立 registry 精确安装 `0.1.0-rc.4` 的 clean-room gate；
12. 本设计中任何与当前代码合同不一致的地方；
13. Seedream、Grok Imagine 与其他候选 Provider 的当前能力、价格、隐私、凭据方式和引用数量是否满足所选路径；
14. 用户临时 API Key 如何在不进入 VOCE 合同、hash、trace、日志或持久化存储的情况下完成一次调用。

### 3.2 审查输出格式

```text
Current-state audit
Public API reuse map
Contract gaps
Scenario-pack gaps
Proposed minimum architecture
Provisional file plan
PR split
Offline test plan
Risks / blockers
Questions requiring product approval
```

### 3.3 审查停止点

完成审查后停止，不要自动进入编码。等待产品确认 PR 0 的范围。

## 4. 总体工程原则

### 4.1 唯一语义链路

必须保持：

```text
ScenarioPack-derived declared role policy / typed user intent
→ RequestedScopePlan + ChangeIntent + ReferenceCandidateSeed
→ Evidence Resolver / OntologyInstance
→ ConstraintIR
→ ReferenceCandidateBinder
→ ReferencePlan
→ PipelinePlan
→ PromptIR
→ PromptCandidateIR
→ Prompt Guard
→ ProviderRenderRequest
→ deterministic Provider materialization
→ authorized Provider execution
```

禁止：

```text
VOCE 只展示 Plan
→ Host 另写 Try-On/Cosplay Prompt
→ Provider
```

### 4.2 声明角色不等于看图事实

V1 默认只有：

```text
用户声明的 slot role
ScenarioPack-derived Host role-policy projection
构图 preset
有限 typed user input
```

角色到本体路径、操作、重要性以及禁止贡献必须来自不可变 ScenarioPack distribution。Host 只做校验和投影，不得维护第二套手写语义表。`preserve`、`reproduce`、`inspire` 分别确定性映射为 `preserve`、`replace`、`adjust`；`exclude` 不创建 target `remove` intent，而是进入后续受 Guard 保护的 reference-isolation 数据。

没有真实 Reference Interpreter 时：

- 不创建图像颜色、材质、武器类型、人物尺寸等 Observation；
- 不创建依赖虚假 Observation 的 SourceBinding；
- 不显示 confirmed ontology fact；
- UI 显示 `Declared source role`，不要显示成 `Observed fact`；
- 允许 OntologyInstance 存在 unknown / unspecified path；
- 允许 role-derived ChangeIntent 继续生成约束。

### 4.3 Core 不识别场景名

任何场景差异只能来自：

```text
ScenarioPack
ScenarioPack distribution
ResolvedDeclaredReferenceRolePolicy Host projection
Provider capability profile
```

Core 内禁止：

```ts
if (scenario === 'cosplay')
if (scenario === 'virtual-tryon')
```

### 4.4 Provider 不能重写语义

Provider materializer 只能机械转换已接受的 `ProviderRenderRequest`。

姿势参考可以是现成骨架图、普通动作照片或姿势草图。V1 只负责上传、角色声明、顺序和引用隔离，不开发骨架生成、姿势提取或骨架编辑器。专用结构控制参数只能由 Adapter 根据已接受的 `pose` mapping 和 capability profile 机械映射；通用多图 Provider 所需的“只采用姿势”语义必须在 Guard 前产生。

禁止复制或改写：

```text
COSPLAY_FIDELITY_PROMPT
COMPOSITION_GLOSSES
INPUT_SPECS.binding
```

禁止在 Materializer 中：

- 按 scenario ID 选择主提示词；
- 补写“人物必须像图 1”等场景模板；
- 加回 excluded constraint；
- 读取原始 user prompt；
- 猜图片内容；
- 静默删除 required reference；
- 绕过 Prompt Guard 润色 locked section。

## 5. PR 0：语义闭环

### 5.1 目标

在没有 UI、没有真实 Provider 的条件下，证明两个场景都能从 Host 声明输入完整编译到有效的 `ProviderRenderRequest`。

### 5.2 交付内容

#### A. Host scenario distribution

建立不可变、可校验的 Playground 场景发行物。最终目录由审查决定，但必须满足：

- 不从 production runtime 依赖 `testkit`；
- 不把 fixture 当作未声明的公共合同；
- 不复制两套构图规则；
- scenario content 有 deterministic digest；
- CI 检查 drift；
- 通过 public ScenarioPack registry API 加载；
- authoritative role semantics 位于 ScenarioPack `interpretationScopes` 或其他审查通过的 declarative contribution 中；
- 不包含 executable scenario code、secret、network permission。

#### B. ResolvedDeclaredReferenceRolePolicy

实现 ScenarioPack-derived Host projection，至少包含：

```text
scenarioId
role
cardinality
authorized target paths
operation
importance
human-readable non-contributions
prohibited target paths
policy digest
```

Browser 只能提交 role ID，不能提交 ontology path。

Host 可以维护 UI label、帮助文本和布局，但不得独立维护 target path、operation、importance 或 prohibition。任何 Host 配置与 ScenarioPack semantic digest 不一致都必须阻塞。

#### C. ScenarioInputCompiler

实现一个纯确定性编译器：

```ts
compileScenarioInput(input): ScenarioCompilationSeed
```

输出：

```text
RequestedScopePlan
ChangeIntent[]
ReferenceCandidateSeed[]          // Host DTO
ReferenceDependencySeed[]         // Host DTO
PlaygroundDeclaredRolePlan
```

`ScenarioInputCompiler` 不允许预造 final `ReferenceCandidate.constraintIds`。这些 ID 由 M4 创建，可能因 cardinality merge 或 preference degradation 改变，只有 `ConstraintIR` 生成后才存在。

要求：

- 所有 ID 和 hash 稳定；
- 输入顺序在语义等价时不影响结果；
- 每个 seed 包含 asset、role、importance、authorized ontology scopes、authorized target paths、`supportingIntentIds`；
- 每个 seed 同时保留 ScenarioPack-derived `prohibitedTargetPaths`，用于后续 Guard-protected reference isolation；
- `sourceHintIds` 绑定 asset ID、role-policy ID 与 candidate-seed ID；
- seed 不包含未授权 path；
- 不创建 fake Observation；
- 不创建无证据 SourceBinding；
- unknown role、unknown path、重复冲突 role、缺失 required slot 均在 Core 调用前失败。
- `pose` 只接受用户已准备好的骨架图、动作照片或姿势草图；不得因为上传到 pose slot 就伪造任何姿势 Observation。

#### D. ReferenceCandidateBinder

在 `ConstraintIR` 生成后，实现第二个纯确定性 Host 步骤：

```ts
bindReferenceCandidates({
  seeds,
  dependencySeeds,
  constraintIR,
}): ReferenceCandidateBindingResult
```

输出：

```text
ReferenceCandidate[]
ReferenceDependency[]
omittedSeeds[]
```

绑定规则：

- 只考虑 status 为 `active` 或 `satisfied` 的 constraints；
- constraint 的 `sourceIds` 必须包含该 seed 的某个精确 `supportingIntentId`；
- constraint target path 必须落在该 seed 的 allow-list；
- final `constraintIds` 和 `goalIds` 从真实 ConstraintIR 生成；
- 不按 role 名、Prompt 文本、asset 外观或插入顺序猜绑定；
- zero-observation V1 的 `sourceBindingIds` 保持空数组；
- authorized 与 prohibited contributions 必须从同一 ScenarioPack role policy 投影，不能由 Binder 或 Materializer 猜测；
- 所有 final Core 字段完成后再计算 `candidateHash`；
- preferred seed 若没有 surviving constraint，可带稳定 reason 省略；
- hard/required seed 若没有 surviving constraint，必须 block，不能生成无作用域 reference；
- dependency 只有在两端 candidate 均 surviving 时才最终化；hard/required endpoint 缺失必须 block。

必须增加测试证明：binder 跟随 M4 merge/degradation 的实际结果，而不是预测 constraint ID。

#### E. Virtual Try-On 四个必选角色与可选姿势参考

补齐并测试：

```text
person-identity
garment-detail
wearing-effect
footwear-detail
pose（可选，UI 名称为 pose reference）
```

四个产品角色保持必选；`pose` 是仅授权 `pose` path 的可选第五参考，默认 preferred。至少覆盖设计文档定义的目标路径。若当前 ontology 命名与设计不同，先在审查中说明迁移方案，不能在 Host 中同时维护同义路径。

#### F. Cosplay 角色归一化

至少覆盖：

```text
person-identity
character-design
signature-prop-detail
pose
critical-detail（有限 allow-list）
```

UI 使用两个必选 reference（person、character）和可重复添加的 supplemental references。这样 signature-prop 与 pose 可以同时存在，而不是被一个固定第三格强制二选一。

验证：

- character reference 不链接 `person.identity`；
- signature prop required 时不会被 preferred pose 挤掉；
- composition preset 不消耗 reference budget。
- pose reference 只链接 `pose`，并携带身份、服装、背景和风格的 Guard-protected prohibited contributions。

#### G. Offline compilation harness

实现完整离线路径：

```text
ScenarioCompilationSeed
→ OntologyInstance
→ ConstraintIR
→ ReferenceCandidateBinder
→ ReferencePlan
→ PipelinePlan
→ PromptIR
→ deterministic PromptCandidateIR
→ Prompt Guard accepted
→ ProviderRenderRequest
```

不得止步于 `PromptIR`。

如果当前公共合同不能把 reference prohibition/isolation 从 ScenarioPack 一直带到 accepted `ProviderRenderRequest`，PR 0 必须先报告并实现获批的最小 RC.5 合同修订及回归测试；不得把语义留给 PR B 的 Materializer 补写。

#### H. Human Plan projection

清楚区分：

```text
Declared role
Authorized contribution
Not authorized contribution
Observed facts
Confirmed source bindings
```

无 Observation 时明确显示：

```text
Observed facts: none
Confirmed source bindings: none
```

### 5.3 PR 0 验收测试

至少包含：

1. Try-On 四图 + `full-shot` → 四个 candidate seed、四个 final candidate、四张 planned reference，且构图不删除 reference；
2. Try-On 四图 + 可选 pose reference → pose 只链接 `pose`，总计五张 planned reference（profile capacity 允许时）；
3. Cosplay person + character + signature prop + pose + `low-angle` → 两个 supplemental candidates 可共存；
4. character seed/final candidate 的 constraint links 不含 `person.identity`；
5. character 与 pose mappings 的 prohibited contributions 在 Prompt Guard 和 accepted request 后仍完整、不可被 candidate 修改；
6. 每个 final candidate 的 constraint 必须在 `sourceIds` 中含该 seed 的精确 supporting intent ID，且 path 位于 allow-list；
7. M4 合并同一路径 constraint 后，binder 链接合并后的真实 constraint ID；
8. preferred role constraint 若已 degradation/unsatisfied → seed 稳定省略；required seed 无 surviving constraint → compile blocked；
9. required signature prop + preferred pose + reference limit 3 → pose 被省略，signature prop 保留；
10. required `medium-shot` + preferred `close-up` → close-up degradation，且不进入 PromptIR/ProviderRenderRequest sections；
11. 只交换两个 asset 的 role → `assetSetHash`、reference plan 或 Provider request binding 发生变化；
12. 未知 role/path → Server/Host validation fail；
13. 未提供 Observation → Observation、SourceBinding、confirmed fact 数量为 0；
14. 语义相同但输入集合顺序不同 → deterministic hashes 相同；
15. public exports only，静态检查无 `packages/core/src` deep import。

### 5.4 PR 0 停止点

Draft PR 建好、离线测试通过后停止。不要开始页面开发。

## 6. PR A：Playground Shell + Compile

### 6.1 目标

实现公开体验的 Compile 部分，Render 始终关闭。

### 6.2 建议范围

```text
/playground standalone app
Vite + TypeScript
React 可选
Node 20+ Server/BFF
same-origin deployment model
no DB
no Redis
```

### 6.3 API

实现：

```text
GET /api/meta
GET /api/composition-presets
POST /api/compile
```

Compile Server 必须重新：

```text
validate uploads
resolve scenario distribution
compile declared roles
expand presets via public API
run full VOCE compile
create ProviderRenderRequest
sanitize DTO
```

### 6.4 UI

至少：

```text
Virtual Try-On / Cosplay tabs
Try-On four required uploads plus optional pose reference
Cosplay two required uploads plus repeatable supplemental reference controls
supplemental role selector for signature-prop, pose, and allow-listed critical detail
composition preset selector
Compile Plan button
Human Plan
Constraints
Prompt IR
Trace
render-disabled state
rights confirmation
pose-reference guidance: ready-made skeleton, action photo, or pose sketch; no editor or extraction
mobile 360 / 390 / 430
accessibility basics
```

Browser 不能运行 Core，不能提交 arbitrary path，不能提交 raw Provider prompt。

### 6.5 PR A 测试

覆盖组件、Server、移动端和集成测试；CI 保持零 Provider 调用。

Draft PR 通过后停止。

## 7. PR B：ProviderRequestMaterializer + Mock Render

### 7.1 目标

把已 Guard 的 `ProviderRenderRequest` 机械转换成一个 native request，并通过 Mock 完成 Generate 全链路。

### 7.2 Materializer

实现设计文档中的接口和 receipt。

每个 native semantic instruction 必须能追踪到：

```text
accepted section ID
或
referenceMapping.constraintIds 对应的 accepted constraints
```

允许固定协议文字，但固定文字不能包含场景路径、场景值或推断事实。

Materializer 可以把 Guard-accepted `pose` mapping 机械映射到 capability profile 声明的专用 structural-control field；没有专用字段时只能保持其已接受的通用多图顺序。它不能自行补写“只采用姿势”等语义。

### 7.3 Compile/Generate binding

实现：

```text
ProviderRenderRequest.requestHash
assetSetHash
scenario distribution hash
adapter/profile digest
materializer digest
credential mode (`user_ephemeral`), never credential bytes
```

Generate 不信任客户端返回的 plan。Server 必须重新编译、重新哈希、再比较。

任一变化返回：

```text
409 PLAN_BINDING_MISMATCH
```

并保证零 Provider call。

### 7.4 Mock Provider

实现：

- capability preflight；
- render-disabled gate；
- per-client/concurrency/global budget interfaces；
- exactly one mock attempt；
- normalized result；
- success/failure/timeout/cancel cleanup；
- safe logs and error mapping。

### 7.5 PR B 测试

至少：

- materializer deterministic；
- no scenario prompt constant；
- no excluded constraint；
- no locked section mutation；
- no required reference deletion；
- unsupported reference count fails before transport；
- changed file/role/preset/profile/materializer fails binding；
- render disabled zero calls；
- cleanup all paths；
- no image/Base64/full prompt/secret in logs；
- CI mock only。

Draft PR 通过后停止。

## 8. PR C：经批准的 Provider Profiles 与 BYOK

### 8.1 先做能力评估，不先写 Adapter

必须查询当前官方文档并输出：

```text
Provider / exact model profile
per-image price, free-tier or quota nature, and reset rules
maximum reference count
reference order behavior
input media / bytes / dimensions
output size / format / count
server credential mechanism
privacy / retention / training policy
rate and concurrency constraints
failure and retry semantics
cost-overrun behavior
user-provided credential support and safe server-side injection path
```

最低要求：

```text
Try-On >= 4 required references and >= 5 when optional pose is selected
Cosplay >= 2 required references and >= 4 for the signature-prop-plus-pose path
server-only secret
no public input URL requirement
no silent paid fallback
one output
```

初始候选至少评估 Seedream 与 Grok Imagine；它们不是因为被写进任务书就自动获批。免费模型可以作为额外候选，但不是硬性要求。

### 8.2 产品确认后编码

只有在用户明确选择 Provider/profile 后，才实现：

- provider-specific materializer/bridge；
- allow-listed Provider/profile selector；
- `user_ephemeral` BYOK credential mode；
- disabled-by-default transport；
- capability profile；
- upload preprocessing policy；
- mock transport fixtures；
- deployment env schema；
- no secret committed。

Compile 在没有 API Key 时始终可用。Generate 的用户 Key：

- 仅通过 HTTPS request-scoped secret channel 传入；
- 不写 Cookie、localStorage、sessionStorage、数据库、缓存、analytics 或错误报告；
- 不进入 VOCE contract、hash、trace、receipt、response 或日志；
- 在 plan binding 和 authorization 通过后才注入 Adapter；
- 不发起额外的 Key 验证请求；
- 一次调用、零自动重试，结束即丢弃；
- 只能用于部署方 allow-list 中的官方 Provider endpoint/model。

### 8.3 真实调用授权

以下动作必须再次明确批准：

```text
注入真实 secret
接收并使用用户提供的真实 API Key
执行一次真实 smoke
部署公网
开启 renderEnabled
创建可能收费的云资源
超过已披露的预算或配额后继续调用
```

未经批准只允许 preflight 和 Mock。

## 9. PR D：部署与反馈闭环

在 PR A/B/C 验收且用户明确授权后再做：

```text
public deployment
secret injection
rate limits
global daily/concurrency abuse cap（BYOK 仍适用）
one bounded smoke per scenario
feedback UI
sanitized GitHub issue handoff
anonymous aggregate metrics
README demo link
```

不允许因 Render 关闭而让 Compile 页面不可用。

## 10. 文件边界

Codex 在审查后给出最终文件计划。原则上：

```text
playground/
  src/web/
  src/server/
  src/shared/
  scenarios/
  tests/
```

禁止：

```text
把 playground 放进 packages/core
把场景 UI 逻辑写进 Core
从 packages/core/src deep import
依赖 testkit 作为 production runtime
改 v0.1.0-rc.4 tag
未经审查和批准、仅为了网页方便修改 Core public contract
```

RC.4 是审查基线，不是永久依赖。每个可部署 Playground build 必须固定安装一个精确发布版本；如果 PR 0 获批并修改 reference-isolation public contract，先发布 RC.5，再把 registry clean-room gate 与 Playground 依赖一起固定到 RC.5。

如果确实发现 public contract 缺口：

1. 先写 gap report；
2. 给出 Host workaround 与 Core evolution 两个方案；
3. 说明兼容性、release 影响和测试；
4. 等产品确认；
5. 不要顺手扩大 Core API。

## 11. 测试与质量门

每个 PR 使用当前仓库标准命令。最低运行：

```text
npm run validate
npm run typecheck
npm test
```

同时执行该 PR 新增的 Playground offline/component/server/clean-room gates。

禁止在 CI 中：

```text
真实 Provider call
外网依赖的脆弱测试
secret
私人图片
临时签名 URL
付费资源
```

## 12. PR 规范

每个 PR：

- 独立 feature branch；
- Draft PR；
- 一个明确目标；
- 不混入无关重构；
- PR 描述列出设计对应章节；
- 列出变更文件、测试、风险、未决问题；
- 明确写 `Real provider calls: 0`；
- 附上 deterministic hashes 或 sanitized fixture evidence；
- 等 maintainer review 后再继续下一 PR。

建议分支：

```text
codex/playground-semantic-closure
codex/playground-compile-host
codex/playground-materializer-mock
codex/playground-approved-providers
codex/playground-public-deploy
```

## 13. 必须停止并询问的情况

出现任何一项立即停止：

```text
需要 Core 按 scenario 名分支
需要 deep import
需要把 Provider prompt 写进 ScenarioPack
需要在 Guard 后手写语义 Prompt
需要 fake Observation / SourceBinding / confirmed fact
需要静默删 required reference
需要把 raw Browser text 直接送 Provider
需要修改发布 tag
需要 real call / deploy / paid resource / secret
需要把用户图片提交到 GitHub
需要持久化或记录用户 API Key、允许任意 Provider endpoint，或额外调用一次 API 验证 Key
```

## 14. 每轮向用户汇报格式

```text
完成内容
实际修改文件
关键设计选择
测试结果
未解决风险
需要用户批准的下一步
PR 链接
```

不要只说“已经完成”，也不要把 mock success 说成真实 Provider success。

## 15. Codex 首轮可直接使用的指令

```text
请先阅读根 AGENTS.md、docs/design/playground-ontology-first-redesign.md、
docs/implementation-notes/playground-codex-work-order.md，以及任务书列出的 Core、contracts、
scenario fixtures 和 M9 文件。

本轮只做 repository-grounded implementation review，不编码、不创建 tag/release、
不调用真实 Provider、不部署、不写入 secret。

请按任务书第 3 节输出：Current-state audit、Public API reuse map、Contract gaps、
Scenario-pack gaps、Proposed minimum architecture、Provisional file plan、PR split、
Offline test plan、Risks/blockers、Questions requiring product approval。

重点证明或否定：
1. declared role 如何在不伪造 Observation/SourceBinding 的情况下先生成 ChangeIntent 与
   ReferenceCandidateSeed，再在 ConstraintIR 后绑定成 final ReferenceCandidate，并进入
   ReferencePlan、PromptIR 和 ProviderRenderRequest；
2. Try-On 四个必选参考与可选姿势参考当前缺失的场景合同，以及 Cosplay prop 与 pose 共存所需的 supplemental-reference 合同；
3. ProviderRenderRequest 到经批准 Seedream、Grok Imagine 或其他候选 Provider/profile 的合法机械桥接点，以及用户临时 API Key 的请求级安全边界；
4. 为什么 M9 的手写 fidelity prompt/gloss 不能作为 Playground 实现；
5. reference prohibition/isolation 是否在 Prompt Guard 前形成并进入 accepted ProviderRenderRequest；如果不能，是否存在必须修改 Core public contract 的真实阻塞。

完成审查后停止，等我确认 PR 0 范围。
```

## 16. 用户确认 PR 0 后的指令

```text
基于已确认的 repository-grounded review，只实施 PR 0：Semantic closure before UI。

严格遵守 docs/design/playground-ontology-first-redesign.md 和
playground-codex-work-order.md 第 5 节。

目标是两个场景在离线、无 UI、无真实 Provider 条件下，从 ScenarioPack-derived declared roles 生成
candidate seeds，经 M4 产生真实 constraints，再由 ReferenceCandidateBinder 完成 final candidates，
最终编译到保留 Guard-protected reference isolation 的有效 ProviderRenderRequest，并有 deterministic tests。
必须覆盖 Try-On 四个必选参考加可选姿势，以及 Cosplay signature prop 与 pose 同时存在的路径；V1 不开发
姿势提取、骨架生成或骨架编辑器。

禁止：页面开发、Provider materializer、真实网络、deep import、场景分支进 Core、
手写场景 Prompt、fake Observation/SourceBinding、处理真实 API Key。

完成后运行仓库标准离线 gates，创建 Draft PR，报告文件、测试、hash evidence、风险和待确认项，
然后停止。
```
