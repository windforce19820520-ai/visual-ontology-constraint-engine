import { createHash } from 'node:crypto'
import type {
  EffectiveScenario, HostPolicyOverlay, JsonObject, JsonValue, LocalScenarioPackSource,
  PackResolutionReport, OverridePoint, ResolvedContribution, ScenarioCompositionLock,
  ScenarioPack, ScenarioPackCatalogSnapshot, ScenarioPackDependency, ScenarioPackDescriptor,
  ScenarioPackManifest, ScenarioPackRegistry, ScenarioPackRequest, ScenarioPackResolution,
  ScenarioPackSelection,
} from '@voce/contracts'

export type { JsonValue } from '@voce/contracts'

export const RESOLVER_VERSION = 'voce.scenario-pack-resolver/v1alpha1'
const CONTRACT_VERSION = 'voce.scenario-pack/v1alpha1'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const NORMAL_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const keyOf = (packId: string, version: string): string => `${packId}@${version}`

function compareCodeUnits(a: string, b: string): number {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function bytesHash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function isExactSemVer(value: string): boolean {
  return NORMAL_SEMVER.test(value)
}

type Version = { major: number; minor: number; patch: number }

function parseVersion(value: string): Version | undefined {
  const match = value.match(NORMAL_SEMVER)
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : undefined
}

function compareVersions(left: Version, right: Version): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}

function upperBoundForCaret(version: Version): Version {
  if (version.major > 0) return { major: version.major + 1, minor: 0, patch: 0 }
  if (version.minor > 0) return { major: 0, minor: version.minor + 1, patch: 0 }
  return { major: 0, minor: 0, patch: version.patch + 1 }
}

function upperBoundForTilde(version: Version): Version {
  return { major: version.major, minor: version.minor + 1, patch: 0 }
}

function rangeAlternativeMatches(range: string, version: Version): boolean {
  const trimmed = range.trim()
  if (trimmed === '' || trimmed === '*' || trimmed.toLowerCase() === 'x') return true
  const tokens = trimmed.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    if (token === '*' || token.toLowerCase() === 'x') continue
    const operator = token.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/)
    if (!operator || !operator[2]) return false
    const prefix = operator[1] ?? '='
    const rawVersion = operator[2]
    if (rawVersion.includes('-') || rawVersion.includes('+')) return false
    const wildcard = rawVersion.match(/^(0|[1-9][0-9]*|x|X)(?:\.(0|[1-9][0-9]*|x|X))?(?:\.(0|[1-9][0-9]*|x|X))?$/)
    if ((prefix === '=' || prefix === '') && wildcard && (wildcard[2] === undefined || wildcard[2].toLowerCase() === 'x' || wildcard[3] === undefined || wildcard[3].toLowerCase() === 'x')) {
      const major = wildcard[1].toLowerCase() === 'x' ? undefined : Number(wildcard[1])
      const minor = wildcard[2] === undefined || wildcard[2].toLowerCase() === 'x' ? undefined : Number(wildcard[2])
      if (major === undefined) continue
      if (version.major !== major) return false
      if (minor !== undefined && version.minor !== minor) return false
      continue
    }
    const parsed = parseVersion(rawVersion)
    if (!parsed) return false
    const comparison = compareVersions(version, parsed)
    if (prefix === '^' && (comparison < 0 || compareVersions(version, upperBoundForCaret(parsed)) >= 0)) return false
    if (prefix === '~' && (comparison < 0 || compareVersions(version, upperBoundForTilde(parsed)) >= 0)) return false
    if (prefix === '>=' && comparison < 0) return false
    if (prefix === '<=' && comparison > 0) return false
    if (prefix === '>' && comparison <= 0) return false
    if (prefix === '<' && comparison >= 0) return false
    if ((prefix === '=' || prefix === '') && comparison !== 0) return false
  }
  return true
}

function isValidSemVerRange(range: string): boolean {
  if (range.trim() === '' || range.trim() === '*' || range.trim().toLowerCase() === 'x') return true
  return range.split('||').every((alternative) => {
    const tokens = alternative.trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean)
    return tokens.length > 0 && tokens.every((token) => {
      const raw = token.replace(/^(\^|~|>=|<=|>|<|=)/, '')
      if (raw === '*' || raw.toLowerCase() === 'x') return true
      if (/^(?:\d+|x|X)(?:\.(?:\d+|x|X))?(?:\.(?:\d+|x|X))?$/.test(raw)) {
        const parts = raw.split('.')
        return parts.every((part) => part.toLowerCase() === 'x' || /^(0|[1-9][0-9]*)$/.test(part))
      }
      return isExactSemVer(raw)
    })
  })
}

function rangeMatches(range: string, version: string): boolean {
  const parsed = parseVersion(version)
  return parsed !== undefined && range.split('||').some((alternative) => rangeAlternativeMatches(alternative, parsed))
}

function safePath(path: string): boolean {
  return path.length > 0 && !path.includes('\\') && !path.startsWith('/') && !path.includes(':') && !path.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function record(value: unknown, label: string): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected object`)
}

function json(value: unknown): JsonValue {
  return value as JsonValue
}

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CANONICAL_JSON_NUMBER_INVALID')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort(compareCodeUnits).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

export function sha256(value: JsonValue): string {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`
}

export function hashWithoutSelf<T extends Record<string, unknown>>(value: T, field: string): string {
  const copy = { ...value }
  delete copy[field]
  return sha256(json(copy))
}

function validateManifestBase(value: unknown): asserts value is ScenarioPackManifest {
  record(value, 'ScenarioPackManifest')
  for (const field of ['schemaVersion', 'packId', 'version', 'kind', 'declarations', 'permissions', 'distributionInventory']) {
    if (!(field in value)) throw new Error(`ScenarioPackManifest.${field}: required`)
  }
  if (value.schemaVersion !== 'voce.scenario-pack/v1alpha1') throw new Error('PACK_SCHEMA_UNSUPPORTED')
  if (typeof value.packId !== 'string' || !value.packId || typeof value.version !== 'string' || !value.version) throw new Error('PACK_MANIFEST_INVALID')
  if (value.kind !== 'root' && value.kind !== 'extension') throw new Error('PACK_KIND_INVALID')
  const declarations = value.declarations as JsonObject
  const permissions = value.permissions as JsonObject
  for (const key of ['containsExecutableScenarioCode', 'distributionLifecycleScripts', 'containsExecutableFiles', 'fixturesRequireNetwork', 'fixturesRequireRealProvider']) {
    if (declarations[key] !== false) throw new Error('PACK_DECLARATION_INVALID')
  }
  for (const key of ['network', 'remoteCalls', 'secrets', 'filesystemWrite', 'mutateConfirmedFacts', 'authorizeCalls', 'overrideHostPolicy', 'selectProvider', 'changeBudgets']) {
    if (permissions[key] !== false) throw new Error('PACK_PERMISSION_FORBIDDEN')
  }
}

export function validateManifest(value: unknown): void {
  validateManifestBase(value)
}

function validateManifestStrict(manifest: ScenarioPackManifest): void {
  validateManifestBase(manifest)
  if (!isExactSemVer(manifest.version)) throw new Error('PACK_VERSION_UNSATISFIABLE')
  if (manifest.kind === 'root' ? manifest.extensionOf !== undefined : !manifest.extensionOf) throw new Error('PACK_MANIFEST_INVALID')
  if (manifest.extensionOf && !isExactSemVer(manifest.extensionOf.rootVersionRange)) throw new Error('PACK_VERSION_UNSATISFIABLE')
  const declarations = manifest.declarations
  const permissions = manifest.permissions
  if (declarations.containsExecutableScenarioCode || declarations.distributionLifecycleScripts || declarations.containsExecutableFiles || declarations.fixturesRequireNetwork || declarations.fixturesRequireRealProvider || declarations.collectsTelemetry) throw new Error('PACK_DECLARATION_INVALID')
  if (permissions.network || permissions.remoteCalls || permissions.secrets || permissions.filesystemWrite || permissions.mutateConfirmedFacts || permissions.authorizeCalls || permissions.overrideHostPolicy || permissions.selectProvider || permissions.changeBudgets) throw new Error('PACK_PERMISSION_FORBIDDEN')
  for (const dependency of manifest.dependencies) if (dependency.role !== 'extension' || !isExactSemVer(dependency.versionRange)) throw new Error('PACK_DEPENDENCY_UNSATISFIABLE')
  for (const conflict of manifest.conflicts) if (!isValidSemVerRange(conflict.versionRange)) throw new Error('PACK_VERSION_UNSATISFIABLE')
  const paths = new Set<string>()
  const foldedPaths = new Set<string>()
  for (const file of manifest.distributionInventory) {
    if (!safePath(file.path) || !DIGEST.test(file.contentDigest) || paths.has(file.path) || foldedPaths.has(file.path.toLowerCase())) throw new Error('PACK_MANIFEST_INVALID')
    paths.add(file.path)
    foldedPaths.add(file.path.toLowerCase())
  }
  if (manifest.distributionInventory.some((file) => file.path.toLowerCase() === 'scenario-pack/manifest.json')) throw new Error('PACK_MANIFEST_INVALID')
  for (const category of ['ontologyVocabulary', 'rulePacks', 'interpretationScopes', 'promptSections', 'reviewTemplates', 'defaults', 'overridePoints'] as const) {
    const ids = new Set<string>()
    for (const descriptor of manifest.contributions[category]) {
      if (ids.has(descriptor.id) || !DIGEST.test(descriptor.contentDigest)) throw new Error('PACK_CONTRIBUTION_INVALID')
      ids.add(descriptor.id)
    }
  }
}

function contributionDigest(value: JsonObject): string {
  const copy = { ...value }
  delete copy.contentDigest
  return sha256(copy)
}

function descriptorFor(definition: ScenarioPack, files: Array<{ path: string; bytes: Uint8Array }>): ScenarioPackDescriptor {
  validateManifestStrict(definition.manifest)
  const inventory = new Map(definition.manifest.distributionInventory.map((file) => [file.path, file]))
  const seen = new Set<string>()
  for (const file of files) {
    if (!safePath(file.path) || file.path.toLowerCase() === 'scenario-pack/manifest.json' || seen.has(file.path) || !inventory.has(file.path)) throw new Error('PACK_MANIFEST_INVALID')
    seen.add(file.path)
    if (bytesHash(file.bytes) !== inventory.get(file.path)!.contentDigest) throw new Error('PACK_DIGEST_MISMATCH')
  }
  if (seen.size !== inventory.size) throw new Error('PACK_MANIFEST_INVALID')
  for (const category of ['ontologyVocabulary', 'rulePacks', 'interpretationScopes', 'promptSections', 'reviewTemplates', 'defaults', 'overridePoints'] as const) {
    const indexed = new Map(definition.manifest.contributions[category].map((descriptor) => [descriptor.id, descriptor.contentDigest]))
    for (const raw of definition.contributions[category] as unknown[]) {
      const contribution = raw as unknown as JsonObject
      const id = typeof contribution.contributionId === 'string' ? contribution.contributionId : String(contribution.id)
      if (indexed.get(id) !== contribution.contentDigest || contributionDigest(contribution) !== contribution.contentDigest) throw new Error('PACK_DIGEST_MISMATCH')
    }
  }
  const manifestHash = sha256(json(definition.manifest))
  const normalizedFiles = files.map((file) => ({ path: file.path, contentDigest: bytesHash(file.bytes), byteLength: file.bytes.byteLength, role: inventory.get(file.path)!.role })).sort((left, right) => compareCodeUnits(left.path, right.path))
  const packageDigest = sha256({ manifestHash, files: normalizedFiles })
  const distributionDigest = sha256({ files: normalizedFiles })
  return { manifest: definition.manifest, manifestHash, packageDigest, distributionDigest, provenance: definition.manifest.provenance, acquisition: { sourceKind: 'memory', sourceLocator: 'memory', distributionDigest, lifecycleScriptsExecuted: false } }
}

function selectedEntry(catalog: ScenarioPackCatalogSnapshot, request: ScenarioPackRequest): ScenarioPackDescriptor | undefined {
  return catalog.entries.find((entry) => entry.manifest.packId === request.packId && entry.manifest.version === request.versionRange)
}

function conflict(code: string, packIds: string[], reason: string, action: string, contributionIds: string[] = [], overrideIds: string[] = []) {
  return { code, packIds, contributionIds, overrideIds: Array.isArray(overrideIds) ? overrideIds : [], reason, action }
}

function failureReport(selected: ScenarioPackDescriptor[], dependencyTrace: PackResolutionReport['dependencyTrace'], compositionTrace: PackResolutionReport['compositionTrace'], overrideTraces: PackResolutionReport['overrideTraces'], conflicts: PackResolutionReport['conflicts'], warnings: PackResolutionReport['warnings']): PackResolutionReport & { status: 'blocked' } {
  const base = { status: 'blocked' as const, selected: selected.map((entry) => ({ packId: entry.manifest.packId, version: entry.manifest.version, kind: entry.manifest.kind, packageDigest: entry.packageDigest, manifestHash: entry.manifestHash })), dependencyTrace, compositionTrace, overrideTraces, conflicts, warnings }
  return { ...base, reportHash: hashWithoutSelf(base, 'reportHash') }
}

function sortedDescriptors(entries: ScenarioPackDescriptor[]): ScenarioPackDescriptor[] {
  return [...entries].sort((left, right) => compareCodeUnits(keyOf(left.manifest.packId, left.manifest.version), keyOf(right.manifest.packId, right.manifest.version)) || compareCodeUnits(left.packageDigest, right.packageDigest))
}

function catalogBase(catalog: ScenarioPackCatalogSnapshot) {
  return { contractVersion: catalog.contractVersion, resolverVersion: catalog.resolverVersion, registryRevision: catalog.registryRevision, entries: sortedDescriptors(catalog.entries), availabilityPolicies: [...catalog.availabilityPolicies].sort((left, right) => compareCodeUnits(left.policyHash, right.policyHash)) }
}

function validateCatalog(catalog: ScenarioPackCatalogSnapshot, descriptors: ReadonlyMap<string, ScenarioPackDescriptor>): ReturnType<typeof conflict> | undefined {
  if (catalog.contractVersion !== CONTRACT_VERSION || catalog.resolverVersion !== RESOLVER_VERSION) return conflict('PACK_COMPATIBILITY_MISMATCH', [], 'Catalog contract or resolver version is not supported.', 'Use a snapshot produced by this M2 Registry.')
  if (!DIGEST.test(catalog.catalogHash) || sha256(json(catalogBase(catalog))) !== catalog.catalogHash) return conflict('PACK_DIGEST_MISMATCH', [], 'Catalog hash does not match its canonical snapshot payload.', 'Refresh the explicit local catalog snapshot.')
  const seen = new Set<string>()
  for (const entry of catalog.entries) {
    const key = keyOf(entry.manifest.packId, entry.manifest.version)
    if (seen.has(key)) return conflict('PACK_DUPLICATE_ID_VERSION', [entry.manifest.packId], 'Catalog contains a duplicate pack identity.', 'Remove the duplicate entry.')
    seen.add(key)
    const local = descriptors.get(key)
    if (!local) return conflict('PACK_NOT_FOUND', [entry.manifest.packId], 'Catalog contains a pack not registered in this Registry.', 'Use this Registry snapshot without external entries.')
    if (local.manifestHash !== entry.manifestHash || local.packageDigest !== entry.packageDigest || local.distributionDigest !== entry.distributionDigest) return conflict('PACK_DIGEST_MISMATCH', [entry.manifest.packId], 'Catalog descriptor digests do not match the registered local package.', 'Refresh the catalog from the Registry.')
  }
  return undefined
}

function pointerSegments(pointer: string): string[] | undefined {
  if (pointer === '') return []
  if (!pointer.startsWith('/') || pointer.includes('//')) return undefined
  return pointer.slice(1).split('/').map((segment) => {
    if (/~(?![01])/.test(segment)) return undefined
    return segment.replace(/~1/g, '/').replace(/~0/g, '~')
  }) as string[]
}

function setJsonPointer(source: JsonObject, pointer: string, value: JsonValue): JsonObject | undefined {
  const segments = pointerSegments(pointer)
  if (!segments) return undefined
  if (segments.length === 0) {
    record(value, 'configuration')
    return value
  }
  const result = JSON.parse(JSON.stringify(source)) as JsonObject
  let cursor: JsonObject = result
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const next = cursor[segment]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return undefined
    cursor = next as JsonObject
  }
  cursor[segments[segments.length - 1]] = value
  return result
}

function schemaAccepts(point: OverridePoint, value: JsonValue): boolean {
  const schemaId = point.valueSchema?.schemaId
  if (!schemaId) return true
  if (schemaId === 'string') return typeof value === 'string'
  if (schemaId === 'number') return typeof value === 'number'
  if (schemaId === 'boolean') return typeof value === 'boolean'
  if (schemaId === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (schemaId === 'array') return Array.isArray(value)
  return true
}

function contributionId(value: unknown): string {
  const object = value as Record<string, unknown>
  return typeof object.contributionId === 'string' ? object.contributionId : String(object.id)
}

function withSource(value: unknown, packId: string, category: string, sourcePackIds: string[]): ResolvedContribution {
  const contribution = { ...(value as JsonObject) } as Record<string, unknown>
  contribution.packId = packId
  contribution.contributionKind = category
  contribution.contributionId = contributionId(value)
  contribution.sourcePackIds = sourcePackIds
  return contribution as ResolvedContribution
}

function composeCategory(category: 'ontologyVocabulary' | 'rulePacks' | 'interpretationScopes' | 'promptSections' | 'reviewTemplates' | 'defaults', ordered: ScenarioPackDescriptor[], packages: ReadonlyMap<string, ScenarioPack>, disabled: ReadonlySet<string>, defaultValues: ReadonlyMap<string, JsonValue>): { values: ResolvedContribution[]; collision?: ReturnType<typeof conflict> } {
  const byId = new Map<string, { value: unknown; digest: string; packId: string; sourcePackIds: string[] }>()
  for (const descriptor of ordered) {
    const pack = packages.get(keyOf(descriptor.manifest.packId, descriptor.manifest.version))!
    for (const raw of (pack.contributions[category] as unknown[])) {
      const id = contributionId(raw)
      if (disabled.has(`${category}:${descriptor.manifest.packId}:${id}`)) continue
      const object = raw as JsonObject
      const digest = String(object.contentDigest)
      const target = byId.get(id)
      if (target && target.digest !== digest) return { values: [], collision: conflict('PACK_RULE_CONFLICT', [target.packId, descriptor.manifest.packId], 'Equal contribution IDs have different content digests.', 'Rename the contribution or make its content identical.', [id]) }
      if (target) {
        target.sourcePackIds.push(descriptor.manifest.packId)
        continue
      }
      const defaultTarget = typeof object.targetPath === 'string' ? object.targetPath : id
      const value = category === 'defaults' && defaultValues.has(`${descriptor.manifest.packId}|${defaultTarget}`) ? { ...object, value: defaultValues.get(`${descriptor.manifest.packId}|${defaultTarget}`), source: { kind: 'host_override', target: defaultTarget } } : object
      byId.set(id, { value, digest, packId: descriptor.manifest.packId, sourcePackIds: [descriptor.manifest.packId] })
    }
  }
  return { values: [...byId.values()].map((item) => withSource(item.value, item.packId, category, item.sourcePackIds)) }
}

function overridePayload(override: { id: string; operation: unknown; reasonCode: string }): JsonObject {
  return { id: override.id, operation: override.operation as JsonValue, reasonCode: override.reasonCode }
}

function overlayPayload(overlay: HostPolicyOverlay): JsonObject {
  const overrides = [...overlay.overrides].sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash) || compareCodeUnits(left.id, right.id))
  return { id: overlay.id, caseId: overlay.caseId, caseRevision: overlay.caseRevision, overrides: overrides as unknown as JsonValue, authority: overlay.authority, reasonCode: overlay.reasonCode }
}

function validateOverlay(overlay: HostPolicyOverlay): ReturnType<typeof conflict> | undefined {
  if (!DIGEST.test(overlay.overlayHash) || sha256(overlayPayload(overlay)) !== overlay.overlayHash) return conflict('PACK_OVERRIDE_INVALID', [], 'Host policy overlay hash is invalid.', 'Recompute the overlay hash from the canonical overlay payload.')
  for (const override of overlay.overrides) if (!DIGEST.test(override.contentHash) || sha256(overridePayload(override)) !== override.contentHash) return conflict('PACK_OVERRIDE_INVALID', [override.operation.packId], 'Host override content hash is invalid.', 'Recompute the override hash from its canonical payload.', [], [override.id])
  return undefined
}

export function resolveScenario(selection: ScenarioPackSelection, catalog: ScenarioPackCatalogSnapshot, packages: ReadonlyMap<string, ScenarioPack>, descriptors: ReadonlyMap<string, ScenarioPackDescriptor> = new Map()): ScenarioPackResolution {
  const selected: ScenarioPackDescriptor[] = []
  const dependencyTrace: PackResolutionReport['dependencyTrace'] = []
  const compositionTrace: PackResolutionReport['compositionTrace'] = []
  const overrideTraces: PackResolutionReport['overrideTraces'] = []
  const conflicts: PackResolutionReport['conflicts'] = []
  const warnings: PackResolutionReport['warnings'] = []
  const catalogConflict = validateCatalog(catalog, descriptors)
  if (catalogConflict) return { status: 'blocked', report: failureReport([], [], [], [], [catalogConflict], []) }
  const rootRequest = selection.root
  if (!isExactSemVer(rootRequest.versionRange)) conflicts.push(conflict('PACK_VERSION_UNSATISFIABLE', [rootRequest.packId], 'Root request must use exact normal SemVer.', 'Use x.y.z.'))
  const root = selectedEntry(catalog, rootRequest)
  if (!root) conflicts.push(conflict('PACK_NOT_FOUND', [rootRequest.packId], 'Root is not present at the exact requested version.', 'Register the exact local pack version.'))
  if (root && root.manifest.kind !== 'root') conflicts.push(conflict('PACK_ROOT_REQUIRED', [root.manifest.packId], 'Root request selected an extension.', 'Select a root pack.'))
  if (!root || conflicts.length) return { status: 'blocked', report: failureReport(root ? [root] : [], [], [], [], conflicts, []) }
  selected.push(root)
  const add = (descriptor: ScenarioPackDescriptor, request: ScenarioPackRequest, owner: ScenarioPackDescriptor) => {
    if (!isExactSemVer(request.versionRange)) {
      conflicts.push(conflict('PACK_VERSION_UNSATISFIABLE', [request.packId], 'Pack request must use exact normal SemVer.', 'Use x.y.z.'))
      return
    }
    const extension = descriptor.manifest.extensionOf
    if (descriptor.manifest.kind !== 'extension' || !extension || extension.rootPackId !== root.manifest.packId || extension.rootVersionRange !== root.manifest.version) conflicts.push(conflict('PACK_COMPATIBILITY_MISMATCH', [owner.manifest.packId, descriptor.manifest.packId], 'Extension root compatibility does not match the selected root.', 'Select a compatible extension.'))
    if (!selected.some((entry) => keyOf(entry.manifest.packId, entry.manifest.version) === keyOf(descriptor.manifest.packId, descriptor.manifest.version))) selected.push(descriptor)
  }
  for (const request of selection.extensions) {
    const entry = selectedEntry(catalog, request)
    if (!entry) conflicts.push(conflict('PACK_NOT_FOUND', [request.packId], 'Explicit extension is missing.', 'Register the exact local extension version.'))
    else add(entry, request, root)
  }
  for (let index = 0; index < selected.length; index += 1) {
    const owner = selected[index]
    for (const dependency of owner.manifest.dependencies) {
      const entry = selectedEntry(catalog, { packId: dependency.packId, versionRange: dependency.versionRange })
      if (!entry) {
        dependencyTrace.push({ packId: owner.manifest.packId, dependencyPackId: dependency.packId, status: 'missing', reasonCode: 'PACK_DEPENDENCY_MISSING' })
        conflicts.push(conflict('PACK_DEPENDENCY_MISSING', [owner.manifest.packId, dependency.packId], 'A declared dependency is absent.', 'Register the exact dependency.'))
      } else {
        dependencyTrace.push({ packId: owner.manifest.packId, dependencyPackId: dependency.packId, status: 'resolved', reasonCode: 'PACK_DEPENDENCY_RESOLVED' })
        add(entry, { packId: entry.manifest.packId, versionRange: entry.manifest.version }, owner)
      }
    }
  }
  for (const owner of selected) for (const declaredConflict of owner.manifest.conflicts) if (selected.some((entry) => entry.manifest.packId === declaredConflict.packId && rangeMatches(declaredConflict.versionRange, entry.manifest.version))) conflicts.push(conflict('PACK_CONFLICT', [owner.manifest.packId, declaredConflict.packId], 'Manifest declares an explicit SemVer conflict.', 'Remove one conflicting selection.'))
  if (conflicts.length) return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, conflicts, warnings) }

  const nodes = selected.map((entry) => keyOf(entry.manifest.packId, entry.manifest.version))
  const edges = new Map(nodes.map((node) => [node, new Set<string>()]))
  const dependencyEdges: Array<[string, string]> = []
  const addEdge = (from: string, to: string, reasonCode: string) => {
    if (from !== to && edges.has(from) && edges.has(to) && !edges.get(from)!.has(to)) {
      edges.get(from)!.add(to)
      compositionTrace.push({ from, to, reasonCode })
    }
  }
  for (const entry of selected) {
    const from = keyOf(entry.manifest.packId, entry.manifest.version)
    for (const dependency of entry.manifest.dependencies) {
      const target = keyOf(dependency.packId, dependency.versionRange)
      dependencyEdges.push([target, from])
      addEdge(target, from, 'PACK_DEPENDENCY_ORDER')
    }
    for (const before of entry.manifest.composition.before) {
      const target = nodes.find((node) => node.startsWith(`${before}@`))
      if (target) addEdge(from, target, 'PACK_MANIFEST_BEFORE')
    }
    for (const after of entry.manifest.composition.after) {
      const target = nodes.find((node) => node.startsWith(`${after}@`))
      if (target) addEdge(target, from, 'PACK_MANIFEST_AFTER')
    }
  }
  for (const entry of selected.filter((item) => item.manifest.kind === 'extension')) addEdge(keyOf(root.manifest.packId, root.manifest.version), keyOf(entry.manifest.packId, entry.manifest.version), 'ROOT_BEFORE_EXTENSION')
  const dependencyRemaining = new Set(nodes)
  while (dependencyRemaining.size) {
    const ready = [...dependencyRemaining].filter((node) => !dependencyEdges.some(([from, to]) => dependencyRemaining.has(from) && to === node)).sort(compareCodeUnits)
    if (!ready.length) break
    dependencyRemaining.delete(ready[0])
  }
  if (dependencyRemaining.size) {
    for (const trace of dependencyTrace) if (dependencyRemaining.has(keyOf(trace.packId, selected.find((entry) => entry.manifest.packId === trace.packId)?.manifest.version ?? '')) || dependencyRemaining.has(keyOf(trace.dependencyPackId, selected.find((entry) => entry.manifest.packId === trace.dependencyPackId)?.manifest.version ?? ''))) trace.status = 'cycle'
    return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, [conflict('PACK_DEPENDENCY_UNSATISFIABLE', [...dependencyRemaining].map((node) => node.split('@')[0]), 'Dependencies contain a cycle.', 'Remove the dependency cycle.')], warnings) }
  }
  const order: string[] = []
  const remaining = new Set(nodes)
  while (remaining.size) {
    const ready = [...remaining].filter((node) => ![...edges].some(([from, targets]) => remaining.has(from) && targets.has(node))).sort(compareCodeUnits)
    if (!ready.length) return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, [conflict('PACK_ORDER_CYCLE', [...remaining].map((node) => node.split('@')[0]), 'Composition edges contain a cycle.', 'Remove the composition cycle.')], warnings) }
    order.push(ready[0])
    remaining.delete(ready[0])
  }
  const ordered = order.map((node) => selected.find((entry) => keyOf(entry.manifest.packId, entry.manifest.version) === node)!)
  const localPackages = packages
  const configs = new Map<string, JsonObject>()
  for (const entry of ordered) {
    const request = [selection.root, ...selection.extensions].find((item) => item.packId === entry.manifest.packId && item.versionRange === entry.manifest.version)
    configs.set(entry.manifest.packId, JSON.parse(JSON.stringify(request?.configuration ?? {})) as JsonObject)
  }
  const overlay = selection.hostPolicyOverlay
  if (overlay) {
    const overlayConflict = validateOverlay(overlay)
    if (overlayConflict) return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, [overlayConflict], warnings) }
  }
  const disabled = new Set<string>()
  const defaultValues = new Map<string, JsonValue>()
  const appliedOverrides: EffectiveScenario['appliedOverrides'] = []
  const seenTargets = new Map<string, { operation: string; contentHash: string }>()
  const sortedOverrides = [...(overlay?.overrides ?? [])].sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash) || compareCodeUnits(left.id, right.id))
  for (const override of sortedOverrides) {
    const packDescriptor = ordered.find((entry) => entry.manifest.packId === override.operation.packId)
    const pack = packDescriptor ? localPackages.get(keyOf(packDescriptor.manifest.packId, packDescriptor.manifest.version)) : undefined
    const point = pack?.contributions.overridePoints.find((candidate) => candidate.id === override.operation.overridePointId)
    const operation = override.operation
    const expectedKind = operation.kind === 'set_configuration' ? 'configuration' : operation.kind === 'set_declared_default' ? 'declared_default' : 'contribution_activation'
    let reasonCode = ''
    if (!packDescriptor) reasonCode = 'PACK_NOT_FOUND'
    else if (!point) reasonCode = 'PACK_OVERRIDE_POINT_NOT_FOUND'
    else if (point.targetKind !== expectedKind) reasonCode = 'PACK_OVERRIDE_INVALID'
    else if (operation.kind === 'set_configuration' && pointerSegments(point.targetPath) === undefined) reasonCode = 'PACK_OVERRIDE_INVALID'
    else if (operation.kind !== 'set_configuration' && !point.targetPath) reasonCode = 'PACK_OVERRIDE_INVALID'
    else if (operation.kind === 'set_contribution_activation' && !operation.active && !point.allowDisable) reasonCode = 'PACK_OVERRIDE_FORBIDDEN'
    else if (operation.kind !== 'set_contribution_activation' && !schemaAccepts(point, operation.value)) reasonCode = 'PACK_OVERRIDE_INVALID'
    const target = point ? `${operation.packId}|${point.targetKind}|${point.targetPath}` : `${operation.packId}|${operation.overridePointId}`
    const operationCanonical = canonicalize(operation as unknown as JsonValue)
    const prior = seenTargets.get(target)
    if (!reasonCode && prior && (prior.operation !== operationCanonical || prior.contentHash !== override.contentHash)) reasonCode = 'PACK_OVERRIDE_INVALID'
    if (reasonCode) {
      overrideTraces.push({ hostOverrideId: override.id, packId: operation.packId, overridePointId: operation.overridePointId, status: 'blocked', reasonCode })
      conflicts.push(conflict(reasonCode, [operation.packId], 'Host override is outside the declared typed override point or conflicts with another override.', 'Use one valid operation per effective target.', [], [override.id]))
      continue
    }
    if (prior) continue
    seenTargets.set(target, { operation: operationCanonical, contentHash: override.contentHash })
    if (operation.kind === 'set_configuration') {
      const current = configs.get(operation.packId) ?? {}
      const next = setJsonPointer(current, point!.targetPath, operation.value)
      if (!next) {
        overrideTraces.push({ hostOverrideId: override.id, packId: operation.packId, overridePointId: operation.overridePointId, status: 'blocked', reasonCode: 'PACK_OVERRIDE_INVALID' })
        conflicts.push(conflict('PACK_OVERRIDE_INVALID', [operation.packId], 'Configuration target path cannot be applied to the current JSON object.', 'Use a valid JSON Pointer target path.', [], [override.id]))
        continue
      }
      configs.set(operation.packId, next)
    } else if (operation.kind === 'set_declared_default') {
      defaultValues.set(`${operation.packId}|${point!.targetPath}`, operation.value)
    } else if (!operation.active) {
      disabled.add(`ontologyVocabulary:${operation.packId}:${point!.targetPath}`)
      disabled.add(`rulePacks:${operation.packId}:${point!.targetPath}`)
      disabled.add(`interpretationScopes:${operation.packId}:${point!.targetPath}`)
      disabled.add(`promptSections:${operation.packId}:${point!.targetPath}`)
      disabled.add(`reviewTemplates:${operation.packId}:${point!.targetPath}`)
      disabled.add(`defaults:${operation.packId}:${point!.targetPath}`)
    }
    overrideTraces.push({ hostOverrideId: override.id, packId: operation.packId, overridePointId: operation.overridePointId, status: 'applied', reasonCode: 'PACK_OVERRIDE_APPLIED' })
    appliedOverrides.push({ packId: operation.packId, overridePointId: operation.overridePointId, hostOverrideId: override.id, contentHash: override.contentHash })
  }
  if (conflicts.length) return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, conflicts, warnings) }

  const categories = ['ontologyVocabulary', 'rulePacks', 'interpretationScopes', 'promptSections', 'reviewTemplates', 'defaults'] as const
  const effectiveValues: Record<typeof categories[number], ResolvedContribution[]> = { ontologyVocabulary: [], rulePacks: [], interpretationScopes: [], promptSections: [], reviewTemplates: [], defaults: [] }
  for (const category of categories) {
    const composed = composeCategory(category, ordered, localPackages, disabled, defaultValues)
    if (composed.collision) return { status: 'blocked', report: failureReport(selected, dependencyTrace, compositionTrace, overrideTraces, [composed.collision], warnings) }
    effectiveValues[category] = composed.values
  }
  const entries: ScenarioCompositionLock['entries'] = ordered.map((entry) => ({
    packId: entry.manifest.packId,
    version: entry.manifest.version,
    kind: entry.manifest.kind,
    manifestHash: entry.manifestHash,
    packageDigest: entry.packageDigest,
    configurationHash: sha256(configs.get(entry.manifest.packId) ?? {}),
    resolvedDependencies: entry.manifest.dependencies.map((dependency: ScenarioPackDependency) => ({ packId: dependency.packId, version: dependency.versionRange, packageDigest: selectedEntry(catalog, { packId: dependency.packId, versionRange: dependency.versionRange })!.packageDigest })),
    contributionDigests: Object.fromEntries(categories.flatMap((category) => entry.manifest.contributions[category].map((item) => [`${category}:${item.id}`, item.contentDigest]))),
  }))
  const lockBase = { schemaVersion: 'voce.scenario-pack-lock/v1alpha1' as const, contractVersion: CONTRACT_VERSION as 'voce.scenario-pack/v1alpha1', resolverVersion: catalog.resolverVersion, catalogHash: catalog.catalogHash, canonicalization: 'voce.canonical-json/v1alpha1' as const, rootPackId: root.manifest.packId, entries, compositionOrder: order, ...(overlay ? { hostPolicyOverlayHash: overlay.overlayHash } : {}), hostOverrideHashes: appliedOverrides.map((item) => item.contentHash) }
  const lock = { ...lockBase, compositionHash: sha256(json(lockBase)), lockHash: '' }
  lock.lockHash = hashWithoutSelf(lock, 'lockHash')
  const effective: EffectiveScenario = { lockHash: lock.lockHash, rootPackId: root.manifest.packId, extensionPackIds: ordered.filter((entry) => entry.manifest.kind === 'extension').map((entry) => entry.manifest.packId), compositionOrder: order, configurations: Object.fromEntries([...configs].sort((left, right) => compareCodeUnits(left[0], right[0]))), ...effectiveValues, capabilityRequirements: ordered.flatMap((entry) => entry.manifest.capabilityRequirements), declarations: ordered.map((entry) => entry.manifest.declarations) as unknown as JsonValue[], appliedOverrides, effectiveScenarioHash: '' }
  effective.effectiveScenarioHash = hashWithoutSelf(effective as unknown as Record<string, unknown>, 'effectiveScenarioHash')
  const reportBase = { status: 'resolved' as const, lockHash: lock.lockHash, effectiveScenarioHash: effective.effectiveScenarioHash, selected: selected.map((entry) => ({ packId: entry.manifest.packId, version: entry.manifest.version, kind: entry.manifest.kind, packageDigest: entry.packageDigest, manifestHash: entry.manifestHash })), dependencyTrace, compositionTrace, overrideTraces, conflicts: [], warnings }
  return { status: 'resolved', lock, effectiveScenario: effective, report: { ...reportBase, reportHash: hashWithoutSelf(reportBase, 'reportHash') } }
}

export class MemoryScenarioPackRegistry implements ScenarioPackRegistry {
  private revision = 0
  private readonly packs = new Map<string, ScenarioPack>()
  private readonly descriptors = new Map<string, ScenarioPackDescriptor>()
  private readonly policies: ScenarioPackCatalogSnapshot['availabilityPolicies'] = []

  register(source: LocalScenarioPackSource): ScenarioPackDescriptor {
    if (source.kind !== 'memory') throw new Error('PACK_SOURCE_UNSUPPORTED')
    const descriptor = descriptorFor(source.definition, source.logicalFiles)
    const key = keyOf(descriptor.manifest.packId, descriptor.manifest.version)
    const prior = this.descriptors.get(key)
    if (prior && prior.packageDigest !== descriptor.packageDigest) throw new Error('PACK_DUPLICATE_ID_VERSION')
    this.descriptors.set(key, descriptor)
    this.packs.set(key, source.definition)
    this.revision += 1
    return descriptor
  }

  list(): ScenarioPackDescriptor[] {
    return sortedDescriptors([...this.descriptors.values()])
  }

  snapshot(): ScenarioPackCatalogSnapshot {
    const base = { contractVersion: CONTRACT_VERSION as 'voce.scenario-pack/v1alpha1', resolverVersion: RESOLVER_VERSION, registryRevision: this.revision, entries: this.list(), availabilityPolicies: this.policies }
    return { ...base, catalogHash: sha256(json(base)) }
  }

  resolve(selection: ScenarioPackSelection, catalog = this.snapshot()): ScenarioPackResolution {
    return resolveScenario(selection, catalog, this.packs, this.descriptors)
  }
}

export function createScenarioPackRegistry(): ScenarioPackRegistry {
  return new MemoryScenarioPackRegistry()
}
