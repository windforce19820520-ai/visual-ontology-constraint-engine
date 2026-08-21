import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createScenarioPackRegistry, canonicalize, hashWithoutSelf, sha256, validateManifest } from './index.js'
import type { HostOverride, HostPolicyOverlay, JsonObject, ScenarioPack, ScenarioPackManifest } from '@voce-engine/contracts'

const categories = ['ontologyVocabulary', 'rulePacks', 'interpretationScopes', 'promptSections', 'reviewTemplates', 'defaults', 'overridePoints'] as const
const emptyIndex = { ontologyVocabulary: [], rulePacks: [], interpretationScopes: [], promptSections: [], reviewTemplates: [], defaults: [], overridePoints: [] }

function manifest(packId: string, kind: 'root' | 'extension' = 'root', extra: Partial<ScenarioPackManifest> = {}): ScenarioPackManifest {
  return {
    schemaVersion: 'voce.scenario-pack/v1alpha1', packId, version: '1.0.0', kind,
    supportedInteractionModes: ['text_only'], inputExpectations: [], outputExpectations: [],
    ...(kind === 'extension' ? { extensionOf: { rootPackId: 'first.party.root', rootVersionRange: '1.0.0' } } : {}),
    license: 'Apache-2.0', provenance: { publisher: packId }, coreRange: '*', contractRanges: {},
    ui: { defaultLocale: 'en', locales: { en: { displayName: packId, description: 'fixture', messages: {} } }, disclosures: [], accessibility: { textAlternativesRequired: false, keyboardOperableReferenceUI: true, doesNotRelyOnColorAlone: true } },
    dependencies: [], conflicts: [], composition: { before: [], after: [] }, contributions: emptyIndex,
    fixtures: [], migrations: [], capabilityRequirements: [],
    declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: false, fixturesRequireNetwork: false, fixturesRequireRealProvider: false, collectsTelemetry: false, mayHandlePersonImages: false, rightsDisclosureRequired: false },
    permissions: { network: false, remoteCalls: false, secrets: false, filesystemWrite: false, mutateConfirmedFacts: false, authorizeCalls: false, overrideHostPolicy: false, selectProvider: false, changeBudgets: false },
    distributionInventory: [], ...extra,
  }
}

function contribution(id: string, extra: JsonObject = {}): JsonObject {
  const payload = { id, schemaVersion: 'voce.fixture/v1alpha1', ...extra }
  return { ...payload, contentDigest: sha256(payload) }
}

function makePack(manifestValue: ScenarioPackManifest, values: Partial<Record<typeof categories[number], JsonObject[]>> = {}): ScenarioPack {
  const contributions = { ...emptyIndex }
  for (const category of categories) {
    const value = values[category] ?? []
    contributions[category] = value.map((item) => ({ id: String(item.id), schemaVersion: String(item.schemaVersion), contentDigest: String(item.contentDigest) })) as never
  }
  return {
    manifest: { ...manifestValue, contributions },
    contributions: {
      ontologyVocabulary: (values.ontologyVocabulary ?? []) as never,
      rulePacks: (values.rulePacks ?? []) as never,
      interpretationScopes: (values.interpretationScopes ?? []) as never,
      promptSections: (values.promptSections ?? []) as never,
      reviewTemplates: (values.reviewTemplates ?? []) as never,
      defaults: (values.defaults ?? []) as never,
      overridePoints: (values.overridePoints ?? []) as never,
      fixtureSuites: [],
    },
    migrations: [],
  }
}

function source(definition: ScenarioPack) { return { kind: 'memory' as const, definition, logicalFiles: [] } }
function selection(root = 'first.party.root', extensions: Array<{ packId: string; versionRange: string }> = [], configuration: JsonObject = {}) { return { root: { packId: root, versionRange: '1.0.0', configuration }, extensions } }
function override(id: string, operation: HostOverride['operation'], reasonCode = 'fixture'): HostOverride {
  const payload = { id, operation, reasonCode }
  return { ...payload, contentHash: sha256(payload) }
}
function overlay(overrides: HostOverride[], id = 'overlay'): HostPolicyOverlay {
  const value = { id, caseId: 'case-1', caseRevision: 1, overrides: [...overrides].sort((left, right) => left.contentHash < right.contentHash ? -1 : left.contentHash > right.contentHash ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0), authority: 'host_policy' as const, reasonCode: 'fixture' }
  return { ...value, overlayHash: sha256(value as never) }
}

function catalogHash(catalog: { contractVersion: string; resolverVersion: string; registryRevision: number; entries: unknown[]; availabilityPolicies: unknown[] }): string {
  const { catalogHash: _ignored, ...base } = catalog as typeof catalog & { catalogHash?: string }
  return sha256(base as never)
}

test('M1 canonicalization and manifest safety remain available', () => {
  assert.equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 }))
  assert.equal(hashWithoutSelf({ value: 1, hash: 'old' }, 'hash'), hashWithoutSelf({ value: 1, hash: 'new' }, 'hash'))
  validateManifest({ schemaVersion: 'voce.scenario-pack/v1alpha1', packId: 'fixture.root', version: '0.1.0', kind: 'root', declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: false, fixturesRequireNetwork: false, fixturesRequireRealProvider: false }, permissions: { network: false, remoteCalls: false, secrets: false, filesystemWrite: false, mutateConfirmedFacts: false, authorizeCalls: false, overrideHostPolicy: false, selectProvider: false, changeBudgets: false }, distributionInventory: [] })
  assert.throws(() => validateManifest({ schemaVersion: 'voce.scenario-pack/v1alpha1', packId: 'x', version: '1.0.0', kind: 'root', declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: true, fixturesRequireNetwork: false, fixturesRequireRealProvider: false }, permissions: {}, distributionInventory: [] }), /PACK_DECLARATION_INVALID/)
})

test('first-party and third-party fixtures use one Registry/Resolver entrypoint', () => {
  const registry = createScenarioPackRegistry()
  registry.register(source(makePack(manifest('first.party.root'))))
  registry.register(source(makePack(manifest('community.root'))))
  const first = registry.resolve(selection())
  const third = registry.resolve(selection('community.root'))
  assert.equal(first.status, 'resolved'); assert.equal(third.status, 'resolved')
  assert.equal(first.effectiveScenario.rootPackId, 'first.party.root'); assert.equal(third.effectiveScenario.rootPackId, 'community.root')
})

test('dependency and before/after edges produce stable order and hashes', () => {
  const registry = createScenarioPackRegistry()
  const root = makePack(manifest('first.party.root'))
  const a = makePack({ ...manifest('ext.a', 'extension'), composition: { before: ['ext.b'], after: [] } })
  const b = makePack({ ...manifest('ext.b', 'extension'), dependencies: [{ packId: 'ext.a', versionRange: '1.0.0', role: 'extension', reasonCode: 'fixture' }] })
  registry.register(source(b)); registry.register(source(root)); registry.register(source(a))
  const one = registry.resolve(selection('first.party.root', [{ packId: 'ext.b', versionRange: '1.0.0' }]))
  const two = registry.resolve(selection('first.party.root', [{ packId: 'ext.b', versionRange: '1.0.0' }]))
  assert.equal(one.status, 'resolved'); assert.equal(two.status, 'resolved')
  assert.deepEqual(one.lock.compositionOrder, ['first.party.root@1.0.0', 'ext.a@1.0.0', 'ext.b@1.0.0'])
  assert.deepEqual(one.lock, two.lock); assert.deepEqual(one.effectiveScenario, two.effectiveScenario); assert.deepEqual(one.report, two.report)
})

test('catalog insertion order does not change semantic result', () => {
  const root = makePack(manifest('first.party.root')); const extension = makePack(manifest('ext.b', 'extension'))
  const first = createScenarioPackRegistry(); first.register(source(root)); first.register(source(extension))
  const second = createScenarioPackRegistry(); second.register(source(extension)); second.register(source(root))
  const firstResult = first.resolve(selection('first.party.root', [{ packId: 'ext.b', versionRange: '1.0.0' }]))
  const secondResult = second.resolve(selection('first.party.root', [{ packId: 'ext.b', versionRange: '1.0.0' }]))
  assert.equal(firstResult.status, 'resolved'); assert.equal(secondResult.status, 'resolved')
  assert.equal(first.snapshot().catalogHash, second.snapshot().catalogHash); assert.equal(firstResult.lock.lockHash, secondResult.lock.lockHash)
})

test('missing dependency and explicit SemVer conflict block', () => {
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root'))))
  const missing = makePack({ ...manifest('ext.missing', 'extension'), dependencies: [{ packId: 'absent', versionRange: '1.0.0', role: 'extension', reasonCode: 'fixture' }] })
  registry.register(source(missing)); let result = registry.resolve(selection('first.party.root', [{ packId: 'ext.missing', versionRange: '1.0.0' }]))
  assert.equal(result.status, 'blocked'); assert.ok(result.report.conflicts.some((item) => item.code === 'PACK_DEPENDENCY_MISSING'))
  const conflicted = makePack({ ...manifest('ext.conflict', 'extension'), conflicts: [{ packId: 'ext.other', versionRange: '^1.0.0', reasonCode: 'fixture' }] })
  const other = makePack(manifest('ext.other', 'extension')); registry.register(source(conflicted)); registry.register(source(other))
  result = registry.resolve(selection('first.party.root', [{ packId: 'ext.conflict', versionRange: '1.0.0' }, { packId: 'ext.other', versionRange: '1.0.0' }]))
  assert.equal(result.status, 'blocked'); assert.ok(result.report.conflicts.some((item) => item.code === 'PACK_CONFLICT'))
})

test('dependency cycle is reported separately from composition cycle', () => {
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root'))))
  const a = makePack({ ...manifest('dep.a', 'extension'), dependencies: [{ packId: 'dep.b', versionRange: '1.0.0', role: 'extension', reasonCode: 'fixture' }] })
  const b = makePack({ ...manifest('dep.b', 'extension'), dependencies: [{ packId: 'dep.a', versionRange: '1.0.0', role: 'extension', reasonCode: 'fixture' }] })
  registry.register(source(a)); registry.register(source(b)); let result = registry.resolve(selection('first.party.root', [{ packId: 'dep.a', versionRange: '1.0.0' }]))
  assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_DEPENDENCY_UNSATISFIABLE')
  const composition = createScenarioPackRegistry(); composition.register(source(makePack(manifest('first.party.root')))); composition.register(source(makePack({ ...manifest('comp.a', 'extension'), composition: { before: ['comp.b'], after: [] } }))); composition.register(source(makePack({ ...manifest('comp.b', 'extension'), composition: { before: ['comp.a'], after: [] } })))
  result = composition.resolve(selection('first.party.root', [{ packId: 'comp.a', versionRange: '1.0.0' }, { packId: 'comp.b', versionRange: '1.0.0' }]))
  assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_ORDER_CYCLE')
})

test('valid overrides change configuration, defaults, and activation', () => {
  const configPoint = contribution('config.theme', { targetKind: 'configuration', targetPath: '/theme', allowDisable: false, maximumImportance: 'preferred' })
  const defaultPoint = contribution('default.theme.point', { targetKind: 'declared_default', targetPath: 'default.theme', allowDisable: false, maximumImportance: 'preferred' })
  const activationPoint = contribution('prompt.one.point', { targetKind: 'contribution_activation', targetPath: 'prompt.one', allowDisable: true, maximumImportance: 'preferred' })
  const defaults = contribution('default.theme', { targetPath: 'default.theme', value: 'light' })
  const prompt = contribution('prompt.one', { text: 'fixture prompt' })
  const root = makePack(manifest('first.party.root'), { defaults: [defaults], promptSections: [prompt], overridePoints: [configPoint, defaultPoint, activationPoint] })
  const registry = createScenarioPackRegistry(); registry.register(source(root))
  const overrides = [override('config-override', { kind: 'set_configuration', packId: 'first.party.root', overridePointId: 'config.theme', value: 'dark' }), override('default-override', { kind: 'set_declared_default', packId: 'first.party.root', overridePointId: 'default.theme.point', value: 'dark' }), override('activation-override', { kind: 'set_contribution_activation', packId: 'first.party.root', overridePointId: 'prompt.one.point', active: false })]
  const result = registry.resolve({ ...selection('first.party.root', [], { theme: 'light' }), hostPolicyOverlay: overlay(overrides) })
  assert.equal(result.status, 'resolved'); assert.equal(result.effectiveScenario.configurations['first.party.root'].theme, 'dark'); assert.equal(result.effectiveScenario.defaults[0].value, 'dark'); assert.equal(result.effectiveScenario.promptSections.length, 0); assert.equal(result.lock.entries[0].configurationHash, sha256({ theme: 'dark' })); assert.equal(result.effectiveScenario.appliedOverrides.length, 3)
})

test('overlay and override hash tampering blocks with PACK_OVERRIDE_INVALID', () => {
  const point = contribution('theme', { targetKind: 'configuration', targetPath: '/theme', allowDisable: false, maximumImportance: 'preferred' })
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root'), { overridePoints: [point] })))
  const valid = overlay([override('o1', { kind: 'set_configuration', packId: 'first.party.root', overridePointId: 'theme', value: 'dark' })])
  let tampered = { ...valid, overlayHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  let result = registry.resolve({ ...selection(), hostPolicyOverlay: tampered }); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_OVERRIDE_INVALID')
  tampered = { ...valid, overrides: [{ ...valid.overrides[0], contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] }
  result = registry.resolve({ ...selection(), hostPolicyOverlay: tampered }); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_OVERRIDE_INVALID')
})

test('override order is stable and conflicting effective targets do not last-win', () => {
  const point = contribution('theme', { targetKind: 'configuration', targetPath: '/theme', allowDisable: false, maximumImportance: 'preferred' })
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root'), { overridePoints: [point] })))
  const first = override('o1', { kind: 'set_configuration', packId: 'first.party.root', overridePointId: 'theme', value: 'dark' })
  const second = override('o2', { kind: 'set_configuration', packId: 'first.party.root', overridePointId: 'theme', value: 'light' })
  const left = registry.resolve({ ...selection(), hostPolicyOverlay: overlay([first, second]) }); const right = registry.resolve({ ...selection(), hostPolicyOverlay: overlay([second, first]) })
  assert.equal(left.status, 'blocked'); assert.equal(right.status, 'blocked'); assert.equal(left.report.reportHash, right.report.reportHash)
  const duplicate = registry.resolve({ ...selection(), hostPolicyOverlay: overlay([first, first]) }); assert.equal(duplicate.status, 'resolved'); assert.equal(duplicate.effectiveScenario.appliedOverrides.length, 1)
})

test('forged catalog hash, descriptor digest, and external entry are blocked', () => {
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root')))); const snapshot = registry.snapshot()
  let result = registry.resolve(selection(), { ...snapshot, catalogHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_DIGEST_MISMATCH')
  const forgedEntry = { ...snapshot.entries[0], packageDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }; const forged = { ...snapshot, entries: [forgedEntry] }; result = registry.resolve(selection(), { ...forged, catalogHash: catalogHash(forged) }); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_DIGEST_MISMATCH')
  const external = createScenarioPackRegistry(); external.register(source(makePack(manifest('outside.root')))); const externalSnapshot = external.snapshot(); const combined = { ...snapshot, entries: [...snapshot.entries, ...externalSnapshot.entries] }; result = registry.resolve(selection(), { ...combined, catalogHash: catalogHash(combined) }); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_NOT_FOUND')
})

test('leading-zero SemVer and unequal duplicate contributions are rejected', () => {
  const registry = createScenarioPackRegistry(); assert.throws(() => registry.register(source(makePack({ ...manifest('bad.version'), version: '01.0.0' }))), /PACK_VERSION_UNSATISFIABLE/)
  const first = contribution('same', { value: 'first' }); const second = contribution('same', { value: 'second' }); const root = makePack(manifest('first.party.root'), { defaults: [first] }); const extension = makePack(manifest('ext.same', 'extension'), { defaults: [second] }); registry.register(source(root)); registry.register(source(extension)); const result = registry.resolve(selection('first.party.root', [{ packId: 'ext.same', versionRange: '1.0.0' }])); assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_RULE_CONFLICT')
})

test('ontology path definitions compose only when canonical content is identical', () => {
  const path = { path: 'camera.composition.placement', valueKind: 'enum', cardinality: 'one', allowedValues: ['center', 'left_third'] }
  const rootVocabulary = contribution('root.vocabulary', { paths: [path] })
  const identicalVocabulary = contribution('identical.vocabulary', { paths: [{ ...path }] })
  const conflictingVocabulary = contribution('conflicting.vocabulary', { paths: [{ ...path, allowedValues: ['banana'] }] })

  const identicalRegistry = createScenarioPackRegistry()
  identicalRegistry.register(source(makePack(manifest('first.party.root'), { ontologyVocabulary: [rootVocabulary] })))
  identicalRegistry.register(source(makePack(manifest('ext.identical', 'extension'), { ontologyVocabulary: [identicalVocabulary] })))
  assert.equal(identicalRegistry.resolve(selection('first.party.root', [{ packId: 'ext.identical', versionRange: '1.0.0' }])).status, 'resolved')

  const conflictingRegistry = createScenarioPackRegistry()
  conflictingRegistry.register(source(makePack(manifest('first.party.root'), { ontologyVocabulary: [rootVocabulary] })))
  conflictingRegistry.register(source(makePack(manifest('ext.conflicting', 'extension'), { ontologyVocabulary: [conflictingVocabulary] })))
  const result = conflictingRegistry.resolve(selection('first.party.root', [{ packId: 'ext.conflicting', versionRange: '1.0.0' }]))
  assert.equal(result.status, 'blocked')
  assert.equal(result.report.conflicts[0].code, 'PACK_RULE_CONFLICT')
})

test('Core has no scenario-name branches', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /virtual[-_ ]try[-_ ]on|cosplay|product[-_ ]shot/i)
})

test('Registry defensively copies registered packs and returned descriptors/snapshots', () => {
  const original = makePack(manifest('first.party.root'), { defaults: [contribution('default.one', { value: 'stable' })] })
  const registry = createScenarioPackRegistry()
  registry.register(source(original))
  const before = registry.snapshot()
  original.manifest.packId = 'changed.after.register'
  ;(original.contributions.defaults[0] as JsonObject).value = 'changed.after.register'
  const returned = registry.list()[0]
  returned.manifest.packId = 'changed.returned'
  returned.manifest.license = 'changed.returned'
  const snapshot = registry.snapshot()
  snapshot.entries[0].manifest.packId = 'changed.snapshot'
  snapshot.entries[0].packageDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const result = registry.resolve(selection())
  assert.equal(result.status, 'resolved')
  assert.equal(registry.snapshot().catalogHash, before.catalogHash)
  const repeated = registry.resolve(selection()); assert.equal(repeated.status, 'resolved'); if (repeated.status === 'resolved' && result.status === 'resolved') assert.equal(result.lock.lockHash, repeated.lock.lockHash)
})

test('resolve defensively copies nested contributions and configurations', () => {
  const root = makePack(manifest('first.party.root'), { defaults: [contribution('default.nested', { value: { nested: { stable: true } } })] })
  const registry = createScenarioPackRegistry(); registry.register(source(root))
  const first = registry.resolve(selection('first.party.root', [], { nested: { theme: 'stable' } }))
  assert.equal(first.status, 'resolved')
  if (first.status !== 'resolved') return
  const baselineHash = first.effectiveScenario.effectiveScenarioHash
  ;(first.effectiveScenario.defaults[0].value as JsonObject).nested = { stable: false }
  first.effectiveScenario.configurations['first.party.root'].nested = { theme: 'mutated' }
  const second = registry.resolve(selection('first.party.root', [], { nested: { theme: 'stable' } }))
  assert.equal(second.status, 'resolved')
  if (second.status !== 'resolved') return
  assert.equal(second.effectiveScenario.effectiveScenarioHash, baselineHash)
  assert.deepEqual(second.effectiveScenario.configurations['first.party.root'], { nested: { theme: 'stable' } })
  assert.deepEqual(second.effectiveScenario.defaults[0].value, { nested: { stable: true } })
})

test('Catalog entry manifest tampering is rejected even after recomputing catalogHash', () => {
  const registry = createScenarioPackRegistry()
  registry.register(source(makePack(manifest('first.party.root'))))
  const snapshot = registry.snapshot()
  const tampered = { ...snapshot, entries: [{ ...snapshot.entries[0], manifest: { ...snapshot.entries[0].manifest, license: 'tampered' } }] }
  const result = registry.resolve(selection(), { ...tampered, catalogHash: catalogHash(tampered) })
  assert.equal(result.status, 'blocked')
  assert.equal(result.report.conflicts[0].code, 'PACK_DIGEST_MISMATCH')
})

test('Every M2 contribution index entry has exactly one matching body', () => {
  const root = manifest('first.party.root')
  const body = contribution('one', { value: 'body' })
  const missing = makePack(root); missing.manifest.contributions.defaults = [{ id: String(body.id), schemaVersion: String(body.schemaVersion), contentDigest: String(body.contentDigest) }]
  const duplicate = makePack({ ...root, contributions: { ...emptyIndex, defaults: [{ id: String(body.id), schemaVersion: String(body.schemaVersion), contentDigest: String(body.contentDigest) }] } }, { defaults: [body, body] })
  const extra = makePack(root); extra.contributions.defaults = [body] as never
  assert.throws(() => createScenarioPackRegistry().register(source(missing)), /PACK_CONTRIBUTION_INVALID/)
  assert.throws(() => createScenarioPackRegistry().register(source(duplicate)), /PACK_CONTRIBUTION_INVALID/)
  assert.throws(() => createScenarioPackRegistry().register(source(extra)), /PACK_CONTRIBUTION_INVALID/)
})

test('Malformed runtime manifests fail with stable contract errors', () => {
  const registry = createScenarioPackRegistry()
  const malformed = { schemaVersion: 'voce.scenario-pack/v1alpha1', packId: 'bad', version: '1.0.0', kind: 'root', declarations: { containsExecutableScenarioCode: false, distributionLifecycleScripts: false, containsExecutableFiles: false, fixturesRequireNetwork: false, fixturesRequireRealProvider: false }, permissions: { network: false, remoteCalls: false, secrets: false, filesystemWrite: false, mutateConfirmedFacts: false, authorizeCalls: false, overrideHostPolicy: false, selectProvider: false, changeBudgets: false }, distributionInventory: [], composition: {} }
  assert.throws(() => registry.register(source(malformed as never)), /PACK_MANIFEST_INVALID/)
  assert.throws(() => registry.register(source({ manifest: { ...malformed, dependencies: {} } } as never)), /PACK_MANIFEST_INVALID/)
})

test('declarative input policy and typed interpretation scopes validate as closed data contracts', () => {
  const inputPolicy = contribution('input-policy', {
    schemaVersion: 'voce.input-policy/v1alpha1',
    inputPolicy: {
      roleGroups: [{ id: 'clothing', operator: 'atLeastOne', roles: ['garment-top', 'garment-bottom'], minCount: 1, maxCount: 2 }],
      capabilities: { composition: false },
    },
  })
  const scope = contribution('garment-top', {
    schemaVersion: 'voce.interpretation-scope/v1alpha1',
    assetRole: 'garment-top', referenceOrder: 1, minCount: 0, maxCount: 1,
    bindings: [{ assetRole: 'garment-top', targetPath: 'garment.top', relation: 'reproduce', priority: 'required', activeWhen: [{ role: 'garment-top', presence: 'present' }] }],
    typedMetadata: {
      fields: { category: { required: true, values: ['shirt', 'jacket'] } },
      combinations: [{ values: { category: 'shirt' } }, { values: { category: 'jacket' } }],
    },
  })
  const registry = createScenarioPackRegistry()
  assert.doesNotThrow(() => registry.register(source(makePack(manifest('typed.root'), { interpretationScopes: [inputPolicy, scope] }))))

  const { id: _scopeId, contentDigest: _scopeDigest, ...scopeBody } = scope
  const badOrder = contribution('bad-order', { ...scopeBody, referenceOrder: -1 })
  const badCombination = contribution('bad-combination', {
    ...scopeBody,
    typedMetadata: { fields: { category: { required: true, values: ['shirt'] } }, combinations: [{ values: { category: 'dress' } }] },
  })
  assert.throws(() => createScenarioPackRegistry().register(source(makePack(manifest('bad-order.root'), { interpretationScopes: [badOrder] }))), /PACK_TYPED_CONTRIBUTION_INVALID/)
  assert.throws(() => createScenarioPackRegistry().register(source(makePack(manifest('bad-combination.root'), { interpretationScopes: [badCombination] }))), /PACK_TYPED_CONTRIBUTION_INVALID/)
})

test('SemVer conflict ranges support hyphen and explicit prerelease syntax without numeric truncation', () => {
  const registry = createScenarioPackRegistry()
  registry.register(source(makePack(manifest('first.party.root'))))
  const hyphen = makePack({ ...manifest('ext.hyphen', 'extension'), conflicts: [{ packId: 'ext.other', versionRange: '1.2.0 - 1.2.4', reasonCode: 'fixture' }] })
  const other = makePack({ ...manifest('ext.other', 'extension'), version: '1.2.3' })
  registry.register(source(hyphen)); registry.register(source(other))
  let result = registry.resolve(selection('first.party.root', [{ packId: 'ext.hyphen', versionRange: '1.0.0' }, { packId: 'ext.other', versionRange: '1.2.3' }]))
  assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_CONFLICT')
  const prerelease = makePack({ ...manifest('ext.prerelease', 'extension'), conflicts: [{ packId: 'ext.other', versionRange: '>=1.2.3-beta.1 <1.2.3', reasonCode: 'fixture' }] })
  registry.register(source(prerelease)); result = registry.resolve(selection('first.party.root', [{ packId: 'ext.prerelease', versionRange: '1.0.0' }, { packId: 'ext.other', versionRange: '1.2.3' }]))
  assert.equal(result.status, 'resolved')
  assert.throws(() => registry.register(source(makePack({ ...manifest('ext.huge', 'extension'), version: '999999999999999999999.0.0' }))), /PACK_VERSION_UNSATISFIABLE/)
})

test('Unknown override schema IDs are conservatively blocked', () => {
  const point = contribution('unknown-schema', { targetKind: 'configuration', targetPath: '/theme', allowDisable: false, maximumImportance: 'preferred', valueSchema: { schemaId: 'not-proven', contractId: 'voce.test', version: '1.0.0' } })
  const registry = createScenarioPackRegistry(); registry.register(source(makePack(manifest('first.party.root'), { overridePoints: [point] })))
  const result = registry.resolve({ ...selection(), hostPolicyOverlay: overlay([override('unknown-schema-override', { kind: 'set_configuration', packId: 'first.party.root', overridePointId: 'unknown-schema', value: 'dark' })]) })
  assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_OVERRIDE_INVALID')
})

test('Composition self-reference is a blocking order cycle', () => {
  const registry = createScenarioPackRegistry(); registry.register(source(makePack({ ...manifest('first.party.root'), composition: { before: ['first.party.root'], after: [] } })))
  const result = registry.resolve(selection())
  assert.equal(result.status, 'blocked'); assert.equal(result.report.conflicts[0].code, 'PACK_ORDER_CYCLE')
})
