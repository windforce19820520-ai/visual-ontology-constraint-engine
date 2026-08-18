export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }
export interface Provenance { source: ProvenanceSource; sourceIds: string[]; createdBy: string; createdAt: string }
export type ProvenanceSource = 'user_explicit' | 'user_confirmed' | 'trusted_metadata' | 'reference_observed' | 'rule_inferred' | 'optimizer_suggested' | 'declared_default'
export interface ArtifactHandle { id:string; storeId:string; contentHash:string; mediaType:string; byteLength?:number; role:string; resolverId:string; availability:'available'|'deleted'|'expired'|'unknown'; retentionClass:string; retentionExpiresAt?:string; redactionPolicy:string }
export type EvidenceRegion = {kind:'rectangle';x:number;y:number;width:number;height:number}|{kind:'polygon';points:Array<{x:number;y:number}>}|{kind:'mask';maskArtifactId:string}
export type ContractSchemaVersion = `voce.${string}/v${number}${string}`
export type Importance = 'hard'|'required'|'preferred'
export type ChangeOperation = 'preserve'|'replace'|'adjust'|'create'|'remove'
export type DecisionAuthority = 'user'|'host_policy'|'trusted_metadata'|'auto_policy'
export const OBSERVATION_SCHEMA_VERSION = 'voce.observation/v1alpha1' as const
export const OBSERVATION_DECISION_SCHEMA_VERSION = 'voce.observation-decision/v1alpha1' as const
export const SOURCE_BINDING_SCHEMA_VERSION = 'voce.source-binding/v1alpha1' as const
export const BINDING_DECISION_SCHEMA_VERSION = 'voce.binding-decision/v1alpha1' as const
export const ONTOLOGY_INSTANCE_SCHEMA_VERSION = 'voce.ontology-instance/v1alpha1' as const
export const REQUESTED_SCOPE_PLAN_SCHEMA_VERSION = 'voce.requested-scope-plan/v1alpha1' as const
export const REFERENCE_INTERPRETER_INPUT_SCHEMA_VERSION = 'voce.reference-interpreter-input/v1alpha1' as const
export const REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION = 'voce.reference-interpreter-result/v1alpha1' as const
export const RESOLVER_INPUT_SCHEMA_VERSION = 'voce.evidence-source-resolver-input/v1alpha1' as const
export const RESOLVER_RESULT_SCHEMA_VERSION = 'voce.evidence-source-resolver-result/v1alpha1' as const
export const QUESTION_SCHEMA_VERSION = 'voce.question/v1alpha1' as const
export const CONFLICT_SCHEMA_VERSION = 'voce.conflict/v1alpha1' as const
export const UNRESOLVED_ITEM_SCHEMA_VERSION = 'voce.unresolved-item/v1alpha1' as const
export const DECISION_TRACE_SCHEMA_VERSION = 'voce.decision-trace/v1alpha1' as const
export const ONTOLOGY_FACT_SCHEMA_VERSION = 'voce.ontology-fact/v1alpha1' as const

export interface AnalyzerMetadata { schemaVersion:string; adapterId:string; model:string; promptVersion:string; fixtureId?:string }
export interface TrustedMetadata { schemaVersion:'voce.trusted-metadata/v1alpha1'; id:string; targetPath:string; assetId?:string; value:JsonValue; provenance:Provenance; authority:'host'|'catalog'|'user' }
export interface CasePolicies { schemaVersion:'voce.case-policies/v1alpha1'; observationConfirmation:'explicit'|'policy'; bindingConfirmation:'explicit'|'policy'; allowDeclaredDefaults:boolean; extensions?:JsonObject }

/** The target-side directive payload shared by one normalized ChangeIntent record. */
export interface TargetDirective { operation:ChangeOperation; targetPath:string; requestedValue?:JsonValue; sourceHintIds?:string[]; importance:Importance }
export interface ChangeIntent extends TargetDirective { schemaVersion:'voce.change-intent/v1alpha1'; id:string; provenance:Provenance }

export type RequestedScopePurpose = 'resolve_change'|'find_source'|'detect_conflict'|'validate_dependency'
export interface RequestedScope { schemaVersion:'voce.requested-scope/v1alpha1'; id:string; ontologyPath:string; assetIds:string[]; purpose:RequestedScopePurpose; required:boolean }
export interface RequestedScopePlan { schemaVersion:typeof REQUESTED_SCOPE_PLAN_SCHEMA_VERSION; id:string; caseId:string; caseRevision:number; scopes:RequestedScope[]; excludedScopes:string[]; questions:Question[]; planHash:string }

export interface Question { schemaVersion:typeof QUESTION_SCHEMA_VERSION; id:string; code:string; prompt:string; targetPath?:string; assetIds:string[]; relatedIds:string[]; blocking:boolean; status:'open'|'resolved'|'dismissed' }
export interface Conflict { schemaVersion:typeof CONFLICT_SCHEMA_VERSION; id:string; code:string; message:string; targetPath?:string; candidateIds:string[]; relatedIds:string[]; blocking:boolean }
export interface UnresolvedItem { schemaVersion:typeof UNRESOLVED_ITEM_SCHEMA_VERSION; id:string; code:string; message:string; status:'unknown'|'unresolved'; targetPath?:string; assetId?:string; relatedIds:string[] }
export type DecisionTraceKind = 'scope'|'intent'|'observation'|'binding'|'fact'|'conflict'
export type DecisionTraceOutcome = 'accepted'|'proposed'|'rejected'|'excluded'|'unresolved'|'conflict'
export interface DecisionTrace { schemaVersion:typeof DECISION_TRACE_SCHEMA_VERSION; id:string; kind:DecisionTraceKind; outcome:DecisionTraceOutcome; code:string; message:string; targetPath?:string; subjectIds:string[] }

export interface Observation { schemaVersion:typeof OBSERVATION_SCHEMA_VERSION; id:string; contentHash:string; assetId:string; ontologyPath:string; value:JsonValue; confidence?:number; evidenceRegion?:EvidenceRegion; provenance:Provenance; analyzer?:AnalyzerMetadata; warnings:string[] }
export interface ObservationDecision { schemaVersion:typeof OBSERVATION_DECISION_SCHEMA_VERSION; decisionId:string; decisionHash:string; observationId:string; observationHash:string; contextHash:string; status:'proposed'|'confirmed'|'rejected'; authority:DecisionAuthority; decidedBy:string; policyVersion?:string; decidedAt:string; reasonCode:string }
export interface SourceBinding { schemaVersion:typeof SOURCE_BINDING_SCHEMA_VERSION; id:string; contentHash:string; targetPath:string; observationIds:string[]; relation:'preserve'|'reproduce'|'inspire'|'exclude'; priority:Importance }
export interface BindingDecision { schemaVersion:typeof BINDING_DECISION_SCHEMA_VERSION; decisionId:string; decisionHash:string; bindingId:string; bindingHash:string; contextHash:string; status:'proposed'|'confirmed'|'rejected'; authority:DecisionAuthority; decidedBy:string; policyVersion?:string; decidedAt?:string; reasonCode:string }
/**
 * Structured acceptance references keep user/trusted metadata provenance and
 * binding-decision authority auditable without encoding multiple IDs in one
 * delimiter-sensitive string.
 */
export interface OntologyFact { schemaVersion:typeof ONTOLOGY_FACT_SCHEMA_VERSION; id:string; path:string; value:JsonValue; provenance:Provenance; acceptedByIds:string[]; acceptedByDecisionIds:string[]; sourceBindingIds:string[] }
export interface OntologyInstance { schemaVersion:typeof ONTOLOGY_INSTANCE_SCHEMA_VERSION; id:string; caseId:string; caseRevision:number; contextHash:string; requestedScopePlanHash:string; facts:OntologyFact[]; unknownPaths:string[]; unspecifiedPaths:string[]; unresolvedItems:UnresolvedItem[]; conflicts:Conflict[]; decisionTrace:DecisionTrace[]; instanceHash:string }

export interface ManualObservationDeclaration { schemaVersion:'voce.manual-observation-declaration/v1alpha1'; id:string; assetId:string; ontologyPath:string; value:JsonValue; confidence?:number; evidenceRegion?:EvidenceRegion; provenance:Provenance; warnings:string[] }
export interface ReferenceInterpreterInput { schemaVersion:typeof REFERENCE_INTERPRETER_INPUT_SCHEMA_VERSION; caseId:string; caseRevision:number; contextHash:string; assets:ArtifactHandle[]; requestedScopePlan:RequestedScopePlan; effectiveScenario?:EffectiveScenario; manualDeclarations?:ManualObservationDeclaration[]; fixtureId?:string }
export interface ReferenceInterpreterResult { schemaVersion:typeof REFERENCE_INTERPRETER_RESULT_SCHEMA_VERSION; status:'ok'|'blocked'; interpreterId:string; inputHash:string; observations:Observation[]; unresolvedItems:UnresolvedItem[]; warnings:string[]; analyzer:AnalyzerMetadata; resultHash:string }
export interface ReferenceInterpreter { interpret(input:ReferenceInterpreterInput):ReferenceInterpreterResult }

export interface EvidenceAndSourceResolverInput { schemaVersion:typeof RESOLVER_INPUT_SCHEMA_VERSION; caseId:string; caseRevision:number; contextHash:string; requestedScopePlan:RequestedScopePlan; changeIntents:ChangeIntent[]; observations:Observation[]; observationDecisions:ObservationDecision[]; sourceBindings:SourceBinding[]; bindingDecisions:BindingDecision[]; trustedMetadata:TrustedMetadata[]; effectiveScenario?:EffectiveScenario }
export interface EvidenceAndSourceResolverResult { schemaVersion:typeof RESOLVER_RESULT_SCHEMA_VERSION; status:'ok'|'blocked'; resolverId:string; inputHash:string; proposedBindings:SourceBinding[]; proposedBindingDecisions:BindingDecision[]; confirmedBindings:SourceBinding[]; confirmedBindingDecisions:BindingDecision[]; ontologyInstance:OntologyInstance; questions:Question[]; conflicts:Conflict[]; unresolvedItems:UnresolvedItem[]; decisionTrace:DecisionTrace[]; warnings:string[]; resultHash:string }
export interface EvidenceAndSourceResolver { resolve(input:EvidenceAndSourceResolverInput):EvidenceAndSourceResolverResult }

export interface VersionedCoreContractRef { contractId:string; version:string }
export interface JsonSchemaRef extends VersionedCoreContractRef { schemaId:string }
export type ScenarioInteractionMode = 'text_only'|'reference_guided'|'edit_existing'
export interface ScenarioCardinality { min:number; max:number }
export interface ScenarioInputExpectation { id:string; inputKind:'text_intent'|'asset'|'structured_metadata'; dataType:'text'|'image'|'json'; requiredIn:ScenarioInteractionMode[]; cardinality:ScenarioCardinality; ontologyPath?:string; mediaTypes?:string[]; sensitivity:'none'|'personal_data'|'biometric_candidate' }
export interface ScenarioOutputExpectation { id:string; artifactKind:'image'|'structured_review'|'layer_bundle'; dataType:'image'|'json'; producedIn:ScenarioInteractionMode[]; cardinality:ScenarioCardinality; mediaTypes:string[]; outputContract?:VersionedCoreContractRef }
export interface UIMetadata { defaultLocale:string; locales:Record<string,{displayName:string;description:string;instructions?:string;messages:Record<string,string>}>; disclosures:Array<{id:string;severity:'info'|'warning'|'required';messageKey:string}>; accessibility:{textAlternativesRequired:boolean;keyboardOperableReferenceUI:boolean;doesNotRelyOnColorAlone:boolean} }
export interface ScenarioCapabilityRequirement { id:string; capability:string; importance:'hard'|'required'|'preferred'; reasonCode:string }
export interface ScenarioPackDeclarations { containsExecutableScenarioCode:false; distributionLifecycleScripts:false; containsExecutableFiles:false; fixturesRequireNetwork:false; fixturesRequireRealProvider:false; collectsTelemetry:false; mayHandlePersonImages:boolean; rightsDisclosureRequired:boolean }
export interface ScenarioPackPermissions { network:false; remoteCalls:false; secrets:false; filesystemWrite:false; mutateConfirmedFacts:false; authorizeCalls:false; overrideHostPolicy:false; selectProvider:false; changeBudgets:false }
export interface ScenarioPackDependency { packId:string; versionRange:string; role:'extension'; reasonCode:string }
export interface ScenarioPackConflict { packId:string; versionRange:string; reasonCode:string }
export type ScenarioContributionKind = 'ontologyVocabulary'|'rulePacks'|'interpretationScopes'|'promptSections'|'reviewTemplates'|'defaults'|'overridePoints'
export interface ScenarioContributionDescriptor { id:string; schemaVersion:string; contentDigest:string }
export interface ScenarioContributionIndex { ontologyVocabulary:ScenarioContributionDescriptor[]; rulePacks:ScenarioContributionDescriptor[]; interpretationScopes:ScenarioContributionDescriptor[]; promptSections:ScenarioContributionDescriptor[]; reviewTemplates:ScenarioContributionDescriptor[]; defaults:ScenarioContributionDescriptor[]; overridePoints:ScenarioContributionDescriptor[] }
export interface DistributionInventoryEntry { path:string; role:'contribution'|'fixture'|'migration'|'readme'|'license'|'package_metadata'; contentDigest:string }
export interface PackageProvenance { publisher:string; sourceRepository?:string; sourceRevision?:string; sourceDigest?:string }
export interface PackageAcquisition { sourceKind:'memory'|'directory'|'file_archive'|'npm_tarball'|'github_release'; sourceLocator:string; distributionDigest:string; lifecycleScriptsExecuted:false }
export interface ResolvedContribution extends JsonObject { packId:string; contributionKind:ScenarioContributionKind; contributionId:string; contentDigest:string }
export type OntologyValueKind = 'boolean'|'enum'|'string'|'number'
export type OntologyCardinality = 'one'|'many'
export interface OntologyPathDefinition { path:string; valueKind:OntologyValueKind; cardinality:OntologyCardinality; allowedValues?:JsonValue[]; defaultImportance?:Importance }
export type OntologyVocabularyContribution = ResolvedContribution & { paths:OntologyPathDefinition[] }
export type DeclarativeConditionOperator = 'present'|'absent'|'equals'|'contains'
export interface DeclarativeRuleCondition { path:string; operator:DeclarativeConditionOperator; value?:JsonValue }
export interface DeclarativeRuleOperand { id:string; conditions:DeclarativeRuleCondition[] }
export type DeclarativeRuleKind = 'incompatibility'|'dependency'|'cardinality'|'occlusion'|'resource'
export interface DeclarativeRuleResolution { strategy:'block'|'degrade_operand'; operandId?:string; reasonCode:string }
export interface DeclarativeRule { id:string; kind:DeclarativeRuleKind; operands:DeclarativeRuleOperand[]; resolution:DeclarativeRuleResolution; importance?:Importance; explanation:string; code?:string; resourceId?:string; dependencyKind?:ConstraintDependencyKind }
export type DeclarativeRulePackContribution = ResolvedContribution & { namespace:string; rules:DeclarativeRule[] }
export interface PromptSectionDefinition { id:string; group:string; order:number; pathPrefixes:string[]; requiredPaths?:string[]; templateKey:string }
export type PromptSectionContribution = ResolvedContribution & { sections:PromptSectionDefinition[] }
export interface OverridePoint { id:string; targetKind:'configuration'|'declared_default'|'contribution_activation'; targetPath:string; valueSchema?:JsonSchemaRef; allowDisable:boolean; maximumImportance:'preferred'; contentDigest?:string }
export type HostOverrideOperation = {kind:'set_configuration';packId:string;overridePointId:string;value:JsonValue}|{kind:'set_declared_default';packId:string;overridePointId:string;value:JsonValue}|{kind:'set_contribution_activation';packId:string;overridePointId:string;active:boolean}
export interface HostOverride { id:string; operation:HostOverrideOperation; reasonCode:string; contentHash:string }
export interface HostPolicyOverlay { id:string; caseId:string; caseRevision:number; overrides:HostOverride[]; authority:'user'|'host_policy'; reasonCode:string; overlayHash:string }
export interface ScenarioPackManifest { schemaVersion:'voce.scenario-pack/v1alpha1'; packId:string; version:string; kind:'root'|'extension'; supportedInteractionModes:ScenarioInteractionMode[]; inputExpectations:ScenarioInputExpectation[]; outputExpectations:ScenarioOutputExpectation[]; extensionOf?:{rootPackId:string;rootVersionRange:string}; license:string; provenance:PackageProvenance; coreRange:string; contractRanges:Record<string,string>; configurationSchema?:JsonSchemaRef; ui:UIMetadata; dependencies:ScenarioPackDependency[]; conflicts:ScenarioPackConflict[]; composition:{before:string[];after:string[]}; contributions:ScenarioContributionIndex; fixtures:ScenarioContributionDescriptor[]; migrations:ScenarioContributionDescriptor[]; capabilityRequirements:ScenarioCapabilityRequirement[]; declarations:ScenarioPackDeclarations; permissions:ScenarioPackPermissions; distributionInventory:DistributionInventoryEntry[] }
export interface FixtureSuite { id:string; schemaVersion:string; cases:JsonValue[]; contentDigest:string }
export interface ScenarioPack { manifest:ScenarioPackManifest; contributions:{ontologyVocabulary:ResolvedContribution[];rulePacks:DeclarativeRulePackContribution[];interpretationScopes:ResolvedContribution[];promptSections:ResolvedContribution[];reviewTemplates:ResolvedContribution[];defaults:ResolvedContribution[];overridePoints:OverridePoint[];fixtureSuites:FixtureSuite[]}; migrations:JsonValue[] }
export type LocalScenarioPackSource = {kind:'memory';definition:ScenarioPack;logicalFiles:Array<{path:string;bytes:Uint8Array}>}|{kind:'directory';rootPath:string}|{kind:'archive';archivePath:string;acquisitionKind:'file_archive'|'npm_tarball'|'github_release'}
export interface ScenarioPackDescriptor { manifest:ScenarioPackManifest; manifestHash:string; packageDigest:string; distributionDigest:string; provenance:PackageProvenance; acquisition:PackageAcquisition }
export interface PackDeactivation { availabilityPolicyId:string; packId:string; version?:string; registryRevision:number; allowNewActivations:false; changedBy:string; reasonCode:string; changedAt:string; policyHash:string }
export interface ScenarioPackCatalogSnapshot { contractVersion:'voce.scenario-pack/v1alpha1'; resolverVersion:string; registryRevision:number; entries:ScenarioPackDescriptor[]; availabilityPolicies:PackDeactivation[]; catalogHash:string }
export interface ScenarioPackRequest { packId:string; versionRange:string; configuration?:JsonObject }
export interface ScenarioPackSelection { root:ScenarioPackRequest; extensions:ScenarioPackRequest[]; hostPolicyOverlay?:HostPolicyOverlay }
export interface ScenarioCompositionLockEntry { packId:string;version:string;kind:'root'|'extension';manifestHash:string;packageDigest:string;configurationHash:string;resolvedDependencies:Array<{packId:string;version:string;packageDigest:string}>;contributionDigests:Record<string,string> }
export interface ScenarioCompositionLock { schemaVersion:'voce.scenario-pack-lock/v1alpha1';contractVersion:'voce.scenario-pack/v1alpha1';resolverVersion:string;catalogHash:string;canonicalization:'voce.canonical-json/v1alpha1';rootPackId:string;entries:ScenarioCompositionLockEntry[];compositionOrder:string[];hostPolicyOverlayHash?:string;hostOverrideHashes:string[];compositionHash:string;lockHash:string }
export interface AppliedOverrideRef { packId:string;overridePointId:string;hostOverrideId:string;contentHash:string }
export interface EffectiveScenario { lockHash:string;rootPackId:string;extensionPackIds:string[];compositionOrder:string[];configurations:Record<string,JsonObject>;ontologyVocabulary:ResolvedContribution[];rulePacks:ResolvedContribution[];interpretationScopes:ResolvedContribution[];promptSections:ResolvedContribution[];reviewTemplates:ResolvedContribution[];defaults:ResolvedContribution[];capabilityRequirements:ScenarioCapabilityRequirement[];declarations:JsonValue[];appliedOverrides:AppliedOverrideRef[];effectiveScenarioHash:string }
export interface ResolvedScenarioPack { packId:string;version:string;kind:'root'|'extension';packageDigest:string;manifestHash:string }
export interface ScenarioDependencyTrace { packId:string;dependencyPackId:string;status:'resolved'|'missing'|'incompatible'|'cycle';reasonCode:string }
export interface ScenarioCompositionTrace { from:string;to:string;reasonCode:string }
export interface ScenarioOverrideTrace { hostOverrideId:string;packId:string;overridePointId:string;status:'applied'|'blocked';reasonCode:string }
export interface ScenarioResolutionConflict { code:string;packIds:string[];contributionIds:string[];overrideIds:string[];reason:string;action:string }
export interface ScenarioResolutionWarning { code:string;message:string;packIds:string[] }
export interface PackResolutionReport { status:'resolved'|'blocked';lockHash?:string;effectiveScenarioHash?:string;selected:ResolvedScenarioPack[];dependencyTrace:ScenarioDependencyTrace[];compositionTrace:ScenarioCompositionTrace[];overrideTraces:ScenarioOverrideTrace[];conflicts:ScenarioResolutionConflict[];warnings:ScenarioResolutionWarning[];reportHash:string }
export type ScenarioPackResolution = {status:'resolved';lock:ScenarioCompositionLock;effectiveScenario:EffectiveScenario;report:PackResolutionReport&{status:'resolved'}}|{status:'blocked';report:PackResolutionReport&{status:'blocked'}}
export interface ScenarioPackRegistry { register(source:LocalScenarioPackSource):ScenarioPackDescriptor; list():ScenarioPackDescriptor[]; snapshot():ScenarioPackCatalogSnapshot; resolve(selection:ScenarioPackSelection,catalog?:ScenarioPackCatalogSnapshot):ScenarioPackResolution }

export interface CaseSpec { schemaVersion:'voce.case-spec/v1alpha1'; id:string; revision:number; mode:'manual'|'assisted'|'auto'; scenario:ScenarioPackSelection; userIntent:string; assets:ArtifactHandle[]; trustedMetadata:TrustedMetadata[]; policies:CasePolicies; requestedOutput:OutputContract }
export interface OutputContract { artifactKind:'image'|'structured_review'|'layer_bundle';dataType:'image'|'json';mediaTypes:string[];cardinality:{min:number;max:number};dimensions?:{width:number;height:number};background?:'transparent'|'opaque'|'any';maxBytes?:number;allowAlpha?:boolean;downstreamUse?:string }
export interface VersionPin { id:string;version:string;digest:string }
export interface CompilationContext { caseSpecId:string;caseSpecRevision:number;caseSpecHash:string;artifactHashes:string[];decisionHashes:string[];scenarioCompositionLockHash:string;effectiveScenarioHash:string;rulePackPlugins:VersionPin[];optimizer:VersionPin;contextHash:string;ontologySchema?:VersionPin;hostPolicy?:VersionPin;adapters?:VersionPin[];capabilityProfiles?:VersionPin[];selectedGenerationProfileId?:string;optimizerMode?:'strict'|'balanced'|'creative';budgets?:Budget[];dataTransfers?:DataTransfer[] }

/* M4: constraint compilation, reference budgeting, and capability-aware planning. */
export const CONSTRAINT_SCHEMA_VERSION = 'voce.constraint/v1alpha1' as const
export const GOAL_SCHEMA_VERSION = 'voce.goal/v1alpha1' as const
export const CONSTRAINT_DEPENDENCY_SCHEMA_VERSION = 'voce.constraint-dependency/v1alpha1' as const
export const RESOURCE_CLAIM_SCHEMA_VERSION = 'voce.resource-claim/v1alpha1' as const
export const CONSTRAINT_CONFLICT_SCHEMA_VERSION = 'voce.constraint-conflict/v1alpha1' as const
export const DEGRADATION_SCHEMA_VERSION = 'voce.degradation/v1alpha1' as const
export const REVIEW_REQUIREMENT_SCHEMA_VERSION = 'voce.review-requirement/v1alpha1' as const
export const RULE_TRACE_SCHEMA_VERSION = 'voce.rule-trace/v1alpha1' as const
export const CONSTRAINT_IR_SCHEMA_VERSION = 'voce.constraint-ir/v1alpha1' as const
export const REFERENCE_CANDIDATE_SCHEMA_VERSION = 'voce.reference-candidate/v1alpha1' as const
export const REFERENCE_DEPENDENCY_SCHEMA_VERSION = 'voce.reference-dependency/v1alpha1' as const
export const PLANNED_REFERENCE_SCHEMA_VERSION = 'voce.planned-reference/v1alpha1' as const
export const REFERENCE_OMISSION_SCHEMA_VERSION = 'voce.reference-omission/v1alpha1' as const
export const REFERENCE_PLAN_SCHEMA_VERSION = 'voce.reference-plan/v1alpha1' as const
export const PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION = 'voce.provider-capability-profile/v1alpha1' as const
export const PIPELINE_STEP_SCHEMA_VERSION = 'voce.pipeline-step/v1alpha1' as const
export const STEP_DEPENDENCY_SCHEMA_VERSION = 'voce.step-dependency/v1alpha1' as const
export const BUDGET_SCHEMA_VERSION = 'voce.budget/v1alpha1' as const
export const DATA_TRANSFER_SCHEMA_VERSION = 'voce.data-transfer/v1alpha1' as const
export const CLEANUP_SCHEMA_VERSION = 'voce.cleanup/v1alpha1' as const
export const COMPENSATION_SCHEMA_VERSION = 'voce.compensation/v1alpha1' as const
export const PIPELINE_PLAN_SCHEMA_VERSION = 'voce.pipeline-plan/v1alpha1' as const
export const PIPELINE_PLANNING_RESULT_SCHEMA_VERSION = 'voce.pipeline-planning-result/v1alpha1' as const
export const REMOTE_CALL_AUTHORIZATION_SCHEMA_VERSION = 'voce.remote-call-authorization/v1alpha1' as const
export const EXECUTION_AUTHORIZATION_SCHEMA_VERSION = 'voce.execution-authorization/v1alpha1' as const
export const EXPLAIN_RESULT_SCHEMA_VERSION = 'voce.explain-result/v1alpha1' as const
export const SEMANTIC_DIFF_SCHEMA_VERSION = 'voce.semantic-diff/v1alpha1' as const

export type ConstraintKind = 'preservation'|'transformation'|'visibility'|'coverage'|'occlusion'|'compatibility'|'dependency'|'cardinality'|'resource'|'source_isolation'|'provider'|'output'|'review'|'custom'
export type ConstraintState = 'active'|'satisfied'|'unsatisfied'|'waived'
export type ConstraintDependencyKind = 'requires'|'supports'|'excludes'|'parent_detail'|'identity_garment'|'source_isolation'|'visibility'|'occludes'|'ordered_before'
export type ResourceClaimMode = 'shared'|'exclusive'

export interface Constraint {
  schemaVersion: typeof CONSTRAINT_SCHEMA_VERSION
  id: string
  constraintHash: string
  kind: ConstraintKind
  importance: Importance
  status: ConstraintState
  targetPath?: string
  targetPaths: string[]
  predicate: string
  value?: JsonValue
  goalIds: string[]
  dependsOn: string[]
  resourceClaimIds: string[]
  sourceIds: string[]
  ruleId?: string
  reasonCode: string
  explanation: string
}

export interface Goal {
  schemaVersion: typeof GOAL_SCHEMA_VERSION
  id: string
  goalHash: string
  operation: ChangeOperation|'output'|'review'
  importance: Importance
  targetPath?: string
  requestedValue?: JsonValue
  sourceIds: string[]
  constraintIds: string[]
  explanation: string
}

export interface ConstraintDependency {
  schemaVersion: typeof CONSTRAINT_DEPENDENCY_SCHEMA_VERSION
  id: string
  dependencyHash: string
  parentId: string
  childId: string
  kind: ConstraintDependencyKind
  importance: Importance
  explanation: string
}

export interface ResourceClaim {
  schemaVersion: typeof RESOURCE_CLAIM_SCHEMA_VERSION
  id: string
  resourceHash: string
  resourceId: string
  mode: ResourceClaimMode
  claimantIds: string[]
  constraintIds: string[]
  quantity: number
  explanation: string
}

export interface ConstraintConflict {
  schemaVersion: typeof CONSTRAINT_CONFLICT_SCHEMA_VERSION
  id: string
  conflictHash: string
  code: string
  severity: Importance
  targetPath?: string
  constraintIds: string[]
  dependencyIds: string[]
  resourceClaimIds: string[]
  message: string
  blocking: boolean
  waiverAllowed: boolean
}

export interface Degradation {
  schemaVersion: typeof DEGRADATION_SCHEMA_VERSION
  id: string
  degradationHash: string
  preferenceId: string
  constraintId?: string
  goalId?: string
  reasonCode: string
  impact: string
  affectedIds: string[]
  explanation: string
}

export interface ReviewRequirement {
  schemaVersion: typeof REVIEW_REQUIREMENT_SCHEMA_VERSION
  id: string
  reviewHash: string
  reasonCode: string
  targetPath?: string
  constraintIds: string[]
  sourceIds: string[]
  blocking: boolean
  explanation: string
}

export interface RuleTrace {
  schemaVersion: typeof RULE_TRACE_SCHEMA_VERSION
  id: string
  traceHash: string
  ruleId: string
  contributionId?: string
  inputIds: string[]
  outputIds: string[]
  outcome: 'applied'|'skipped'|'degraded'|'blocked'
  reasonCode: string
  message: string
}

export interface ConstraintIR {
  schemaVersion: typeof CONSTRAINT_IR_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  requestedScopePlanHash: string
  instanceHash: string
  decisionHashes: string[]
  goals: Goal[]
  constraints: Constraint[]
  dependencies: ConstraintDependency[]
  resourceClaims: ResourceClaim[]
  conflicts: ConstraintConflict[]
  degradedPreferences: Degradation[]
  reviewRequirements: ReviewRequirement[]
  explanations: RuleTrace[]
  ruleTraces: RuleTrace[]
  warnings: string[]
  status: 'ok'|'blocked'
  deterministicSignature: string
}

export interface ConstraintWaiver {
  schemaVersion: 'voce.constraint-waiver/v1alpha1'
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  targetId: string
  authority: DecisionAuthority
  decidedBy: string
  reasonCode: string
  decidedAt: string
  waiverHash: string
}

export interface ConstraintCompilationInput {
  schemaVersion: 'voce.constraint-compilation-input/v1alpha1'
  caseId: string
  caseRevision: number
  context: CompilationContext
  contextHash: string
  requestedScopePlanHash: string
  ontologyInstance: OntologyInstance
  ontologyStatus?: 'ok'|'blocked'
  status?: 'ok'|'blocked'
  changeIntents: ChangeIntent[]
  sourceBindings: SourceBinding[]
  bindingDecisions: BindingDecision[]
  outputContract: OutputContract
  effectiveScenario?: EffectiveScenario
  waivers?: ConstraintWaiver[]
}

export interface ReferenceBudget {
  maximumReferenceCount?: number
  maximumTotalBytes?: number
  usedReferenceCount: number
  usedTotalBytes?: number
  byteLengthKnown: boolean
  unknownByteLengthAssetIds: string[]
}

export interface ReferenceCandidate {
  schemaVersion: typeof REFERENCE_CANDIDATE_SCHEMA_VERSION
  id: string
  candidateHash?: string
  assetId: string
  artifact?: ArtifactHandle
  artifactHandle?: ArtifactHandle
  contentHash: string
  mediaType?: string
  byteLength?: number
  role?: string
  ontologyScopes?: string[]
  importance?: Importance
  constraintIds?: string[]
  sourceBindingIds?: string[]
  goalIds?: string[]
  orderKey?: string
}

export interface ReferenceDependency {
  schemaVersion: typeof REFERENCE_DEPENDENCY_SCHEMA_VERSION
  id: string
  dependencyHash?: string
  parentCandidateId: string
  childCandidateId: string
  kind: ConstraintDependencyKind
  importance: Importance
  reasonCode: string
  explanation: string
}

export interface PlannedReference {
  schemaVersion: typeof PLANNED_REFERENCE_SCHEMA_VERSION
  id: string
  candidateId: string
  assetId: string
  contentHash: string
  mediaType: string
  byteLength?: number
  role: string
  ontologyScopes: string[]
  constraintIds: string[]
  sourceBindingIds: string[]
  dependencyIds: string[]
  order: number
  label: string
}

export interface ReferenceOmission {
  schemaVersion: typeof REFERENCE_OMISSION_SCHEMA_VERSION
  id: string
  omissionHash: string
  candidateId: string
  assetId: string
  importance: Importance
  constraintIds: string[]
  dependencyIds: string[]
  reasonCode: string
  impact: string
}

export interface ReferencePlan {
  schemaVersion: typeof REFERENCE_PLAN_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  constraintSignature: string
  profileId: string
  profileVersion: string
  profileDigest: string
  selected: PlannedReference[]
  ordered: PlannedReference[]
  omitted: ReferenceOmission[]
  blockedReferences: ReferenceOmission[]
  dependencies: ReferenceDependency[]
  budget: ReferenceBudget
  warnings: string[]
  status: 'ok'|'blocked'
  planHash: string
}

export interface ReferencePlanningInput {
  schemaVersion: 'voce.reference-planning-input/v1alpha1'
  caseId: string
  caseRevision: number
  contextHash: string
  constraintIR: ConstraintIR
  candidates: ReferenceCandidate[]
  dependencies: ReferenceDependency[]
  profile: ProviderCapabilityProfile
  budget?: ReferenceBudget
}

export type CapabilityVerificationStatus = 'verified'|'declared'|'stale'|'unknown'
export interface ProviderReferenceLimits {
  maximumReferenceCount?: number
  maximumTotalBytes?: number
  maximumBytesPerReference?: number
  allowedMediaTypes?: string[]
  allowedRoles?: string[]
  ordering?: 'stable'|'role'|'provider_defined'
  roleOrder?: string[]
  supportsMultipleReferences?: boolean
  requiresPublishedReferences?: boolean
}
export interface ProviderOutputCapabilities {
  mediaTypes?: string[]
  formats?: string[]
  supportsTransparentOutput?: boolean
  supportsAlpha?: boolean
  maximumWidth?: number
  maximumHeight?: number
  minimumWidth?: number
  minimumHeight?: number
}
export interface ProviderCapabilityProfile {
  schemaVersion: typeof PROVIDER_CAPABILITY_PROFILE_SCHEMA_VERSION
  id: string
  version: string
  profileHash: string
  versionSummary: string
  adapterId: string
  adapterDigest?: string
  verificationStatus: CapabilityVerificationStatus
  referenceLimits?: ProviderReferenceLimits
  outputCapabilities?: ProviderOutputCapabilities
  maximumReferenceCount?: number
  maximumTotalReferenceBytes?: number
  maximumBytesPerReference?: number
  allowedReferenceMediaTypes?: string[]
  allowedReferenceRoles?: string[]
  referenceOrdering?: 'stable'|'role'|'provider_defined'
  referenceRoleOrder?: string[]
  supportsMultipleReferences?: boolean
  supportsEditing?: boolean
  supportsBatchOutput?: boolean
  requiresPublishedReferences?: boolean
  outputMediaTypes?: string[]
  supportsTransparentOutput?: boolean
  supportsAlpha?: boolean
  knownIncompatibilities: string[]
  timeoutMs: number
  streaming: boolean
  destination?: string
  dataCategories?: string[]
}

export interface Budget {
  schemaVersion: typeof BUDGET_SCHEMA_VERSION
  id: string
  maximumCalls: number
  maximumRetries: number
  timeoutMs: number
  maximumCost?: number
  currency?: string
  maximumBytes?: number
  budgetHash?: string
}

export interface DataTransfer {
  schemaVersion: typeof DATA_TRANSFER_SCHEMA_VERSION
  id: string
  adapterId: string
  destination: string
  region?: string
  dataCategories: string[]
  purpose: string
  maximumBytes?: number
  transferHash?: string
}

export interface CancellationPolicy {
  cancellable: boolean
  onCancel: 'stop'|'continue'|'submission_unknown'
}

export interface Cleanup {
  schemaVersion: typeof CLEANUP_SCHEMA_VERSION
  id: string
  cleanupHash: string
  phase: 'finally'|'compensation'
  appliesToStepIds: string[]
  conditions: Array<'always'|'on_success'|'on_failure_or_cancel'|'on_submission_unknown'|'on_worker_restart'>
  artifactRoles: string[]
  destination: string
  dataCategories: string[]
  explanation: string
}

export interface Compensation {
  schemaVersion: typeof COMPENSATION_SCHEMA_VERSION
  id: string
  compensationHash: string
  appliesToStepIds: string[]
  trigger: 'failure'|'cancel'|'submission_unknown'|'worker_restart'
  cleanupId: string
  explanation: string
}

export type PipelineStepType = 'resolve_asset'|'publish_asset'|'generate'|'postprocess'|'normalize'|'structural_validate'|'semantic_review'|'cleanup'|'compensation'|'custom'
export interface StepDependency {
  schemaVersion: typeof STEP_DEPENDENCY_SCHEMA_VERSION
  id: string
  dependencyHash?: string
  fromStepId: string
  toStepId: string
  relation: 'depends_on'|'finally_after'|'compensates'
}

export interface PipelineStep {
  schemaVersion: typeof PIPELINE_STEP_SCHEMA_VERSION
  id: string
  stepHash?: string
  type: PipelineStepType
  adapterId: string
  adapterVersion: VersionPin
  profileVersion: VersionPin
  inputArtifactRoles: string[]
  outputArtifactRoles: string[]
  dependsOn: string[]
  budget: Budget
  dataTransfer: DataTransfer
  destination: string
  cancellation: CancellationPolicy
  cleanupObligationIds: string[]
  compensationIds: string[]
  mayCreateChargedSubmission: boolean
  capability: string
}

export interface PipelinePlan {
  schemaVersion: typeof PIPELINE_PLAN_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  constraintSignature: string
  referencePlanHash: string
  outputContractHash: string
  profileDigest: string
  adapterDigests: string[]
  steps: PipelineStep[]
  dependencies: StepDependency[]
  budgets: Budget[]
  dataTransfers: DataTransfer[]
  cleanup: Cleanup[]
  compensation: Compensation[]
  warnings: string[]
  blockedReasons: string[]
  status: 'ok'|'blocked'
  planHash: string
}

export interface RegisteredStepCapability {
  id: string
  type: PipelineStepType
  capability: string
  adapterId: string
  adapterVersion: VersionPin
  adapterDigest?: string
  profileVersion?: VersionPin
  inputMediaTypes?: string[]
  outputMediaTypes?: string[]
  supportsAlpha?: boolean
  destination?: string
  dataCategories?: string[]
  budget?: Budget
  cancellation?: CancellationPolicy
  mayCreateChargedSubmission?: boolean
}

export interface PipelinePlanningInput {
  schemaVersion: 'voce.pipeline-planning-input/v1alpha1'
  caseId: string
  caseRevision: number
  contextHash: string
  outputContract: OutputContract
  constraintIR: ConstraintIR
  referencePlan: ReferencePlan
  profile: ProviderCapabilityProfile
  registeredCapabilities?: RegisteredStepCapability[]
  budgets?: Budget[]
  dataTransfers?: DataTransfer[]
}

export interface PipelinePlanningResult {
  schemaVersion: typeof PIPELINE_PLANNING_RESULT_SCHEMA_VERSION
  status: 'ok'|'blocked'
  pipelinePlan?: PipelinePlan
  blockedReasons: string[]
  warnings: string[]
  resultHash: string
}

export type RemoteCallPurpose = 'intent_interpretation'|'reference_interpretation'|'prompt_optimization'|'generation'|'postprocessing'|'semantic_review'|'asset_publication'
export interface RemoteCallAuthorization {
  schemaVersion: typeof REMOTE_CALL_AUTHORIZATION_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  stepId: string
  purpose: RemoteCallPurpose
  inputHash: string
  inputManifestHash?: string
  permittedArtifactHashes: string[]
  permittedScopeIds: string[]
  constraintIds: string[]
  modelId?: string
  modelVersion?: string
  adapterId: string
  adapterDigest: string
  profileDigest?: string
  destination: string
  region?: string
  dataCategories: string[]
  maximumCalls: number
  maximumRetries: number
  maximumBytes?: number
  timeoutMs: number
  maximumCost?: number
  currency?: string
  idempotencyKey: string
  authority: string
  authorizedBy: string
  authorizedAt: string
  expiresAt?: string
  authorizationHash: string
}

export interface ExecutionAuthorization {
  schemaVersion: typeof EXECUTION_AUTHORIZATION_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  constraintIRHash: string
  compilationSignature: string
  referencePlanHash: string
  pipelinePlanHash: string
  outputContractHash: string
  promptArtifactHash?: string
  adapterProfileDigests: string[]
  destinations: string[]
  dataTransferDigest: string
  budgetDigest: string
  remoteCallAuthorizationIds: string[]
  authority: string
  authorizedBy: string
  authorizedAt: string
  expiresAt?: string
  authorizationHash: string
}

export interface DispatchSnapshot {
  kind: 'remote_call'|'execution'
  caseId: string
  caseRevision: number
  contextHash: string
  stepId?: string
  purpose?: RemoteCallPurpose
  inputHash?: string
  inputManifestHash?: string
  modelId?: string
  modelVersion?: string
  permittedArtifactHashes?: string[]
  permittedScopeIds?: string[]
  constraintIds?: string[]
  adapterId?: string
  adapterDigest?: string
  profileDigest?: string
  destination?: string
  region?: string
  dataCategories?: string[]
  maximumCalls?: number
  maximumRetries?: number
  maximumBytes?: number
  timeoutMs?: number
  maximumCost?: number
  currency?: string
  idempotencyKey?: string
  constraintIRHash?: string
  compilationSignature?: string
  referencePlanHash?: string
  pipelinePlanHash?: string
  outputContractHash?: string
  promptArtifactHash?: string
  adapterProfileDigests?: string[]
  destinations?: string[]
  dataTransferDigest?: string
  budgetDigest?: string
  remoteCallAuthorizationIds?: string[]
}

export interface DispatchPreflightResult {
  status: 'authorized'|'blocked'
  code: 'AUTHORIZED'|'EXECUTION_NOT_AUTHORIZED'|'AUTHORIZATION_STALE'
  reasons: string[]
  authorizationHash: string
}

export interface ExplainEntry {
  id: string
  kind: 'source'|'rule'|'constraint'|'decision'|'asset'|'step'|'degradation'|'conflict'
  sourceIds: string[]
  ruleIds: string[]
  constraintIds: string[]
  decisionIds: string[]
  assetIds: string[]
  reasonCode: string
  message: string
}

export interface ExplainResult {
  schemaVersion: typeof EXPLAIN_RESULT_SCHEMA_VERSION
  artifactKind: 'constraint-ir'|'reference-plan'|'pipeline-plan'
  artifactId: string
  artifactHash: string
  entries: ExplainEntry[]
  status: 'ok'|'blocked'
  explainHash: string
}

export interface SemanticDiffChange {
  id: string
  before?: JsonValue
  after?: JsonValue
  reasonCode: string
}

export interface SemanticDiff {
  schemaVersion: typeof SEMANTIC_DIFF_SCHEMA_VERSION
  artifactKind: 'constraint-ir'|'reference-plan'|'pipeline-plan'
  beforeHash: string
  afterHash: string
  added: string[]
  removed: string[]
  changed: SemanticDiffChange[]
  degraded: string[]
  blocked: string[]
  diffHash: string
}

/* M5: provider-neutral Prompt IR, Guard, rendering, and offline execution. */
export const PROMPT_SECTION_SCHEMA_VERSION = 'voce.prompt-section/v1alpha1' as const
export const PROMPT_PARAMETER_SCHEMA_VERSION = 'voce.prompt-parameter/v1alpha1' as const
export const PROMPT_REFERENCE_MAPPING_SCHEMA_VERSION = 'voce.prompt-reference-mapping/v1alpha1' as const
export const PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION = 'voce.prompt-constraint-coverage/v1alpha1' as const
export const PROMPT_IR_SCHEMA_VERSION = 'voce.prompt-ir/v1alpha1' as const
export const PROMPT_TRANSFORMATION_SCHEMA_VERSION = 'voce.prompt-transformation/v1alpha1' as const
export const PROMPT_CANDIDATE_IR_SCHEMA_VERSION = 'voce.prompt-candidate-ir/v1alpha1' as const
export const PROMPT_GUARD_FINDING_SCHEMA_VERSION = 'voce.prompt-guard-finding/v1alpha1' as const
export const PROMPT_GUARD_INPUT_SCHEMA_VERSION = 'voce.prompt-guard-input/v1alpha1' as const
export const PROMPT_GUARD_RESULT_SCHEMA_VERSION = 'voce.prompt-guard-result/v1alpha1' as const
export const PROMPT_COMPILATION_INPUT_SCHEMA_VERSION = 'voce.prompt-compilation-input/v1alpha1' as const
export const PROMPT_OPTIMIZATION_INPUT_SCHEMA_VERSION = 'voce.prompt-optimization-input/v1alpha1' as const
export const PROVIDER_RENDER_REQUEST_SCHEMA_VERSION = 'voce.provider-render-request/v1alpha1' as const
export const PROVIDER_RENDER_RESULT_SCHEMA_VERSION = 'voce.provider-render-result/v1alpha1' as const
export const EXECUTION_RUN_SCHEMA_VERSION = 'voce.execution-run/v1alpha1' as const
export const STEP_EVENT_SCHEMA_VERSION = 'voce.step-event/v1alpha1' as const
export const STEP_RECEIPT_SCHEMA_VERSION = 'voce.step-receipt/v1alpha1' as const
export const REMOTE_CALL_RUN_SCHEMA_VERSION = 'voce.remote-call-run/v1alpha1' as const
export const EVALUATION_SCHEMA_VERSION = 'voce.evaluation/v1alpha1' as const
export const HUMAN_ACCEPTANCE_SCHEMA_VERSION = 'voce.human-acceptance/v1alpha1' as const
export const CLEANUP_RECEIPT_SCHEMA_VERSION = 'voce.cleanup-receipt/v1alpha1' as const
export const COMPENSATION_RECEIPT_SCHEMA_VERSION = 'voce.compensation-receipt/v1alpha1' as const
export const EXECUTION_TRACE_SCHEMA_VERSION = 'voce.execution-trace/v1alpha1' as const
export const ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION = 'voce.artifact-replay-result/v1alpha1' as const
export const OFFLINE_EXECUTION_INPUT_SCHEMA_VERSION = 'voce.offline-execution-input/v1alpha1' as const

export type PromptSectionKind = 'objective'|'positive'|'hard_constraint'|'required_constraint'|'preferred'|'forbidden'|'reference'|'output'|'suggestion'
export type PromptSectionMutability = 'locked'|'rephraseable'|'reorderable'|'suggestion_slot'
export type PromptParameterType = 'string'|'number'|'integer'|'boolean'|'enum'|'object'|'array'
export type PromptTransformationKind = 'rephrase'|'reorder'|'parameter_move'|'suggestion'|'add_suggestion'|'declared_suggestion'|'free_text'
export type PromptGuardSeverity = 'info'|'warning'|'error'|'critical'
export type PromptGuardStatus = 'accepted'|'rejected'|'fallback'

export interface PromptParameterBounds {
  type?: PromptParameterType
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  allowedValues?: JsonValue[]
}

export interface PromptSection {
  schemaVersion: typeof PROMPT_SECTION_SCHEMA_VERSION
  id: string
  kind: PromptSectionKind
  priority: number
  order: number
  content: string
  text?: string
  constraintIds: string[]
  sourceIds: string[]
  decisionIds: string[]
  assetIds: string[]
  importance: Importance
  mutability: PromptSectionMutability
  locked?: boolean
  slotId?: string
}

export interface PromptParameter {
  schemaVersion: typeof PROMPT_PARAMETER_SCHEMA_VERSION
  id: string
  name: string
  value: JsonValue
  valueType: PromptParameterType
  required: boolean
  mutability: PromptSectionMutability
  bounds?: PromptParameterBounds
  constraintIds: string[]
  sourceIds: string[]
  decisionIds: string[]
  provenance?: Provenance
  type?: PromptParameterType
  minimum?: number
  maximum?: number
  allowedValues?: JsonValue[]
}

export interface PromptReferenceMapping {
  schemaVersion: typeof PROMPT_REFERENCE_MAPPING_SCHEMA_VERSION
  id: string
  plannedReferenceId: string
  referenceId?: string
  assetId: string
  contentHash: string
  label: string
  role: string
  order: number
  required: boolean
  constraintIds: string[]
  sourceBindingIds: string[]
  decisionIds: string[]
}

export interface PromptProhibition {
  id: string
  text: string
  constraintIds: string[]
  sourceIds: string[]
  importance: Importance
}

export interface PromptConstraintCoverage {
  schemaVersion: typeof PROMPT_CONSTRAINT_COVERAGE_SCHEMA_VERSION
  constraintId: string
  sectionIds: string[]
  parameterIds: string[]
  referenceMappingIds: string[]
  locked: boolean
}

export interface PromptConstraintExclusion {
  constraintId:string
  degradationId:string
  reasonCode:string
  sourceIds:string[]
}

export interface PromptIR {
  schemaVersion: typeof PROMPT_IR_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  compilationSignature: string
  constraintIRHash: string
  referencePlanHash: string
  pipelinePlanHash: string
  outputContractHash: string
  targetAdapter: VersionPin
  targetCapabilityProfile: VersionPin
  objective: string
  positiveDescription: string
  sections: PromptSection[]
  parameters: PromptParameter[]
  referenceMappings: PromptReferenceMapping[]
  forbidden: PromptProhibition[]
  output: OutputContract
  constraintCoverage: PromptConstraintCoverage[]
  excludedConstraints: PromptConstraintExclusion[]
  sourceIds: string[]
  constraintIds: string[]
  decisionIds: string[]
  assetIds: string[]
  deterministicSignature: string
}

export interface PromptCompilationInput {
  schemaVersion: typeof PROMPT_COMPILATION_INPUT_SCHEMA_VERSION
  caseId: string
  caseRevision: number
  context: CompilationContext
  contextHash: string
  constraintIR: ConstraintIR
  referencePlan: ReferencePlan
  pipelinePlan: PipelinePlan
  outputContract: OutputContract
  targetAdapter: VersionPin
  targetCapabilityProfile: VersionPin
  effectiveScenario: EffectiveScenario
  objective?: string
  positiveDescription?: string
}

export interface PromptTransformationProof {
  kind: 'deterministic_rephrase'|'whitespace_normalization'|'declared_suggestion'|'typed_parameter_move'
  sourceSectionHash?: string
  preservedConstraintIds: string[]
  explanation: string
}

export interface PromptRephraseTransformation {
  schemaVersion?: typeof PROMPT_TRANSFORMATION_SCHEMA_VERSION
  kind: 'rephrase'
  sectionId: string
  content?: string
  text?: string
  constraintIds?: string[]
  sourceIds?: string[]
  proof?: PromptTransformationProof
}

export interface PromptReorderTransformation {
  schemaVersion?: typeof PROMPT_TRANSFORMATION_SCHEMA_VERSION
  kind: 'reorder'
  sectionIds: string[]
  proof?: PromptTransformationProof
}

export interface PromptParameterMoveTransformation {
  schemaVersion?: typeof PROMPT_TRANSFORMATION_SCHEMA_VERSION
  kind: 'parameter_move'
  sectionId: string
  parameterId?: string
  parameterName: string
  value?: JsonValue
  proof?: PromptTransformationProof
}

export interface PromptSuggestionTransformation {
  schemaVersion?: typeof PROMPT_TRANSFORMATION_SCHEMA_VERSION
  kind: 'suggestion'|'add_suggestion'|'declared_suggestion'
  slotId: string
  content?: string
  text?: string
  provenance: Provenance
  constraintIds?: string[]
  sourceIds?: string[]
  proof?: PromptTransformationProof
}

export interface PromptFreeTextTransformation {
  schemaVersion?: typeof PROMPT_TRANSFORMATION_SCHEMA_VERSION
  kind: 'free_text'
  content: string
}

export type PromptTransformation = PromptRephraseTransformation|PromptReorderTransformation|PromptParameterMoveTransformation|PromptSuggestionTransformation|PromptFreeTextTransformation

export interface PromptCoverageClaim {
  constraintId: string
  transformationIndexes: number[]
  sectionIds: string[]
  parameterIds: string[]
  referenceMappingIds: string[]
}

export interface PromptCandidateIR {
  schemaVersion: typeof PROMPT_CANDIDATE_IR_SCHEMA_VERSION
  id: string
  candidateHash: string
  basePromptIRHash: string
  basePromptIRSignature?: string
  targetAdapter: VersionPin
  targetCapabilityProfile: VersionPin
  targetAdapterDigest: string
  targetProfileDigest: string
  sections: PromptSection[]
  parameters: PromptParameter[]
  referenceMappings: PromptReferenceMapping[]
  constraintCoverage: PromptConstraintCoverage[]
  excludedConstraints: PromptConstraintExclusion[]
  transformations: PromptTransformation[]
  optimizer: VersionPin
  mode: 'strict'|'balanced'|'creative'
  warnings: string[]
  candidateSections?: PromptSection[]
  requestParameters?: JsonObject
  coverageClaims?: PromptCoverageClaim[]
}

export interface PromptOptimizationInput {
  schemaVersion: typeof PROMPT_OPTIMIZATION_INPUT_SCHEMA_VERSION
  promptIR: PromptIR
  targetAdapter?: VersionPin
  targetCapabilityProfile?: VersionPin
  optimizer?: VersionPin
  mode?: 'strict'|'balanced'|'creative'
}

export interface PromptOptimizer {
  optimize(input: PromptOptimizationInput): PromptCandidateIR
}

export interface PromptGuardFinding {
  schemaVersion: typeof PROMPT_GUARD_FINDING_SCHEMA_VERSION
  id: string
  code: string
  severity: PromptGuardSeverity
  blocking: boolean
  constraintIds: string[]
  sourceIds: string[]
  sectionIds: string[]
  decisionIds: string[]
  assetIds: string[]
  explanation: string
}

export interface PromptGuardInput {
  schemaVersion: typeof PROMPT_GUARD_INPUT_SCHEMA_VERSION
  promptIR: PromptIR
  candidate: PromptCandidateIR
  constraintIR: ConstraintIR
  referencePlan: ReferencePlan
  pipelinePlan: PipelinePlan
  outputContract: OutputContract
  context: CompilationContext
  policy?: 'reject'|'fallback'
}

export interface PromptGuardResult {
  schemaVersion: typeof PROMPT_GUARD_RESULT_SCHEMA_VERSION
  status: PromptGuardStatus
  accepted: boolean
  candidateHash: string
  basePromptIRHash: string
  findings: PromptGuardFinding[]
  guardedCandidate?: PromptCandidateIR
  deterministicFallback: PromptIR
  resultHash: string
}

export interface ProviderRenderRequest {
  schemaVersion: typeof PROVIDER_RENDER_REQUEST_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  promptIRHash: string
  promptCandidateHash?: string
  guardResultHash?: string
  targetAdapter: VersionPin
  targetCapabilityProfile: VersionPin
  sections: PromptSection[]
  parameters: PromptParameter[]
  referenceMappings: PromptReferenceMapping[]
  output: OutputContract
  pipelinePlanHash: string
  requestHash: string
}

export interface ProviderRenderResult {
  schemaVersion: typeof PROVIDER_RENDER_RESULT_SCHEMA_VERSION
  status: 'ok'|'failed'|'submission_unknown'
  requestHash: string
  adapterId: string
  adapterVersion: VersionPin
  providerRequestId?: string
  outputArtifacts: ArtifactHandle[]
  metadata: JsonObject
  failureCode?: string
  resultHash: string
}

export interface ProviderRenderer {
  render(request: ProviderRenderRequest): ProviderRenderResult
}

export interface ProviderAdapter extends ProviderRenderer {
  id: string
  version: VersionPin
  digest: string
  profileDigest?: string
  offline?: boolean
}

export type ExecutionRunState = 'queued'|'running'|'validating'|'needs_review'|'submission_unknown'|'reconciling'|'completed'|'failed'|'cancel_requested'|'cancelled'
export type StepEventState = 'pending'|'authorized'|'submitted'|'acknowledged'|'succeeded'|'failed'|'cancel_requested'|'cancelled'|'skipped'|'cleanup_pending'|'cleaned'|'cleanup_failed'|'submission_unknown'|'reconciling'

export interface ExecutionRun {
  schemaVersion: typeof EXECUTION_RUN_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  constraintIRHash: string
  referencePlanHash: string
  pipelinePlanHash: string
  promptArtifactHash?: string
  executionAuthorizationId: string
  state: ExecutionRunState
  technicalOutcome: 'pending'|'succeeded'|'failed'|'unknown'|'cancelled'
  createdAt: string
  updatedAt: string
  currentStepId?: string
  eventCount: number
  stepIds: string[]
  outputArtifacts: ArtifactHandle[]
  cleanupStatus: 'pending'|'completed'|'cleanup_failed'
  humanAcceptanceId?: string
  parentRunId?: string
  liveRerunOf?: string
  runHash: string
}

export interface StepEvent {
  schemaVersion: typeof STEP_EVENT_SCHEMA_VERSION
  id: string
  runId: string
  sequence: number
  stepId: string
  state: StepEventState
  at: string
  contextHash: string
  pipelinePlanHash: string
  promptArtifactHash?: string
  authorizationId?: string
  inputHash?: string
  outputHashes: string[]
  adapterId: string
  adapterVersion: VersionPin
  profileDigest?: string
  providerRequestId?: string
  destination: string
  dataCategories: string[]
  budgetId?: string
  attempt: number
  retriesUsed: number
  cost?: number
  bytes?: number
  failureCode?: string
  safeReferences: string[]
  eventHash: string
}

export interface StepReceipt {
  schemaVersion: typeof STEP_RECEIPT_SCHEMA_VERSION
  id: string
  runId: string
  stepId: string
  state: StepEventState
  eventIds: string[]
  firstSequence: number
  lastSequence: number
  authorizationId?: string
  inputHash?: string
  outputHashes: string[]
  adapterId: string
  adapterVersion: VersionPin
  profileDigest?: string
  providerRequestId?: string
  destination: string
  dataCategories: string[]
  budgetId?: string
  maximumCalls: number
  maximumRetries: number
  timeoutMs: number
  attempts: number
  retriesUsed: number
  actualCost?: number
  actualBytes?: number
  failureCode?: string
  cleanupStatus: 'pending'|'cleaned'|'cleanup_failed'|'not_required'
  receiptHash: string
}

export interface RemoteCallRun {
  schemaVersion: typeof REMOTE_CALL_RUN_SCHEMA_VERSION
  id: string
  runId: string
  stepId: string
  authorizationId: string
  inputHash: string
  state: ExecutionRunState|StepEventState
  provider: string
  adapterId: string
  profileDigest?: string
  destination: string
  budgetId: string
  maximumCalls: number
  maximumRetries: number
  timeoutMs: number
  receiptId?: string
  providerRequestId?: string
  runHash: string
}

export interface EvaluationFinding {
  id: string
  code: string
  status: 'pass'|'fail'|'needs_review'|'unknown'
  severity: 'info'|'warning'|'error'
  explanation: string
  sourceIds: string[]
  artifactIds: string[]
}

export interface Evaluation {
  schemaVersion: typeof EVALUATION_SCHEMA_VERSION
  id: string
  runId: string
  technicalStatus: 'pending'|'passed'|'failed'|'needs_review'
  findings: EvaluationFinding[]
  artifactIds: string[]
  evaluationHash: string
}

export interface EvaluationReport {
  schemaVersion: 'voce.evaluation-report/v1alpha1'
  id: string
  runId: string
  technicalOutcome: 'pending'|'succeeded'|'failed'|'unknown'|'cancelled'
  technicalStatus: 'pending'|'passed'|'failed'|'needs_review'
  structural?: StructuralValidationReport
  semanticProposal?: SemanticReviewReport
  humanAcceptance?: HumanAcceptanceDecision
  cleanup: EvaluationCleanupStatus
  replay: EvaluationReplayStatus
  artifactIds: string[]
  sourceHashes: Record<string, string>
  status: 'complete'|'partial'|'needs_review'|'failed'
  warnings: string[]
  reportHash: string
}

export interface HumanAcceptanceAnnotation {
  schemaVersion: 'voce.human-acceptance-annotation/v1alpha1'
  id: string
  targetId: string
  label?: string
  note: string
  artifactIds: string[]
  regionIds: string[]
  annotationHash: string
}

export interface HumanAcceptanceDecision {
  schemaVersion: 'voce.human-acceptance-decision/v1alpha1'
  id: string
  runId: string
  status: 'pending'|'accepted'|'declined'|'waived'
  reviewerId?: string
  decidedAt?: string
  reasonCode?: string
  annotations: HumanAcceptanceAnnotation[]
  artifactIds: string[]
  decisionHash: string
}

export interface EvaluationCleanupStatus {
  status: 'not_required'|'pending'|'completed'|'failed'
  receiptIds: string[]
  failureCodes: string[]
}

export interface EvaluationReplayStatus {
  mode: 'none'|'plan'|'artifact'|'live_rerun'
  status: 'not_requested'|'available'|'unavailable'|'reconciled'
  code?: 'REPLAY_AVAILABLE'|'ARTIFACT_UNAVAILABLE'|'REPLAY_RECONCILED'
  artifactIds: string[]
}

/* M6: provider transport, deterministic validation, semantic proposals, comparison, and reports. */
export const PROVIDER_TRANSPORT_SCHEMA_VERSION = 'voce.provider-transport/v1alpha1' as const
export const PROVIDER_REQUEST_ENVELOPE_SCHEMA_VERSION = 'voce.provider-request-envelope/v1alpha1' as const
export const PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION = 'voce.provider-response-envelope/v1alpha1' as const
export const PROVIDER_ERROR_SCHEMA_VERSION = 'voce.provider-error/v1alpha1' as const
export const PROVIDER_SUBMISSION_LOOKUP_SCHEMA_VERSION = 'voce.provider-submission-lookup/v1alpha1' as const
export const STRUCTURAL_VALIDATION_INPUT_SCHEMA_VERSION = 'voce.structural-validation-input/v1alpha1' as const
export const STRUCTURAL_VALIDATION_FINDING_SCHEMA_VERSION = 'voce.structural-validation-finding/v1alpha1' as const
export const STRUCTURAL_VALIDATION_REPORT_SCHEMA_VERSION = 'voce.structural-validation-report/v1alpha1' as const
export const SEMANTIC_REVIEW_REQUEST_SCHEMA_VERSION = 'voce.semantic-review-request/v1alpha1' as const
export const SEMANTIC_REVIEW_FINDING_SCHEMA_VERSION = 'voce.semantic-review-finding/v1alpha1' as const
export const SEMANTIC_REVIEW_REPORT_SCHEMA_VERSION = 'voce.semantic-review-report/v1alpha1' as const
export const HUMAN_ACCEPTANCE_ANNOTATION_SCHEMA_VERSION = 'voce.human-acceptance-annotation/v1alpha1' as const
export const HUMAN_ACCEPTANCE_DECISION_SCHEMA_VERSION = 'voce.human-acceptance-decision/v1alpha1' as const
export const EVALUATION_REPORT_SCHEMA_VERSION = 'voce.evaluation-report/v1alpha1' as const
export const COMPARISON_ENTRY_SCHEMA_VERSION = 'voce.comparison-entry/v1alpha1' as const
export const COMPARISON_REPORT_SCHEMA_VERSION = 'voce.comparison-report/v1alpha1' as const
export const STATIC_TRACE_REPORT_MODEL_SCHEMA_VERSION = 'voce.static-trace-report-model/v1alpha1' as const
export const REPORT_ARTIFACT_SCHEMA_VERSION = 'voce.report-artifact/v1alpha1' as const

export interface ProviderTransportContext {
  authorization: RemoteCallAuthorization
  credential?: { ref: string; value: string }
  timeoutMs?: number
}

export interface ProviderRequestEnvelope {
  schemaVersion: typeof PROVIDER_REQUEST_ENVELOPE_SCHEMA_VERSION
  id: string
  adapterId: string
  adapterDigest: string
  profileId: string
  profileDigest: string
  modelId?: string
  modelVersion?: string
  stepId: string
  destination: string
  region?: string
  purpose: RemoteCallPurpose
  inputHash: string
  inputArtifactHashes: string[]
  dataCategories: string[]
  maximumCalls: number
  maximumRetries: number
  timeoutMs: number
  maximumBytes?: number
  maximumCost?: number
  idempotencyKey: string
  payload: JsonObject
  requestHash: string
}

export interface ProviderResponseEnvelope {
  schemaVersion: typeof PROVIDER_RESPONSE_ENVELOPE_SCHEMA_VERSION
  requestHash: string
  status: 'succeeded'|'failed'|'submission_unknown'|'processing'
  providerRequestId?: string
  body?: JsonValue
  outputArtifactIds: string[]
  error?: ProviderError
  responseHash: string
}

export interface ProviderError {
  schemaVersion: typeof PROVIDER_ERROR_SCHEMA_VERSION
  code: string
  message: string
  retryable: boolean
  submissionUnknown: boolean
  safeDetails?: JsonObject
  errorHash: string
}

export interface ProviderSubmissionLookup {
  schemaVersion: typeof PROVIDER_SUBMISSION_LOOKUP_SCHEMA_VERSION
  requestId: string
  adapterId: string
  adapterDigest: string
  profileId: string
  profileDigest: string
  modelId?: string
  modelVersion?: string
  destination: string
  region?: string
  stepId: string
  purpose: RemoteCallPurpose
  providerRequestId?: string
  requestHash: string
  idempotencyKey: string
  inputHash: string
  inputArtifactHashes: string[]
  dataCategories: string[]
  maximumCalls: number
  maximumRetries: number
  timeoutMs: number
  maximumBytes?: number
  maximumCost?: number
  lookupHash: string
}

export interface ProviderTransport {
  readonly id: string
  readonly mode: 'offline'|'network'
  send(request: ProviderRequestEnvelope, context: ProviderTransportContext): Promise<ProviderResponseEnvelope>
  lookup(request: ProviderSubmissionLookup, context: ProviderTransportContext): Promise<ProviderResponseEnvelope>
}

export interface AssetSinkPutInput {
  bytes: Uint8Array
  mediaType: string
  role: string
  sourceHash?: string
}

export interface AssetSinkRemoteInput {
  url: string
  mediaType?: string
  role: string
  sourceHash?: string
}

export interface AssetSink {
  put(input: AssetSinkPutInput): Promise<ArtifactHandle>
  putRemote?(input: AssetSinkRemoteInput): Promise<ArtifactHandle|undefined>
  resolve?(handle: ArtifactHandle): Promise<Uint8Array|undefined>
}

export type ArtifactStore = AssetSink

export interface StructuralValidationArtifactInput {
  artifact: ArtifactHandle
  bytes?: Uint8Array
}

export interface StructuralValidationInput {
  schemaVersion: typeof STRUCTURAL_VALIDATION_INPUT_SCHEMA_VERSION
  id: string
  artifacts: StructuralValidationArtifactInput[]
  outputContract: OutputContract
  expectedCardinality?: { min: number; max: number }
  maxBytes?: number
}

export type StructuralFindingSeverity = 'info'|'warning'|'error'|'critical'
export type StructuralFindingStatus = 'pass'|'fail'|'unknown'

export interface StructuralValidationFinding {
  schemaVersion: typeof STRUCTURAL_VALIDATION_FINDING_SCHEMA_VERSION
  id: string
  code: string
  status: StructuralFindingStatus
  severity: StructuralFindingSeverity
  artifactId?: string
  expected?: JsonValue
  actual?: JsonValue
  evidenceSummary: string
  evidenceHash: string
}

export interface StructuralValidationReport {
  schemaVersion: typeof STRUCTURAL_VALIDATION_REPORT_SCHEMA_VERSION
  id: string
  inputHash: string
  status: 'passed'|'failed'|'needs_review'
  findings: StructuralValidationFinding[]
  artifactIds: string[]
  reportHash: string
}

export interface SemanticReviewCriterion {
  id: string
  kind: string
  targetPath?: string
  importance: Importance
  prompt?: string
}

export interface SemanticReviewRequest {
  schemaVersion: typeof SEMANTIC_REVIEW_REQUEST_SCHEMA_VERSION
  id: string
  caseId: string
  caseRevision: number
  contextHash: string
  inputHash: string
  outputArtifacts: ArtifactHandle[]
  criteria: SemanticReviewCriterion[]
  model: VersionPin
  adapter: VersionPin
  profile: VersionPin
  authorizationId: string
  destination: string
  region?: string
  allowedEvidenceRegionIds?: string[]
  dataCategories: string[]
  budget: Budget
  requestHash: string
}

export type SemanticFindingStatus = 'pass'|'fail'|'uncertain'|'not_applicable'

export interface SemanticReviewFinding {
  schemaVersion: typeof SEMANTIC_REVIEW_FINDING_SCHEMA_VERSION
  id: string
  criterionId: string
  code: string
  status: SemanticFindingStatus
  confidence?: number
  explanation: string
  evidenceArtifactIds: string[]
  evidenceRegionIds: string[]
  warnings: string[]
  proposal: true
  findingHash: string
}

export interface SemanticReviewReport {
  schemaVersion: typeof SEMANTIC_REVIEW_REPORT_SCHEMA_VERSION
  id: string
  requestHash: string
  status: 'proposal'|'failed'|'submission_unknown'
  model: VersionPin
  adapter: VersionPin
  profile: VersionPin
  findings: SemanticReviewFinding[]
  warnings: string[]
  receiptIds: string[]
  reportHash: string
}

export interface SemanticReviewer {
  id: string
  version: VersionPin
  review(request: SemanticReviewRequest, authorization: RemoteCallAuthorization): Promise<SemanticReviewReport>
}

export interface ComparisonSnapshot {
  ontology?: JsonValue
  bindings?: JsonValue
  constraintIR?: JsonValue
  referencePlan?: JsonValue
  promptIR?: JsonValue
  promptCandidate?: JsonValue
  pipelinePlan?: JsonValue
  receipts?: JsonValue
  evaluation?: JsonValue
}

export type ComparisonCategory = keyof ComparisonSnapshot
export type ComparisonChangeKind = 'added'|'removed'|'changed'|'unchanged'

export interface ComparisonEntry {
  schemaVersion: typeof COMPARISON_ENTRY_SCHEMA_VERSION
  id: string
  category: ComparisonCategory
  key: string
  kind: ComparisonChangeKind
  beforeHash?: string
  afterHash?: string
  before?: JsonValue
  after?: JsonValue
  changedFields: string[]
  reasonCode: string
}

export interface ComparisonReport {
  schemaVersion: typeof COMPARISON_REPORT_SCHEMA_VERSION
  id: string
  caseId: string
  beforeRevision: number
  afterRevision: number
  ignoredFields: string[]
  entries: ComparisonEntry[]
  summary: { added: number; removed: number; changed: number; unchanged: number }
  reportHash: string
}

export interface StaticTraceStep {
  id: string
  type: string
  state: string
  at?: string
  adapterId?: string
  adapterVersion?: VersionPin
  profileDigest?: string
  destination?: string
  budgetId?: string
  inputHash?: string
  outputHashes: string[]
  receiptId?: string
  failureCode?: string
}

export interface StaticTraceReportModel {
  schemaVersion: typeof STATIC_TRACE_REPORT_MODEL_SCHEMA_VERSION
  caseId: string
  revision: number
  contextHash: string
  constraintHash?: string
  referencePlanHash?: string
  pipelinePlanHash?: string
  promptHash?: string
  steps: StaticTraceStep[]
  budgets: Budget[]
  destinations: string[]
  receipts: StepReceipt[]
  cleanup: CleanupReceipt[]
  reconciliation: RemoteCallRun[]
  structural?: StructuralValidationReport
  semanticProposal?: SemanticReviewReport
  humanAcceptance?: HumanAcceptanceDecision
  artifacts: ArtifactHandle[]
  comparison?: ComparisonReport
  warnings: string[]
  modelHash: string
}

export interface ReportArtifact {
  schemaVersion: typeof REPORT_ARTIFACT_SCHEMA_VERSION
  id: string
  mediaType: 'text/html'
  content: string
  contentHash: string
  modelHash: string
}

export interface HumanAcceptance {
  schemaVersion: typeof HUMAN_ACCEPTANCE_SCHEMA_VERSION
  id: string
  runId: string
  status: 'pending'|'accepted'|'declined'|'waived'
  reviewerId?: string
  decidedAt?: string
  reasonCode?: string
  artifactIds: string[]
  acceptanceHash: string
}

export interface CleanupReceipt {
  schemaVersion: typeof CLEANUP_RECEIPT_SCHEMA_VERSION
  id: string
  runId: string
  cleanupId: string
  status: 'pending'|'succeeded'|'cleanup_failed'
  attempts: number
  maximumRetries: number
  artifactRoles: string[]
  destination: string
  dataCategories: string[]
  eventIds: string[]
  failureCode?: string
  receiptHash: string
}

export interface CompensationReceipt {
  schemaVersion: typeof COMPENSATION_RECEIPT_SCHEMA_VERSION
  id: string
  runId: string
  compensationId: string
  trigger: 'failure'|'cancel'|'submission_unknown'|'worker_restart'
  cleanupId: string
  status: 'pending'|'succeeded'|'cleanup_failed'
  attempts: number
  maximumRetries: number
  eventIds: string[]
  failureCode?: string
  receiptHash: string
}

export interface ExecutionTraceProjection {
  schemaVersion: typeof EXECUTION_TRACE_SCHEMA_VERSION
  runId: string
  state: ExecutionRunState
  executionAuthorizationHash: string
  pipelinePlanHash: string
  promptArtifactHash?: string
  events: StepEvent[]
  receipts: StepReceipt[]
  remoteCallRuns: RemoteCallRun[]
  cleanupReceipts: CleanupReceipt[]
  compensationReceipts: CompensationReceipt[]
  evaluation?: Evaluation
  humanAcceptance?: HumanAcceptance
  traceHash: string
}

export type ExecutionTrace = ExecutionTraceProjection

export interface OfflineExecutionOptions {
  now?: string
  failStepIds?: string[]
  unknownStepIds?: string[]
  retryableFailureStepIds?: string[]
  cancelBeforeStepId?: string
  workerRestartAfterStepId?: string
  cleanupFailureIds?: string[]
  compensationFailureIds?: string[]
  maximumCleanupRetries?: number
}

export interface OfflineExecutionInput {
  schemaVersion: typeof OFFLINE_EXECUTION_INPUT_SCHEMA_VERSION
  context: CompilationContext
  contextHash: string
  constraintIR: ConstraintIR
  referencePlan: ReferencePlan
  pipelinePlan: PipelinePlan
  outputContract: OutputContract
  promptArtifact: PromptIR|PromptCandidateIR
  promptGuardResult?: PromptGuardResult
  executionAuthorization: ExecutionAuthorization
  remoteCallAuthorizations: RemoteCallAuthorization[]
  options?: OfflineExecutionOptions
}

export interface ArtifactReplayResult {
  schemaVersion: typeof ARTIFACT_REPLAY_RESULT_SCHEMA_VERSION
  status: 'available'|'unavailable'
  code: 'REPLAY_AVAILABLE'|'ARTIFACT_UNAVAILABLE'
  artifactIds: string[]
  missingArtifactIds: string[]
  traceHash?: string
  resultHash: string
}

/* M7: redacted, content-addressed local bundle contracts. */
export const BUNDLE_MANIFEST_SCHEMA_VERSION = 'voce.bundle-manifest/v1alpha1' as const
export type BundleKind = 'compiled'|'run'|'evaluation'|'trace'|'release-candidate'
export interface BundleFileEntry {
  path: string
  sha256: string
  byteLength: number
}
export interface BundlePins {
  tool: VersionPin
  core: VersionPin
  contracts: VersionPin
  scenario: VersionPin
  profile?: VersionPin
}
export interface BundleManifest {
  schemaVersion: typeof BUNDLE_MANIFEST_SCHEMA_VERSION
  kind: BundleKind
  case: { id: string; revision: number }
  pins: BundlePins
  files: BundleFileEntry[]
  semanticHash: string
  createdBy: string
}
