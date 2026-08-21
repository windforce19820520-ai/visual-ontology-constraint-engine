import type {
  BundleManifest,
  DeclarativeRulePackContribution,
  OntologyPathDefinition,
  PromptConstraintExclusion,
  ProviderAdapter,
  ProviderCapabilityProfile,
  ScenarioPack,
  ScenarioPackManifest,
  ScenarioPackRegistry,
} from '@voce-engine/contracts'
import { BUNDLE_MANIFEST_SCHEMA_VERSION } from '@voce-engine/contracts'
import type { VisualCompositionCatalog, VisualCompositionPreset } from '@voce-engine/core'
import {
  MOCK_IMAGE_PROFILE,
  MockProviderAdapter,
  VISUAL_COMPOSITION_CATALOG,
  VISUAL_COMPOSITION_PRESETS,
  compileConstraints,
  compilePromptIR,
  createMockRuntimeForPlan,
  createScenarioPackRegistry,
  expandVisualCompositionPreset,
  replayArtifacts,
} from '@voce-engine/core'
import { fixtureM4ConstraintInput, fixtureM5ExecutionInput, fixtureM6Artifact } from '@voce-engine/testkit'
import { CLI_VERSION, runCli } from '@voce-engine/cli'
import { PLAYGROUND_VERSION, compilePlayground, createPlaygroundServer } from '@voce-engine/playground'

declare const pack: ScenarioPack
declare const manifest: ScenarioPackManifest
declare const contribution: DeclarativeRulePackContribution
declare const pathDefinition: OntologyPathDefinition
declare const exclusion: PromptConstraintExclusion
declare const profile: ProviderCapabilityProfile
declare const adapter: ProviderAdapter
declare const bundle: BundleManifest

const registry: ScenarioPackRegistry = createScenarioPackRegistry()
const mockProfile: ProviderCapabilityProfile = MOCK_IMAGE_PROFILE
const mockAdapter: ProviderAdapter = new MockProviderAdapter()
const compositionCatalog: VisualCompositionCatalog = VISUAL_COMPOSITION_CATALOG
const compositionPreset: VisualCompositionPreset = VISUAL_COMPOSITION_PRESETS[0]
const compositionChanges = expandVisualCompositionPreset('rule-of-thirds')
const bundleSchema: typeof BUNDLE_MANIFEST_SCHEMA_VERSION = 'voce.bundle-manifest/v1alpha1'
void [pack, manifest, contribution, pathDefinition, exclusion, profile, adapter, bundle, registry, mockProfile, mockAdapter, compositionCatalog, compositionPreset, compositionChanges, bundleSchema, compileConstraints, compilePromptIR, createMockRuntimeForPlan, replayArtifacts, fixtureM4ConstraintInput, fixtureM5ExecutionInput, fixtureM6Artifact, CLI_VERSION, runCli, PLAYGROUND_VERSION, compilePlayground, createPlaygroundServer]
