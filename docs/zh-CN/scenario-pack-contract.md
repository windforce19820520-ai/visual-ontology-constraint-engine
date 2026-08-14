# ScenarioPack 合同

[English normative source](../scenario-pack-contract.md) · [项目术语表](glossary.md)

**状态：** v0.1 提案
**规范源：** 英文版
**译文地位：** 中文为一等译文；若语义有歧义，以英文规范源为准
**合同 ID：** `voce.scenario-pack/v1alpha1`

本文档是四份中英成对核心规范之一。术语遵循[项目术语表](glossary.md)，生命周期与授权规则遵循[系统设计](system-design.md)。

## 1. 目的

`ScenarioPack` 让创作者场景可以安装和组合，而无需在 VOCE Core 中添加场景专属分支。商业虚拟试衣、cosplay 和商品图都是包，并通过同一套 Registry、Resolver、Compiler、Planner、Runtime 与 Evaluation 合同完成选择和执行。

ScenarioPack 贡献声明式领域知识和默认值。它不是：

- Provider 或远程服务 Adapter；
- 检查资产、传输数据、产生费用或执行计划的授权；
- Host 应用、账户系统、目录、工作流 UI 或审核服务；
- 修改已确认事实或绕过 Core Policy 的特权途径。

## 2. 分层边界

```text
Host application
  selects and activates an exact scenario composition
  supplies consent, rights, policy, storage, credentials, budgets, and authorization

ScenarioPack
  composes ontology vocabulary, declarative rules, candidate scopes,
  typed prompt sections, review templates, and declared defaults

RulePack
  deterministically compiles accepted inputs into constraints and trace

ProviderAdapter and other execution Adapters
  performs a specifically authorized local or remote step

VOCE Core
  resolves packages, validates composition, compiles, plans, guards,
  executes authorized plans, records receipts, and evaluates
```

Core 不得导入第一方场景包、比较场景 ID，或根据 `virtual-try-on`、`cosplay`、`product-shot` 等名称进行分支。第一方与第三方 Pack 使用相同的公共 Registry 和验证路径。

## 3. Root、extension 与 HostOverride 模型

每个 `ScenarioPackSelection` 都包含：

- 恰好一个 `root` Pack，用于建立基础场景词汇与体验；
- 零个或多个被显式选择的 `extension` Pack；
- 一个可选的 `HostPolicyOverlay`，其中包含零个或多个由 Host 拥有并绑定到 Case Revision 的类型化 `HostOverride` 记录。

确定性解析可以加入依赖所需的 Extension Pack，并且必须在 Dependency Trace 中披露它们。安装不会选择或激活 Pack。一个已安装的 Extension 不会仅因为可被发现就变为 Active。

```ts
interface ScenarioPackRequest {
  packId: string
  versionRange: string
  configuration?: JsonObject
}

interface ScenarioPackSelection {
  root: ScenarioPackRequest
  extensions: ScenarioPackRequest[]
  hostPolicyOverlay?: HostPolicyOverlay
}
```

Root 和 Extension 是组合角色，不是信任等级。第三方 Root 与第一方 Extension 拥有完全相同的 Core 权限。

## 4. Manifest 与包定义

```ts
type JsonPrimitive = null | boolean | number | string
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

interface JsonObject {
  [key: string]: JsonValue
}

interface VersionedCoreContractRef {
  contractId: string
  version: string
}

interface JsonSchemaRef extends VersionedCoreContractRef {
  schemaId: string
}

type ScenarioInteractionMode = 'text_only' | 'reference_guided' | 'edit_existing'

interface ScenarioCardinality {
  min: number
  max: number
}

interface ScenarioInputExpectation {
  id: string
  inputKind: 'text_intent' | 'asset' | 'structured_metadata'
  dataType: 'text' | 'image' | 'json'
  requiredIn: ScenarioInteractionMode[]
  cardinality: ScenarioCardinality
  ontologyPath?: string
  mediaTypes?: string[]
  sensitivity: 'none' | 'personal_data' | 'biometric_candidate'
}

interface ScenarioOutputExpectation {
  id: string
  artifactKind: 'image' | 'structured_review' | 'layer_bundle'
  dataType: 'image' | 'json'
  producedIn: ScenarioInteractionMode[]
  cardinality: ScenarioCardinality
  mediaTypes: string[]
  outputContract?: VersionedCoreContractRef
}

type ScenarioContributionKind =
  | 'ontology_vocabulary'
  | 'rule_pack'
  | 'interpretation_scope'
  | 'prompt_section'
  | 'review_template'
  | 'default'
  | 'override_point'

interface ScenarioPackManifest {
  schemaVersion: 'voce.scenario-pack/v1alpha1'
  packId: string
  version: string
  kind: 'root' | 'extension'
  supportedInteractionModes: ScenarioInteractionMode[]
  inputExpectations: ScenarioInputExpectation[]
  outputExpectations: ScenarioOutputExpectation[]
  extensionOf?: {
    rootPackId: string
    rootVersionRange: string
  }
  license: string
  provenance: PackageProvenance
  coreRange: string
  contractRanges: {
    ontology: string
    declarativeRuleContribution: string
    requestedScopePlan: string
    promptIR: string
    reviewTemplate: string
  }
  configurationSchema?: JsonSchemaRef
  ui: UIMetadata
  dependencies: ScenarioPackDependency[]
  conflicts: ScenarioPackConflict[]
  composition: {
    before: string[]
    after: string[]
  }
  contributions: ScenarioContributionIndex
  fixtures: ScenarioContributionDescriptor[]
  migrations: ScenarioContributionDescriptor[]
  capabilityRequirements: ScenarioCapabilityRequirement[]
  declarations: ScenarioPackDeclarations
  permissions: ScenarioPackPermissions
  distributionInventory: DistributionInventoryEntry[]
}

interface DistributionInventoryEntry {
  path: string
  role: 'contribution' | 'fixture' | 'migration' | 'readme' | 'license' | 'package_metadata'
  contentDigest: string
}

interface UIMetadata {
  defaultLocale: string
  locales: Record<string, {
    displayName: string
    description: string
    instructions?: string
    messages: Record<string, string>
  }>
  disclosures: Array<{
    id: string
    severity: 'info' | 'warning' | 'required'
    messageKey: string
  }>
  accessibility: {
    textAlternativesRequired: boolean
    keyboardOperableReferenceUI: boolean
    doesNotRelyOnColorAlone: boolean
  }
}

interface ScenarioCapabilityRequirement {
  id: string
  capability: string
  importance: 'hard' | 'required' | 'preferred'
  reasonCode: string
}

interface ScenarioPackDeclarations {
  containsExecutableScenarioCode: false
  distributionLifecycleScripts: false
  containsExecutableFiles: false
  fixturesRequireNetwork: false
  fixturesRequireRealProvider: false
  collectsTelemetry: false
  mayHandlePersonImages: boolean
  rightsDisclosureRequired: boolean
}

interface ScenarioPackDependency {
  packId: string
  versionRange: string
  role: 'extension'
  reasonCode: string
}

interface ScenarioPackConflict {
  packId: string
  versionRange: string
  reasonCode: string
}

interface ScenarioPackPermissions {
  network: false
  remoteCalls: false
  secrets: false
  filesystemWrite: false
  mutateConfirmedFacts: false
  authorizeCalls: false
  overrideHostPolicy: false
  selectProvider: false
  changeBudgets: false
}

interface ScenarioContributionIndex {
  ontologyVocabulary: ScenarioContributionDescriptor[]
  rulePacks: ScenarioContributionDescriptor[]
  interpretationScopes: ScenarioContributionDescriptor[]
  promptSections: ScenarioContributionDescriptor[]
  reviewTemplates: ScenarioContributionDescriptor[]
  defaults: ScenarioContributionDescriptor[]
  overridePoints: ScenarioContributionDescriptor[]
}

interface ScenarioContributionDescriptor {
  id: string
  schemaVersion: string
  contentDigest: string
}
```

Manifest 只有一个合法路径：`scenario-pack/manifest.json`。该路径是保留路径，不得出现在 `distributionInventory` 中；其余每个分发文件都必须在 Inventory 中恰好出现一次。Manifest 包含元数据与 Digest，而不是可执行生命周期 Hook。一个发行包包含 Manifest，以及内容寻址、可 JSON 序列化的贡献文档：

```ts
interface ScenarioPack {
  manifest: ScenarioPackManifest
  contributions: {
    ontologyVocabulary: OntologyVocabularyContribution[]
    rulePacks: DeclarativeRulePackContribution[]
    interpretationScopes: InterpretationScopeContribution[]
    promptSections: PromptSectionContribution[]
    reviewTemplates: ReviewTemplateContribution[]
    defaults: DeclaredDefaultContribution[]
    overridePoints: OverridePoint[]
    fixtureSuites: FixtureSuite[]
  }
  migrations: ScenarioMigrationDeclaration[]
}

interface FixtureSuite {
  id: string
  schemaVersion: string
  cases: FixtureCaseRef[]
  contentDigest: string
}
```

Loader 会重新计算每个贡献 Digest、Canonical Manifest Hash 与 Package Digest。Manifest 不能证明任意已安装代码是安全的，也绝不能被表述为沙箱或安全签名。

`supportedInteractionModes` 只声明 Pack 能编译的交互形态。输入与输出 Expectation 是带类型、带 Namespace 的声明，用于 Host UI、Preflight 与 Output-contract Negotiation；它们既不检查 Asset，也不授权调用。每个 `requiredIn` 和 `producedIn` 值都必须同时出现在 `supportedInteractionModes` 中。Cardinality Bound 必须非负且 `max >= min`；Media Type 使用标准化 MIME 字符串。Expectation 可以通过 `outputContract` 收窄一个带版本的 Core Contract，但不能重定义该 Core Contract。

`UIMetadata` 是展示元数据，不具有语义权限。`defaultLocale` 必须指向 `locales` 中的条目；所有被引用的 Disclosure Message Key 必须能在该 Locale 中解析；Required Disclosure 必须在 Activation 前得到确认。多语言 Label、Instruction、Disclosure 与 Accessibility Declaration 不能添加约束、改变贡献数据、授权调用或改变语义组合。它们不进入 `effectiveScenarioHash`，但仍受 Manifest、Package 与 Lock Hash 覆盖；语义贡献不能把本地化 UI 内容作为权限依据。

Accessibility Declaration 说明 Pack 提供的文本与参考图选择 UI 资产对 Host Renderer 的要求。它既不认证 Host 应用，也不把最终无障碍合规责任从 Host 转移出去。

`ScenarioCapabilityRequirement` 只能声明语义能力需求，不能指定或选择 `ProviderAdapter`、模型、Endpoint、Credential 或 Fallback。Activation 只验证需求结构合法且已披露，不声称已经满足。Compilation 与 Planning 将需求和 `CompilationContext` 固定的 `ProviderCapabilityProfile` 比较：未满足的 `hard` 需求阻断；未满足的 `required` 需求阻断，直到显式 Waiver 创建新的 Case Revision；未满足的 `preferred` 需求只能在留下 Trace 的情况下降级。

`ScenarioPackDeclarations` 是可审计声明和保守的 Host Policy 输入，不是权限或证明。虚假或不一致的声明会阻断验证或激活。

Root Manifest 必须省略 `extensionOf`。Extension Manifest 必须通过 `extensionOf` 声明恰好一个兼容 Root ID 与版本范围。若 Extension 被选到另一个 Root 下，解析必须拒绝；安装状态或加载顺序不能隐式建立兼容性。

每个 `ScenarioPackDependency` 都必须解析到 `kind` 为 `extension`、`extensionOf` 与所选 Root 匹配的 Manifest，其精确版本和摘要进入 Lock。声明式 RulePack 文档是 Root 或 Extension 包内的贡献项，不是单独发现的包类型。

## 5. 贡献权限

### 5.1 本体词汇

Pack 可以引用兼容的版本化 Ontology Module，或在自己声明的 Namespace 下添加词汇。它不能重新定义 Core Path、注入 `OntologyFact`、创建 `ObservationDecision` 或 `BindingDecision`，也不能分配接受权限。

### 5.2 RulePack

Pack 可以引用声明式、确定性的 RulePack IR。Rule 消费已接受输入，并可产出 Constraint、Explanation、Degradation 与 Review Requirement。它不能使用网络、Credential、当前时间、随机性、文件系统写入、隐藏的可变状态或 Provider Call。

`DeclarativeRulePackContribution` 是 v0.1 的候选 ScenarioPack Rule 合同，只有在 Schema 与兼容性 Fixture 发布后才成为兼容性稳定接口。代码实现的 `RulePackPlugin` 是单独安装的可信插件，在 v0.1 中属于实验性接口；ScenarioPack 数据不能把它作为声明式 Contribution 引用，也不能让其代码成为 ScenarioPack 安全边界的一部分。

### 5.3 理解范围

Scope 贡献是带有 Purpose、Sensitivity Class 与确定性 Condition 的候选 Allowlist。有效 `RequestedScopePlan` 受以下交集限制：

```text
scope required by accepted user intent
∩ scope contributed by the EffectiveScenario
∩ scope allowed by Host policy
```

Pack 不能强制穷尽分析、检查被排除的 Scope、选择 Interpreter 或授权远程调用。

### 5.4 Prompt Section

Prompt 贡献是类型化 `PromptIR` Template，具有带 Namespace 的 ID、确定性 Predicate、Source/Constraint Link、Mutability 与显式排序 Anchor。它只能读取已接受的 Ontology、Constraint、Reference Plan、Output Contract 和已声明 Configuration。

它不能注入 System Instruction、访问未确认的 Observation、更改 Locked Section、改变参考图顺序、选择 Provider 或绕过 Prompt Guard。

### 5.5 Review Template

Review 贡献声明 Criterion 并创建 `ReviewTask` Template。它不能执行远程 Reviewer，也不能把语义 Claim 标记为已接受。远程语义复核需要自己的 Adapter、`RemoteCallAuthorization`、Durable Run 与 Receipt。人工验收保持分离。

### 5.6 默认值

默认值仅在目标为 `unspecified` 时生效，并以 `declared_default` 溯源信息记录。其权限低于用户意图、可信元数据、已确认证据和确定性约束。

默认值不能设置 Credential、Provider Selection、Budget、Data Destination、Consent、Moderation Outcome、Decision 或 Execution Authorization。互不相同且冲突的默认值会阻断组合，除非有效的类型化 HostOverride 对其完成裁决。

### 5.7 OverridePoint 与 Fixture

`OverridePoint` 是一个显式且受 Schema 约束的位置，`HostPolicyOverlay` 可在此更改 Configuration、Declared Default 或可覆写的 Preferred Contribution。不存在 OverridePoint 即表示不允许覆写。

`FixtureSuite` 包含可再分发的离线 Case、预期组合产物与 Mock 验收结果。它不能要求 Credential 或真实 Adapter Call，也绝不证明生产就绪。

## 6. 类型化 HostOverride 与 HostPolicyOverlay

HostOverride 不是 Pack，不能作为隐藏 Pack 行为发布。它属于一个 Case Revision，具有显式 Authority 与 Reason，并纳入确定性 Hash。

```ts
type HostOverrideOperation =
  | {
      kind: 'set_configuration'
      packId: string
      overridePointId: string
      value: JsonValue
    }
  | {
      kind: 'set_declared_default'
      packId: string
      overridePointId: string
      value: JsonValue
    }
  | {
      kind: 'set_contribution_activation'
      packId: string
      overridePointId: string
      active: boolean
    }

interface HostOverride {
  id: string
  operation: HostOverrideOperation
  reasonCode: string
  contentHash: string
}

interface OverridePoint {
  id: string
  targetKind: 'configuration' | 'declared_default' | 'contribution_activation'
  targetPath: string
  valueSchema?: JsonSchemaRef
  allowDisable: boolean
  maximumImportance: 'preferred'
}

interface HostPolicyOverlay {
  id: string
  caseId: string
  caseRevision: number
  overrides: HostOverride[]
  authority: 'user' | 'host_policy'
  reasonCode: string
  overlayHash: string
}
```

Override 只指明 Pack 和已声明 `OverridePoint`；Point 提供具有权威性的 Target Path 或 Contribution ID。Override 必须通过 Point Schema 和最高权限验证。只有相应 Point 允许禁用，且该贡献不保护 hard 或 required 约束时，才可以禁用 Contribution。`HostPolicyOverlay` 是纳入确定性解析、绑定 Revision 的容器。Override 不能重新定义词汇、改变 Package Digest、削弱已确认事实、改变授权或绕过 Host Policy。

Override 顺序不具有 Last-writer-wins 语义。Content Hash 相同的相同 Operation 会去重；指向同一 Effective Value 但内容不同的 Operation 会以 `PACK_OVERRIDE_INVALID` 阻断。Resolver 会在 `PackResolutionReport` 中记录每个已应用或已拒绝的 Override。

## 7. Resolution、Lock 与 EffectiveScenario

```ts
interface ScenarioCompositionLockEntry {
  packId: string
  version: string
  kind: 'root' | 'extension'
  manifestHash: string
  packageDigest: string
  configurationHash: string
  resolvedDependencies: Array<{
    packId: string
    version: string
    packageDigest: string
  }>
  contributionDigests: Record<string, string>
}

interface ScenarioCompositionLock {
  schemaVersion: 'voce.scenario-pack-lock/v1alpha1'
  contractVersion: 'voce.scenario-pack/v1alpha1'
  resolverVersion: string
  catalogHash: string
  canonicalization: 'voce.canonical-json/v1alpha1'
  rootPackId: string
  entries: ScenarioCompositionLockEntry[]
  compositionOrder: string[]
  hostPolicyOverlayHash?: string
  hostOverrideHashes: string[]
  compositionHash: string
  lockHash: string
}

interface EffectiveScenario {
  lockHash: string
  rootPackId: string
  extensionPackIds: string[]
  compositionOrder: string[]
  ontologyVocabulary: ResolvedContribution[]
  rulePacks: ResolvedContribution[]
  interpretationScopes: ResolvedContribution[]
  promptSections: ResolvedContribution[]
  reviewTemplates: ResolvedContribution[]
  defaults: ResolvedContribution[]
  capabilityRequirements: ResolvedScenarioCapabilityRequirement[]
  declarations: ResolvedScenarioPackDeclaration[]
  appliedOverrides: AppliedOverrideRef[]
  effectiveScenarioHash: string
}

interface AppliedOverrideRef {
  packId: string
  overridePointId: string
  hostOverrideId: string
  contentHash: string
}

interface PackResolutionReport {
  status: 'resolved' | 'blocked'
  lockHash?: string
  effectiveScenarioHash?: string
  selected: ResolvedScenarioPack[]
  dependencyTrace: ScenarioDependencyTrace[]
  compositionTrace: ScenarioCompositionTrace[]
  overrideTraces: ScenarioOverrideTrace[]
  conflicts: ScenarioResolutionConflict[]
  warnings: ScenarioResolutionWarning[]
  reportHash: string
}
```

`lockHash` 由 Lock 的其他字段计算，绝不包含自身。`effectiveScenarioHash` 覆盖精确解析出的贡献与具有语义作用的 `HostPolicyOverlay`。展示文本、时间戳、发现源路径和报告格式不影响语义 Hash。

每个 ScenarioPack Digest 都采用 `sha256:<64 个小写十六进制字符>` 格式。结构化语义 Hash 使用 `voce.canonical-json/v1alpha1`：Object Key 按词法排序，Number 与 String 使用该 Profile 的标准化 JSON Encoding，Array 保留合同定义的语义顺序，并排除正在计算的 Hash 字段。易变时间戳、本地路径、Acquisition Locator 与 Report 展示形式永不进入语义 Hash。

Manifest 盘点除 Manifest 自身之外的每个分发文件；`ScenarioPackDescriptor.manifestHash` 单独覆盖 Canonical Manifest，因此不存在自引用摘要。`packageDigest` 对 Canonical 投影 `{manifestHash, files}` 求哈希，其中 `files` 按标准化路径排序，每项包含路径 UTF-8 字节长度、路径、Role、内容字节长度与内容摘要。存在 Archive 时，`distributionDigest` 对精确获取的 Archive Byte 求哈希；Memory 与 Directory Source 先使用同一 Inventory、标准化路径、File Mode 与零时间戳物化为确定性 Tar Archive，再对其字节求哈希。

`CompilationContext` 固定 `lockHash` 与 `effectiveScenarioHash`。现有 Lock 不会仅因为安装了其他版本就在重新编译时被重新解析。

## 8. 确定性组合

Resolution 只使用显式提供的不可变 `ScenarioPackCatalogSnapshot`，并执行以下步骤：

1. 验证 Root Kind、显式 Extension、Configuration、Manifest 与 Contribution Digest；
2. 展开 Required Dependency，但不激活无关的已安装 Pack；
3. 要求每个 `ScenarioPackRequest`、Dependency 与 `extensionOf` Target Version 都是不含 Range、Wildcard、Pre-release 或 Build Metadata 的精确 SemVer，选择其精确 Package Digest，并将 Catalog、Resolver、Contract 与 Canonicalization 版本记录进 Lock；
4. 拒绝缺失依赖、不兼容的 Core/Contract Range、已声明 Conflict，以及 Digest 不同但 `packId + version` 相同的重复项；
5. 添加 Dependency-before-dependent 边，以及 Manifest 的 `before`/`after` 边；
6. 执行稳定拓扑排序；其他条件相同时，按 `packId`、精确版本和 Package Digest 打破平局；
7. 按各贡献类别规则进行组合；
8. 验证并应用 `HostPolicyOverlay` 及其 HostOverride；
9. 产出 Lock、EffectiveScenario 与 `PackResolutionReport`。

依赖环或排序环会阻断，并在报告中给出已知的最小环。Resolver 绝不为了让组合成功而选择其他 Provider 或削弱需求。

各类别规则如下：

- Ontology Module 按 Module ID 解析为一个兼容的精确版本；
- Digest 相同的重复 Contribution ID 去重；Digest 不同则冲突；
- RulePack 遵循 Pack 顺序及其声明的内部顺序；
- Interpretation Scope 先取并集，再与 User Intent 和 Host Policy 求交；
- Prompt Section 使用显式 Anchor DAG，随后按带 Namespace 的 ID 稳定排序；
- Review Template 形成带 Namespace 的并集；
- Capability Requirement 形成带 Namespace 的并集，并持续对 Activation 与 Planning 可见；它们不会选择 Adapter；
- Declaration 保持 Pack Scope；任何虚假、不一致或被 Host Policy 禁止的声明都会阻止 Activation；
- 同一 Target 上互不相同的默认值会冲突，除非有效 HostOverride 选择最终值。

## 9. 发现、安装与激活

v0.1 的发现机制是显式且本地的：

```ts
type LocalScenarioPackSource =
  | {
      kind: 'memory'
      definition: ScenarioPack
      logicalFiles: Array<{ path: string; bytes: Uint8Array }>
    }
  | { kind: 'directory'; rootPath: string }
  | {
      kind: 'archive'
      archivePath: string
      acquisitionKind: 'file_archive' | 'npm_tarball' | 'github_release'
    }

interface PackageProvenance {
  publisher: string
  sourceRepository?: string
  sourceRevision?: string
  sourceDigest?: string
}

interface PackageAcquisition {
  sourceKind: 'memory' | 'directory' | 'file_archive' | 'npm_tarball' | 'github_release'
  sourceLocator: string
  distributionDigest: string
  lifecycleScriptsExecuted: false
}

interface ScenarioPackDescriptor {
  manifest: ScenarioPackManifest
  manifestHash: string
  packageDigest: string
  distributionDigest: string
  provenance: PackageProvenance
  acquisition: PackageAcquisition
}

interface ScenarioPackCatalogSnapshot {
  contractVersion: 'voce.scenario-pack/v1alpha1'
  resolverVersion: string
  registryRevision: number
  entries: ScenarioPackDescriptor[]
  availabilityPolicies: PackDeactivation[]
  catalogHash: string
}

type ScenarioPackResolution =
  | {
      status: 'resolved'
      lock: ScenarioCompositionLock
      effectiveScenario: EffectiveScenario
      report: PackResolutionReport & { status: 'resolved' }
    }
  | {
      status: 'blocked'
      report: PackResolutionReport & { status: 'blocked' }
    }

interface ScenarioPackRegistry {
  register(source: LocalScenarioPackSource): ScenarioPackDescriptor
  list(): ScenarioPackDescriptor[]
  snapshot(): ScenarioPackCatalogSnapshot
  setAvailabilityPolicy(policy: PackDeactivation, expectedRegistryRevision: number): number
  unregister(check: PackUninstallCheck): PackUninstallReceipt
  resolve(
    selection: ScenarioPackSelection,
    catalog: ScenarioPackCatalogSnapshot,
  ): ScenarioPackResolution
}

interface PackActivation {
  id: string
  caseId: string
  caseRevision: number
  selectionHash: string
  catalogHash: string
  registryRevision: number
  lockHash: string
  effectiveScenarioHash: string
  resolutionReportHash: string
  acknowledgedDisclosureIds: string[]
  activatedBy: string
  activatedAt: string
  activationHash: string
}
```

npm Tarball 可以通过 `voce.scenarioPack` Package Metadata 字段暴露数据 Manifest。GitHub 仓库可以分发相同的纯数据 Archive。Host 在不执行包生命周期脚本的前提下下载或打包 Archive，然后提供本地 Archive 或已完成全量清单盘点的开发目录；Core 绝不解析 Node Package Specifier，也不执行 ScenarioPack JavaScript Entry Point。

v0.1 不提供 Marketplace、全局 `node_modules` 扫描、远程 Registry 查询、自动下载或因安装而自动激活。Host 显式提供 Source。Registration 使 Pack 可被发现；`snapshot()` 固定可用 Descriptor；Resolution 只读取该不可变 Snapshot 并选择精确内容；Activation 将其绑定到 Case Revision。这些操作都不会授权模型调用、资产访问、数据传输、Provider 选择或费用。

Blocked Resolution 只返回阻断性的 `PackResolutionReport`，绝不产出部分 Lock 或 `EffectiveScenario`。Resolved Result 会返回全部三项 Artifact，且顶层 `status` 必须与 `report.status` 一致。

在读取内容前，Loader 会拒绝绝对路径、空路径段、`.`/`..` 路径段、反斜杠、重复路径或大小写冲突的标准化路径、符号链接、硬链接、设备条目、Socket、FIFO、可执行文件或可执行 Mode，以及 Inventory 之外的任何文件。它会在解压前应用由 Host 配置的压缩大小、解压大小、文件数、单文件大小、路径长度与膨胀比例上限。随后重新计算 Inventory、`distributionDigest` 与 `packageDigest`；Role Label 绝不能让可执行内容变得合法。`PackageProvenance` 是作者提供的来源声明，可由 Host Policy 检查；v0.1 不定义自有签名验证或 Trust Root 系统。

`PackageAcquisition` 记录本 Host 从何处取得这些字节、完整 Distribution Digest，以及未执行生命周期脚本。它不是由 Pack 编写，并排除在 Semantic Hash 之外。`activationHash` 由 `PackActivation` 的所有其他字段计算，其中包括精确的已确认 Disclosure ID，并且绝不包含自身。

`catalogHash` 覆盖 Contract 与 Resolver Version、Registry Revision、按序排列的 Availability Policy Hash，以及按序排列的 Descriptor 投影：`packId`、精确版本、`manifestHash`、`packageDigest`、`distributionDigest` 和 Acquisition Kind。Registration 在创建 Snapshot 前应用所有 Host 获取来源策略。本地路径与 Acquisition Locator 保留用于 Host 审计，但绝不影响 Resolution，也不进入 Catalog Hash。Resolution 会拒绝 Snapshot 可用性策略禁止的任何 Selection。Activation 会在接受 Lock 前重新检查当前 Registry Revision 与匹配 Policy；Policy 或 Revision 变化时必须创建新 Snapshot 并重新解析。

## 10. 升级、迁移、卸载与重放

Upgrade 是将新的 Selection 显式解析为新的 Lock 与 Case Revision，绝不是原地修改。

```ts
type ScenarioMigrationOperation = { ownerPackId: string } & (
  | { kind: 'rename_configuration'; from: string; to: string }
  | { kind: 'map_configuration_value'; path: string; from: JsonValue; to: JsonValue }
  | { kind: 'remove_configuration'; path: string; requiresConfirmation: true }
  | { kind: 'replace_contribution_id'; from: string; to: string }
)

interface ScenarioMigrationDeclaration {
  migrationId: string
  ownerPackId: string
  fromVersionRange: string
  toVersion: string
  operations: ScenarioMigrationOperation[]
  contentDigest: string
}

interface MigrationPlan {
  fromLockHash: string
  sourceCaseId: string
  sourceCaseRevision: number
  sourceEditableStateHash: string
  targetCaseRevision: number
  targetSelection: ScenarioPackSelection
  targetCatalogHash: string
  targetLockHash: string
  targetEffectiveScenarioHash: string
  targetResolutionReportHash: string
  declarations: Array<{
    packId: string
    migrationId: string
    contentDigest: string
  }>
  operations: ScenarioMigrationOperation[]
  unresolvedItems: UnresolvedItem[]
  confirmationHash?: string
  planHash: string
}

interface MigrationReceipt {
  planHash: string
  fromLockHash: string
  toLockHash: string
  fromEffectiveScenarioHash: string
  toEffectiveScenarioHash: string
  sourceEditableStateHash: string
  confirmationHash?: string
  newCaseRevision: number
  appliedOperationHashes: string[]
  unresolvedItems: UnresolvedItem[]
  receiptHash: string
}

interface PackDeactivation {
  availabilityPolicyId: string
  packId: string
  version?: string
  registryRevision: number
  allowNewActivations: false
  changedBy: string
  reasonCode: string
  changedAt: string
  policyHash: string
}

interface PackUninstallCheck {
  packId: string
  version: string
  distributionDigest: string
  registryRevision: number
  status: 'allowed' | 'blocked'
  blockingReasonCodes: string[]
  activeActivationHashes: string[]
  availabilityPolicyHashes: string[]
  activeSelectionHashes: string[]
  reverseDependencyLockHashes: string[]
  activeCompilationSessionIds: string[]
  activeExecutionRunIds: string[]
  pendingMigrationPlanHashes: string[]
  replayLockHashes: string[]
  checkHash: string
}

interface PackUninstallReceipt {
  checkHash: string
  packId: string
  version: string
  distributionDigest: string
  removedFromRegistry: true
  registryRevisionBefore: number
  registryRevisionAfter: number
  removedLocalPackageBytes: boolean
  tombstoneDescriptorHash: string
  tombstoneProvenanceHash: string
  preservedHistory: true
  unavailableReplayLockHashes: string[]
  receiptHash: string
}
```

Migration Operation 是声明式、可预览的，并且仅限于其 `ownerPackId` 拥有的 Configuration、Contribution Identifier 和仍可编辑 Draft Namespace。Resolution 为每个受影响 Pack 选择恰好一条 Migration Path；无路径或多条同等适用路径会以 `PACK_MIGRATION_REQUIRED` 或 `PACK_MIGRATION_INVALID` 阻断。多 Pack Operation 按目标组合顺序执行。破坏性或有歧义的迁移需要按内容寻址的确认记录，其 Hash 进入 Plan 与 Receipt。Dry-run 固定源 Case Revision/Editable State，以及目标 Catalog、Lock、EffectiveScenario 和 Resolution Report Hash；应用计划时对每项 Pin 进行 Compare-and-swap 校验，绝不重新解析可变 Registry 状态。应用有效 `MigrationPlan` 会创建绑定到这些已解析目标产物的下一 Case Revision 与 `MigrationReceipt`；旧产物保持不可变。

`PackActivation` 绑定 Case Revision。宿主范围的未来可用性由独立 `PackDeactivation` 策略管理，它绑定 Pack/Version 与 Registry Revision，阻止新 Activation，但不取消 Active Work。已选择或依赖所需的 Pack 不能从现有 Lock 中卸载。移除前，Host 必须创建覆盖活动 Activation、可用性策略、Selection、反向依赖、Compilation/Execution、待处理 Migration 和 Replay Retention 的 `PackUninstallCheck`；存在任何活动阻断项都会返回 `PACK_UNINSTALL_BLOCKED`。Registry Removal 是针对精确已检查 Revision 的原子 Unregister；只有当检查为 `allowed`，且其 Hash 与 Target 仍匹配，才可创建回执。历史 Descriptor 与 Provenance Hash 被移到独立 Tombstone Store，而不是活动 Registry。成功的 `PackUninstallReceipt` 绝不删除用户资产、Lock、Run History、Receipt 或 Provenance。历史 Plan Replay 要求精确 Package/Contribution Digest 仍可用；否则返回 `PACK_IMPLEMENTATION_UNAVAILABLE`、记录受影响 Lock Hash，并绝不替换或下载其他版本。

Live Rerun 可以有意迁移到新 Lock，但它是新的 Case Revision 与 ExecutionRun，并需要新的授权。

## 11. 信任与禁止权限

由于 Process Isolation 延后，v0.1 可执行插件属于可信本地代码。不得夸大此信任边界：

- 已验证 Manifest 描述请求的形态与声明的限制；它不会沙箱化任意 Package Code；
- 支持的 ScenarioPack Runtime Artifact 是声明式数据；
- `RulePackPlugin` 与自定义 Loader 是单独的可信插件，在 ScenarioPack 合同之外仍可能产生进程级副作用；
- Host 必须在注册或执行前审查第三方可执行代码与 Package Provenance。

ScenarioPack 贡献不能：

- 调用网络、读取 Secret、写文件或执行 Provider；
- 选择 Interpreter、Generator、PostProcessor、Reviewer 或 Fallback Provider；
- 创建 `RemoteCallAuthorization` 或 `ExecutionAuthorization`；
- 改变 Budget、Destination、Retry、Timeout、Retention、Consent、Moderation 或 Rights Policy；
- 修改 `Observation`、Decision、已接受的 Ontology Fact、Locked Prompt Section、ReferencePlan Order 或 OutputContract；
- 禁用 Prompt Guard、Capability Preflight、Cleanup Obligation、Receipt 或人工复核 Gate。

任何所需远程行为都必须由单独注册的 `ProviderAdapter` 或其他执行 Adapter 实现，由适用的 `ProviderCapabilityProfile` 描述，并经过常规 Plan 与 Authorization 路径。ScenarioPack 不能创建或修改这两个对象中的任何一个。

## 12. Authoring Scaffold 与发布审计

仓库提供普通的离线 `ScenarioPackTemplate`。它用于搭建数据和测试，不是特权 Generator、Installer、Marketplace Client 或 Activation Path。

```text
package.json
README.md
LICENSE
scenario-pack/manifest.json
scenario-pack/contributions/*.json
scenario-pack/fixtures/*.json
scenario-pack/migrations/*.json
```

```ts
interface ScenarioPackTemplate {
  schemaVersion: 'voce.scenario-pack-template/v1alpha1'
  templateVersion: string
  files: Array<{
    path: string
    role: 'manifest' | 'contribution' | 'fixture' | 'migration' | 'readme' | 'license'
    required: boolean
  }>
  scripts: {
    validate: string
    testOffline: string
    pack: string
    audit: string
  }
  requiredAcceptanceIds: string[]
}

interface ScenarioPackScaffoldInput {
  packageName: string
  packId: string
  kind: 'root' | 'extension'
  license: string
  defaultLocale: string
}

interface ScenarioPackPublishAudit {
  packId: string
  version: string
  distributionDigest: string
  packageDigest: string
  manifestHash: string
  validatorVersion: string
  templateVersion: string
  fixtureSuiteDigests: string[]
  checks: Array<{
    id: string
    status: 'passed' | 'failed'
    evidenceHash?: string
  }>
  auditHash: string
}
```

Scaffold 只会在显式选择的 Workspace 中创建文件。普通发布审计：

1. 验证 Manifest、完整 Distribution Digest、语义 Package Digest 与每个已声明 Contribution Digest；
2. 检查已声明的 License、Provenance、Core 与 Contract Range；
3. 检查 `defaultLocale` 存在、Locale Key 可解析、Required Disclosure 完整、Accessibility Declaration 完整；
4. 验证 Capability Requirement 与 Declaration，但不选择 Adapter；
5. 证明 FixtureSuite 使用 Mock Adapter 离线运行且不需要 Secret；
6. 验证 Migration Declaration、拒绝生命周期脚本、全部可执行内容和不安全 Archive Entry，并确保每个 Inventory Entry 都能在包内解析；
7. 从一次干净的 Pack Operation 产出相同 Package Digest，并生成 `ScenarioPackPublishAudit`。

通过审计只表示该包符合本合同及其声明的离线 Fixture。它不会安装、注册、激活、授权、认证安全性、证明模型质量或使包达到生产就绪。npm 与 GitHub 仍只是普通分发渠道；发布不会让 Core 自动发现或下载它们。

## 13. 第一方包

v0.1 计划中的初始包都将是普通 Registry Entry：

```text
@voce/scenario-virtual-try-on
@voce/scenario-cosplay
@voce/scenario-product-shot
```

它们可以共享版本化 Ontology 与声明式 Rule Schema，也可以依赖携带可复用贡献项的兼容 Extension ScenarioPack，但 Core 不包含对它们的内置 Import 或 Branch。Product-shot 必须能在零人物情况下编译。使用符合合同的第三方 Pack 替换任何第一方 Pack，都不需要修改 Core。

## 14. 错误码

```text
PACK_MANIFEST_INVALID
PACK_SCHEMA_UNSUPPORTED
PACK_CONTRIBUTION_INVALID
PACK_DECLARATION_INVALID
PACK_PROVENANCE_INVALID
PACK_FIXTURE_INVALID
PACK_FIXTURE_FAILED
PACK_SOURCE_UNSUPPORTED
PACK_NOT_FOUND
PACK_ROOT_REQUIRED
PACK_MULTIPLE_ROOTS
PACK_KIND_INVALID
PACK_CONFIGURATION_INVALID
PACK_VERSION_UNSATISFIABLE
PACK_COMPATIBILITY_MISMATCH
PACK_CORE_INCOMPATIBLE
PACK_CONTRACT_INCOMPATIBLE
PACK_DIGEST_MISMATCH
PACK_DUPLICATE_ID_VERSION
PACK_DEPENDENCY_UNSATISFIABLE
PACK_DEPENDENCY_MISSING
PACK_CONFLICT
PACK_RULE_CONFLICT
PACK_ORDER_CYCLE
PACK_CAPABILITY_UNSATISFIABLE
PACK_PERMISSION_FORBIDDEN
PACK_OVERRIDE_INVALID
PACK_OVERRIDE_FORBIDDEN
PACK_OVERRIDE_POINT_NOT_FOUND
PACK_DISCLOSURE_REQUIRED
PACK_MIGRATION_REQUIRED
PACK_MIGRATION_INVALID
PACK_MIGRATION_FAILED
PACK_MIGRATION_CONFIRMATION_REQUIRED
PACK_IMPLEMENTATION_UNAVAILABLE
PACK_ACTIVATION_INVALID
PACK_REPLAY_LOCK_MISMATCH
PACK_UNINSTALL_BLOCKED
PACK_TEMPLATE_INVALID
PACK_PUBLISH_AUDIT_FAILED
```

错误码稳定、安全；当 Resolution 已经开始时，错误会附带 `PackResolutionReport`。任何错误都不会激活其他 Pack、下载内容、更换 Provider 或削弱约束。

以上是 v0.1 完整的公共 `PACK_*` 错误码。`PACK_DEPENDENCY_UNSATISFIABLE`、`PACK_COMPATIBILITY_MISMATCH`、`PACK_RULE_CONFLICT`、`PACK_OVERRIDE_FORBIDDEN`、`PACK_FIXTURE_FAILED` 与 `PACK_MIGRATION_FAILED` 是稳定的顶层分类；相邻细粒度错误码可作为结构化 Cause 发出。实现可以附加安全 Detail，但不得另造公共 Pack Lifecycle Code。尤其是历史字节或实现不可用时，始终使用 `PACK_IMPLEMENTATION_UNAVAILABLE`。

## 15. 版本兼容

ScenarioPack 版本遵循 Semantic Versioning：

- major：不兼容的 Manifest/Contract Requirement、移除或重新定义公共词汇、改变 hard/required 语义，或不兼容的 Configuration；
- minor：向后兼容地增加词汇、Contribution、可选 Configuration 或 Review Template；
- patch：保留公共 Schema 的兼容性缺陷修复。

每次内容变更都必须产生新版本与新 Digest。在同一个 Catalog 中，Registry 会拒绝 `packId + version` 相同但 Package Digest 不同的两个包。v0.1 的 `ScenarioPackRequest.versionRange`、Dependency `versionRange` 与 `extensionOf.rootVersionRange` 为未来兼容保留字段名，但只接受不含 Pre-release 或 Build Metadata 的精确正常 SemVer。`ScenarioPackConflict.versionRange`、Core/Contract Compatibility Range 与 Migration Source Range 仍是真正的 SemVer Range，并针对已选精确版本求值；只有 Range 明确指名 Pre-release 时才可包含预发布版本。Replay 与现有 Case 使用精确固定的版本和 Digest。

## 16. v0.1 验收矩阵

| ID | 要求 |
| --- | --- |
| SPK-AC-001 | Core 通过同一 Registry 加载第一方和第三方 Pack，并且不包含以场景 ID 为键的 Branch 或 Import。 |
| SPK-AC-002 | `ScenarioPackSelection` 包含恰好一个 Root、显式 Extension 和可选的类型化 `HostPolicyOverlay`；仅安装、发布或注册不会激活任何内容，也不会授予授权。 |
| SPK-AC-003 | 相同的 `ScenarioPackSelection` 及其可选 `HostPolicyOverlay`、不可变 `ScenarioPackCatalogSnapshot` 与 Contract Version 会产出完全相同的 `ScenarioCompositionLock`、顺序、`EffectiveScenario`、`PackResolutionReport` 与语义 Hash。 |
| SPK-AC-004 | Lock 固定精确版本，Manifest/Package/Configuration/Dependency/Contribution Digest，Catalog 与 Resolver 版本，Canonicalization Profile，以及已接受的 Host-policy-overlay Hash。 |
| SPK-AC-005 | 缺失依赖、不兼容 Root/Extension 或 Contract Range、Digest 不匹配、已声明 Conflict、重复 Contribution Conflict 与排序环都会阻断，并提供解释性 Trace。 |
| SPK-AC-006 | Ontology、Rule、Scope、Prompt Section、Review Template、Default、`UIMetadata`、Capability Requirement 与 Declaration 遵守各自权限边界；Required Disclosure 会作为 Activation Gate。 |
| SPK-AC-007 | Scope 组合不能超出已接受意图或 Host Policy，也不会授权理解。 |
| SPK-AC-008 | Prompt 贡献不能改变 Locked Section、未确认证据、已批准的参考图顺序、Provider Selection 或 Prompt Guard 行为。 |
| SPK-AC-009 | Review Template 只创建任务；语义验收和人工验收仍在 ScenarioPack 权限之外。 |
| SPK-AC-010 | Default 仅适用于未指定值，并带有 declared-default 溯源信息；它不能设置安全、Provider、费用或授权字段。 |
| SPK-AC-011 | 每项 HostOverride 都指明 Pack 和已声明 OverridePoint；无效 Override 或 Overlay 不能削弱 hard/required 约束、已确认事实、Policy、Authorization 或 Package Digest。 |
| SPK-AC-012 | Upgrade 与唯一合法 `MigrationPlan` 会创建新的 Selection、Lock、EffectiveScenario、Case Revision 和 `MigrationReceipt`；Operation 保持在 Owner-pack Namespace 内，并保留旧产物。 |
| SPK-AC-013 | Deactivation 与 Uninstall 使用显式 Check/Receipt，绝不修改历史 Lock 或用户历史，并以 `PACK_UNINSTALL_BLOCKED` 或 `PACK_IMPLEMENTATION_UNAVAILABLE` 阻断，不替换版本，也不联网获取。 |
| SPK-AC-014 | Acquisition 在没有生命周期脚本或任何可执行内容的情况下验证安全路径、资源上限、完整 Inventory 与 SHA-256 Distribution/Package Digest；Discovery 保持显式本地，不存在 Marketplace、动态扫描、自动下载、隐藏 Provider、隐式 Activation 或由发布获得的 Runtime 权限。 |
| SPK-AC-015 | Virtual try-on、cosplay 与 product-shot 各自通过已声明的离线 `FixtureSuite`，使用 Mock Adapter 与同一 Core Pipeline，且无需 Secret、网络调用或真实 Provider。 |
