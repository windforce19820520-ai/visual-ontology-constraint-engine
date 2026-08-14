import type {
  BundleManifest,
  DeclarativeRulePackContribution,
  ProviderAdapter,
  ProviderCapabilityProfile,
  ScenarioPack,
  ScenarioPackManifest,
  ScenarioPackRegistry,
} from '@voce/contracts'
import { BUNDLE_MANIFEST_SCHEMA_VERSION } from '@voce/contracts'
import {
  MOCK_NATIVE_TRANSPARENT_PROFILE,
  MockProviderAdapter,
  createMockRuntimeForPlan,
  createScenarioPackRegistry,
  replayArtifacts,
} from '@voce/core'
import { fixtureM4ConstraintInput, fixtureM5ExecutionInput, fixtureM6Artifact } from '@voce/testkit'
import { CLI_VERSION, runCli } from '@voce/cli'

declare const pack: ScenarioPack
declare const manifest: ScenarioPackManifest
declare const contribution: DeclarativeRulePackContribution
declare const profile: ProviderCapabilityProfile
declare const adapter: ProviderAdapter
declare const bundle: BundleManifest

const registry: ScenarioPackRegistry = createScenarioPackRegistry()
const mockProfile: ProviderCapabilityProfile = MOCK_NATIVE_TRANSPARENT_PROFILE
const mockAdapter: ProviderAdapter = new MockProviderAdapter()
const bundleSchema: typeof BUNDLE_MANIFEST_SCHEMA_VERSION = 'voce.bundle-manifest/v1alpha1'
void [pack, manifest, contribution, profile, adapter, bundle, registry, mockProfile, mockAdapter, bundleSchema, createMockRuntimeForPlan, replayArtifacts, fixtureM4ConstraintInput, fixtureM5ExecutionInput, fixtureM6Artifact, CLI_VERSION, runCli]
