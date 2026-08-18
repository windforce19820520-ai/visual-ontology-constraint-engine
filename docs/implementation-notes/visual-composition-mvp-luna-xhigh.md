# 构图本体首批闭环：Luna 极高开发任务书

> 历史完成记录：本任务书用于 RC.4 之前的功能实现，相关能力已经随 `v0.1.0-rc.4` 发布。本文保留原始基线、分支、授权边界和停止条件用于审计，不应作为当前开发任务再次执行；当前功能和发布证据分别以正式设计、构图使用指南及 RC.4 验收报告为准。

这是一份可直接交给 `gpt-5.6-luna`、推理强度 `xhigh` 的实施说明。正式设计以 [`docs/design/visual-composition-mvp.md`](../design/visual-composition-mvp.md) 为准；本文件规定开发范围、顺序、验收证据和停止条件。

## 一、任务目标

在 VOCE 中一次性完成“构图选择 → 原子本体事实 → 冲突处理 → 有效约束 → 提示词生成 → Prompt Guard 验证”的首批完整闭环。

必须同时实现：

1. 通用构图本体和 30 个 UI 预设的原子展开；
2. 单值冲突、跨路径冲突和缺失依赖的确定性处理；
3. `required` 胜过 `preferred` 时，对失败偏好做明确 `unsatisfied` 处置；
4. PromptCompiler 只消费有效约束，并读取经过哈希核对的 ScenarioPack prompt policy；
5. Prompt IR 明确记录被排除约束；
6. Prompt Guard 证明被降级约束没有通过结构化链接重新进入提示词。

只完成其中一半不算完成。尤其禁止出现“已经生成 `Degradation`，但失败约束仍为 `active`，PromptCompiler 仍将它写入提示词”的中间结果。

## 二、基线与分支

- 唯一开发基线：`main@2486935fb4d7cf062c6e456f967c1ad6d7fe0a8a`。
- 从该 SHA 创建 `codex/visual-composition-mvp` 功能分支。
- 仓库里存在外部 PR #23；本任务不审查、不合并、不 cherry-pick，也不以其代码作为实现来源。
- 开始前确认工作树干净、HEAD 与上述基线一致，并完整阅读根目录 `AGENTS.md` 和正式设计。
- 如果 `main` 已前进，不要自行换基线；先报告新旧 SHA 和差异，等待用户决定。

## 三、授权边界

本任务授权：

- 修改本地功能分支；
- 增加或修改公开合同、JSON Schema、Core、CLI、testkit、fixtures 和相关文档；
- 执行全部离线测试与 release-candidate 门禁；
- 测试全部通过后提交、推送，并创建 Draft PR。

本任务不授权：

- 合并 PR；
- 修改或关闭 issue；
- tag、GitHub Release、npm 发布或版本号修改；
- 调用 Seedream 或其他真实/付费 Provider；
- 使用用户截图、私人图片、临时 URL 或凭据；
- 开发 Playground/UI；
- 接入构图参考图；
- 修改外部 PR #23；
- 宣称生产就绪。

标准测试必须保持离线、Mock-first，不得新增网络请求。

## 四、必须遵守的架构约束

1. 构图属于现有 `camera` 模块；不要增加第二个顶层 `composition`。
2. 身体方向仍属于 `pose`，头部视角仍属于 `expression`，剪影光效仍属于 `lighting`。
3. ScenarioPack 仍然是声明式数据。Core 不得导入任何具体 pack，不得比较 scenario ID，不得按 `virtual-tryon`、`cosplay` 或 `product-shot` 名称分支。
4. Provider 特性留在 adapter；首批只生成 provider-neutral Prompt IR。
5. 预设卡是本体选择器，不是 Provider 参考图，不创建 `SourceBinding` 或 `PlannedReference`，不占 reference budget。
6. 不允许 silent last-wins。输入顺序、pack 顺序、字母顺序和哈希顺序都不能决定语义胜负。
7. 所有输入做 defensive copy；所有输出使用 canonical JSON、稳定 code-unit 排序和确定性哈希。

## 五、第一阶段：公开合同与 Schema

主要文件：

- `packages/contracts/src/index.ts`
- `packages/contracts/schemas/*.schema.json`
- `packages/contracts/src/contracts.test.ts` 或现有相应测试文件
- `packages/core/src/index.ts`
- `scripts/validate-repository.mjs`

### 5.1 类型化三个贡献类别

为本功能加入最小、明确的公开类型：

- `OntologyPathDefinition`
  - `path`
  - `valueKind: 'boolean'|'enum'|'string'|'number'`
  - `cardinality: 'one'|'many'`
  - `allowedValues?`
  - `defaultImportance?`
- `OntologyVocabularyContribution`
- `DeclarativeRuleCondition`
  - `operator: 'present'|'absent'|'equals'|'contains'`
- `DeclarativeRuleOperand`
- `DeclarativeRuleResolution`
  - `strategy: 'block'|'degrade_operand'`
  - `operandId?`
  - `reasonCode`
- `DeclarativeRule`
  - `kind: 'incompatibility'|'dependency'|'cardinality'|'occlusion'|'resource'`
- 将 `DeclarativeRulePackContribution.rules` 从 `JsonValue[]` 改为类型化规则数组；如兼容性测试需要，可以提供显式迁移/解析边界，不得在 Core 内保留第二套模糊解释。
- `PromptSectionDefinition`
- `PromptSectionContribution`

其他暂不相关的 `ResolvedContribution` 类别不需要顺手全面改造。

### 5.2 Prompt 排除合同

新增等价于下列语义的公共记录：

```ts
interface PromptConstraintExclusion {
  constraintId: string
  degradationId: string
  reasonCode: string
  sourceIds: string[]
}
```

在 `PromptIR` 增加 `excludedConstraints`。在 `PromptCompilationInput` 增加经过解析的 `EffectiveScenario`，或语义等价、同样可验证哈希的 resolved prompt policy。优先采用 `effectiveScenario`，避免另建不必要的解析层。

### 5.3 Schema 同步

所有改变的公开对象都要：

- 更新 JSON Schema；
- 更新 schema `$id`、必填字段和枚举；
- 加入包导出和 tarball allowlist；
- 加入 repository validator；
- 加入 public compatibility/consumer 检查；
- 处理 schema version。若需要版本升级，使用新的 alpha schema ID，不要静默改变旧 schema 的含义。

不要只改 TypeScript 类型而遗漏发布包中的 Schema。

## 六、第二阶段：通用构图数据与预设

新增一个公共安全的 canonical 数据文件，例如：

```text
fixtures/shared/visual-composition.v1.json
```

必须包含正式设计第 5 节的全部路径和第 6 节的 30 个预设映射。

关键要求：

- `camera.framing.shotScale` 是 `cardinality=one`；
- 可组合构图法使用独立 boolean leaf，例如：
  - `camera.composition.patterns.ruleOfThirds=true`
  - `camera.composition.patterns.leadingLines=true`
- 不得使用一个 `patterns: string[]` 约束承载多个独立偏好；
- `full_shot` 预设同时展开 `crop.keepBothFeet=true`；
- `leadingRoom.enabled=true` 不能隐含猜测方向；
- `reflection.enabled=true` 不能隐含猜测反射表面；
- `profile/silhouette` 拆成视角与光效两个事实；
- `mirror` 是 reflection 的 surface，不再形成重复的镜面构图事实；
- preset ID 只留在 provenance / `sourceHintIds`，本体实例不存 magic preset 值；
- canonical 文件与各 pack 的物化副本必须通过 content digest 或 validator 检查一致性。

不得提交附件截图或复刻其中人物图；只使用稳定 ID、文字标签和声明式操作。

## 七、第三阶段：冲突和依赖编译

主要文件：

- `packages/core/src/m4.ts`
- `packages/core/src/m4.test.ts`
- 相关 testkit fixture

### 7.1 单值路径算法

按照下面的伪代码实现，不得依赖输入顺序：

```text
for each ontology path where cardinality == one:
  group candidate constraints by canonical value
  merge identical-value groups deterministically

  if only one distinct value remains:
    keep it effective
  else:
    compare each candidate's own importance

    if more than one hard/required value remains:
      emit blocking conflict
    else if exactly one hard/required value remains:
      keep it effective
      mark every conflicting preferred constraint unsatisfied
      emit one linked degradation per losing constraint
    else:
      apply an explicit matching rule with a declared degradable operand
      or block as preferred/preferred ambiguity
```

相同值合并时 union provenance/source/goal IDs，并保留最强 importance。合并前后必须有稳定的 trace。不要因为两个相同值来自不同来源就制造冲突。

### 7.2 重要性规则

- `hard`、`required` 不得自动降级。
- `required`/`hard` 与 `preferred` 冲突：保留强约束，失败偏好改为 `status='unsatisfied'`。
- 两个不同 `preferred`：默认阻塞并要求澄清；只有规则明确给出 `degrade_operand` 才可自动选择。
- 不得继续使用“把两个 operand 和 rule importance 取最大值，再作为整个冲突 severity”的旧语义来决定谁失败。
- rule importance 可以影响报告/门禁，但不能把一个原本可降级的 preferred 自动升级成 required。

### 7.3 每个自动降级的完整证据

必须同时出现：

1. losing `Constraint.status='unsatisfied'`；
2. 一个且仅一个 `Degradation.constraintId=losingConstraint.id`；
3. 可解释的非阻塞 `ConstraintConflict` 或 dependency finding；
4. `RuleTrace.outcome='degraded'`；
5. losing constraint 不进入 Prompt effective set。

### 7.4 缺失依赖

条件解释器至少支持：

- `present`
- `absent`
- `equals`
- `contains`

必须用测试证明：

- leading room 缺方向会被发现；
- reflection 缺 surface 会被发现；
- 不会自动猜测 direction、surface 或 foreground subject；
- required dependency 缺失会阻塞；
- preferred dependency 只有在规则明确授权时才可降级请求方。

## 八、第四阶段：PromptCompiler 与 Prompt Guard 闭环

主要文件：

- `packages/core/src/m5.ts`
- 新增 `packages/core/src/m5.test.ts`，或放入现有 M5 测试归属文件但保持命名清晰
- contracts/testkit/CLI 的相关 fixture

### 8.1 输入核对

PromptCompiler 读取 prompt policy 之前必须验证：

```text
input.effectiveScenario.effectiveScenarioHash
  == input.context.effectiveScenarioHash
```

同时重算/验证 Effective Scenario 的确定性哈希。哈希不匹配立即失败，不能回退到默认硬编码 section。

### 8.2 约束分区

成功编译时，将每个输入 constraint 放进唯一一个集合：

- effective：`active`/`satisfied`，进入 `PromptIR.constraintIds`，按策略生成 coverage；
- excluded：`unsatisfied`，不进入 `PromptIR.constraintIds`，在 `excludedConstraints` 正好出现一次；
- waived：按现有 waiver/audit 语义处理。

`ConstraintIR.status='blocked'` 时不得生成 Prompt IR。

`excludedConstraints.degradationId` 必须存在并反向指向同一个 losing constraint；不一致立即失败。

### 8.3 构图 section 顺序

从类型化 `promptSections` contribution 读取，而不是在 CLI 私下解析：

1. `subject-and-product-fidelity`
2. `pose-and-object-relations`
3. `composition-shot-and-crop`
4. `composition-view-and-roll`
5. `composition-layout-and-space`
6. `composition-depth-framing-and-reflection`
7. `composition-lens-and-environment`
8. `forbidden-and-output`

只有存在有效匹配约束时才生成构图 section。每个 section 必须保留 constraint/source/decision/asset provenance。

### 8.4 Guard 必须新增的检查

- hard/required effective constraint 保持 locked coverage；
- 每个 unsatisfied constraint 恰好有一个 exclusion；
- excluded constraint ID 不得出现在 section、parameter、reference mapping 或 coverage 链接中；
- optimizer candidate 必须原样保留 exclusion 集合；
- transformation proof 不得把 excluded constraint 标为 preserved；
- section ID 和顺序来自已验证的 effective prompt policy；
- 调换输入贡献顺序后 Prompt IR 哈希和 section 顺序不变。

这是一项结构保证。不要声称已能从任意自然语言中识别同义复现；strict 模式下，对无法证明的 free-text 变换采取保守拒绝或 review。

## 九、第五阶段：三个 ScenarioPack

更新：

- `fixtures/packs/virtual-tryon/pack.json`
- `fixtures/packs/cosplay/pack.json`
- `fixtures/packs/product-shot/pack.json`
- 对应 manifest、digest、fixture suite 和 repository validation

要求：

### Virtual try-on

- 商品/服装可见性高于构图偏好；
- strong foreground obstruction 与受保护服装区域冲突；
- required 全服装覆盖与 preferred extreme close-up 冲突时，降级 close-up；
- Core 不出现 try-on 字符串分支。

### Cosplay

- identity、costume、signature prop 高于构图偏好；
- active signature prop 时 `crop.keepSignatureProp=true`；
- foreground obstruction 不得遮挡 required prop details；
- 参考预算仍优先 identity/costume/prop；选择构图卡后 reference count 不增加。

### Product shot

- 商品完整性、几何、标签可见性和输出合同高于构图偏好；
- reflection 不能制造未审查的假重复商品语义；
- negative space 只表达留白，不自动生成营销文案；
- strong obstruction 与 required product visibility 冲突。

ScenarioPack 的 wording、importance、protected paths 和 resolution policy 都必须在 pack 数据中，不在 Core 中。

## 十、第六阶段：CLI 与可审计证据

CLI 必须通过 Core 的类型化路径展示：

- preset 展开后的原子 changes；
- vocabulary path validation；
- conflicts、degradations、rule traces；
- effective 与 excluded constraint IDs；
- 构图 prompt sections 及顺序；
- preset 选择前后的 planned reference 数量一致；
- 三个 pack 的相同通用路径与不同 declarative policy。

删除或收敛当前仅在 CLI helper 中私下读取 `requiredPaths` 的重复语义。CLI 可以渲染证据，但不应成为第二个 prompt policy compiler。

## 十一、最低测试矩阵

以下用例全部必须是确定性自动测试：

1. full-shot preset 展开为 `shotScale=full_shot` 与 `keepBothFeet=true`。
2. thirds + leading-lines 同时有效并出现在有序 prompt sections。
3. required full-shot 对 preferred close-up：full-shot 有效；close-up `unsatisfied`；一个 degradation；提示词无 close-up 结构链接。
4. required full-shot 对 required close-up：阻塞；无 Prompt IR。
5. preferred left-third 对 preferred right-third 且无规则：阻塞，不 last-wins。
6. 两个来源请求相同值：确定性合并 provenance。
7. leading-room 缺 direction：发现依赖缺口，不猜方向。
8. reflection 缺 surface：发现依赖缺口。
9. strong obstruction 对 required product visibility：按 pack 规则降级或阻塞。
10. Cosplay required signature prop 不会被构图裁切偏好压掉。
11. 贡献和输入顺序重排：Constraint IR、Prompt IR、trace 和 hash 相同。
12. Effective Scenario 被篡改：PromptCompiler 拒绝。
13. optimizer 重新链接 excluded constraint：Prompt Guard 拒绝。
14. 只选构图 preset：不新增 reference，不改变 reference budget。
15. 所有 returned objects 是 defensive copy；调用方修改返回值不污染后续结果。
16. Core 源码无 scenario ID/name 分支。

新测试不得通过硬编码固定输出哈希来掩盖算法缺陷；哈希断言应与语义断言同时存在。

## 十二、文档同步

实现 PR 需要同步更新受影响的：

- `docs/system-design.md` 与 `docs/zh-CN/system-design.md`
- `docs/scenario-pack-contract.md` 与 `docs/zh-CN/scenario-pack-contract.md`
- `docs/compatibility.md`
- `docs/cli.md`
- `docs/roadmap.md`
- package README / 根 README（仅在公开用法确实变化时）
- 必要的 implementation note / migration note

英文是规范文本；四份成对核心规范发生重大变化时，必须同 PR 更新中文译文。

不得在本功能 PR 中改 `CHANGELOG` 为已发布版本，也不得把 `0.2.0-alpha.1` 说成已发布。

## 十三、执行与门禁

按顺序执行并保存摘要：

```powershell
pnpm run repository-validate
pnpm run typecheck
pnpm test
pnpm run compatibility
pnpm run security
pnpm run reproducibility
pnpm run consumer
pnpm run release-candidate
pnpm run clean-room
pnpm run verify-checksums
git status --short
git diff --check
```

注意：`release-candidate` 要求 tracked tree 干净并绑定精确 HEAD。因此先完成实现和普通测试，提交后再跑完整 release-candidate、clean-room、checksum 门禁。门禁生成物应保持 ignored，不得提交。

不得执行 `m9:smoke`。不需要联网测试。

## 十四、完成证据

Draft PR 描述必须给出：

- 基线 SHA 与分支名；
- 公开合同和 Schema 变化摘要；
- 30 个 preset 与 canonical vocabulary 的文件位置；
- 不含 scenario-specific Core branches 的搜索证据；
- required/preferred 冲突的 constraint/degradation/trace/prompt exclusion 示例；
- 三个 pack 的 fixture 结果；
- preset 前后 reference count 对比；
- 全部测试数、pass/fail/skip；
- release-candidate、clean-room、checksum 门禁结果；
- 明确列出的 deferred scope；
- breaking/compatibility 影响和迁移说明。

Draft PR 标题建议：

```text
feat: add declarative visual composition and prompt closure
```

保持 Draft。不要自行转 Ready 或合并。

## 十五、立即停止并报告的情况

出现下列任一情况时，不要扩大范围或静默绕过：

- 当前 `main` 与指定基线不一致；
- 工作树包含无法归属的用户改动；
- 需要真实 Provider、凭据或网络调用才能让标准测试通过；
- 必须在 Core 中按 scenario 名称分支才能实现；
- 旧 public schema 无法兼容且需要未设计的破坏性迁移；
- release gate 暴露与本功能无关的现存失败；
- 需要修改、复制或合并外部 PR #23；
- 需要 tag、发布、合并或关闭 issue。

报告真实阻塞点、已完成文件、已通过门禁和建议的最小决策，不创建空占位结果。
