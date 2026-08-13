import { createHash } from 'node:crypto'
import type { JsonObject, JsonValue, LocalScenarioPackSource, HostOverride, OverridePoint, PackResolutionReport, ScenarioPack, ScenarioPackCatalogSnapshot, ScenarioPackDescriptor, ScenarioPackRegistry, ScenarioPackResolution, ScenarioPackSelection, ScenarioPackRequest, ScenarioCompositionLock, EffectiveScenario, ResolvedContribution, ScenarioPackManifest, ScenarioPackDependency } from '@voce/contracts'
export type { JsonValue } from '@voce/contracts'

export const RESOLVER_VERSION = 'voce.scenario-pack-resolver/v1alpha1'
const CONTRACT_VERSION = 'voce.scenario-pack/v1alpha1'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const SEMVER = /^\d+\.\d+\.\d+$/
const keyOf = (id:string, version:string) => `${id}@${version}`

function bytesHash(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
function exact(version:string): boolean { return SEMVER.test(version) }
function sameVersion(range:string, version:string): boolean { return range === version }
function safePath(path:string): boolean { return path.length > 0 && !path.includes('\\') && !path.startsWith('/') && !path.includes(':') && !path.split('/').some(p => p === '' || p === '.' || p === '..') }
function record(value:unknown, label:string): asserts value is JsonObject { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected object`) }
function json(value:unknown): JsonValue { return value as JsonValue }

export function canonicalize(value: JsonValue): string { return canonicalizeJson(value) }
function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('CANONICAL_JSON_NUMBER_INVALID'); return JSON.stringify(value) }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalizeJson(value[k])}`).join(',')}}`
}
export function sha256(value: JsonValue): string { return `sha256:${createHash('sha256').update(canonicalizeJson(value)).digest('hex')}` }
export function hashWithoutSelf<T extends Record<string, unknown>>(value:T, field:string):string { const copy={...value}; delete copy[field]; return sha256(json(copy)) }

export function validateManifest(value: unknown): void {
  record(value, 'ScenarioPackManifest')
  for (const field of ['schemaVersion','packId','version','kind','declarations','permissions','distributionInventory']) if (!(field in value)) throw new Error('ScenarioPackManifest.' + field + ': required')
  if (value.schemaVersion !== 'voce.scenario-pack/v1alpha1') throw new Error('PACK_SCHEMA_UNSUPPORTED')
  if (typeof value.packId !== 'string' || !value.packId || typeof value.version !== 'string' || !value.version) throw new Error('PACK_MANIFEST_INVALID')
  if (value.kind !== 'root' && value.kind !== 'extension') throw new Error('PACK_KIND_INVALID')
  const declarations=value.declarations as JsonObject, permissions=value.permissions as JsonObject
  for (const key of ['containsExecutableScenarioCode','distributionLifecycleScripts','containsExecutableFiles','fixturesRequireNetwork','fixturesRequireRealProvider']) if (declarations[key] !== false) throw new Error('PACK_DECLARATION_INVALID')
  for (const key of ['network','remoteCalls','secrets','filesystemWrite','mutateConfirmedFacts','authorizeCalls','overrideHostPolicy','selectProvider','changeBudgets']) if (permissions[key] !== false) throw new Error('PACK_PERMISSION_FORBIDDEN')
}
function validateManifestStrict(manifest: ScenarioPackManifest): void {
  validateManifest(manifest)
  if (manifest.schemaVersion !== 'voce.scenario-pack/v1alpha1') throw new Error('PACK_SCHEMA_UNSUPPORTED')
  if (!manifest.packId || !exact(manifest.version)) throw new Error('PACK_MANIFEST_INVALID')
  if (manifest.kind === 'root' ? manifest.extensionOf !== undefined : !manifest.extensionOf) throw new Error('PACK_MANIFEST_INVALID')
  if (manifest.kind === 'extension' && (!manifest.extensionOf || !exact(manifest.extensionOf.rootVersionRange))) throw new Error('PACK_VERSION_UNSATISFIABLE')
  const d = manifest.declarations, p = manifest.permissions
  if (d.containsExecutableScenarioCode || d.distributionLifecycleScripts || d.containsExecutableFiles || d.fixturesRequireNetwork || d.fixturesRequireRealProvider || d.collectsTelemetry) throw new Error('PACK_DECLARATION_INVALID')
  if (p.network || p.remoteCalls || p.secrets || p.filesystemWrite || p.mutateConfirmedFacts || p.authorizeCalls || p.overrideHostPolicy || p.selectProvider || p.changeBudgets) throw new Error('PACK_PERMISSION_FORBIDDEN')
  for (const dep of manifest.dependencies) if (dep.role !== 'extension' || !exact(dep.versionRange)) throw new Error('PACK_DEPENDENCY_UNSATISFIABLE')
  for (const file of manifest.distributionInventory) if (!safePath(file.path) || !DIGEST.test(file.contentDigest)) throw new Error('PACK_MANIFEST_INVALID')
  if (manifest.distributionInventory.some(f => f.path.toLowerCase() === 'scenario-pack/manifest.json')) throw new Error('PACK_MANIFEST_INVALID')
}

function contributionDigest(value: JsonObject): string { const copy = {...value}; delete copy.contentDigest; return sha256(copy) }
function descriptorFor(definition: ScenarioPack, files:Array<{path:string;bytes:Uint8Array}>): ScenarioPackDescriptor {
  validateManifestStrict(definition.manifest)
  const inventory = new Map(definition.manifest.distributionInventory.map(f => [f.path, f]))
  const seen = new Set<string>()
  for (const file of files) {
    if (!safePath(file.path) || file.path.toLowerCase() === 'scenario-pack/manifest.json' || seen.has(file.path) || !inventory.has(file.path)) throw new Error('PACK_MANIFEST_INVALID')
    seen.add(file.path); if (bytesHash(file.bytes) !== inventory.get(file.path)!.contentDigest) throw new Error('PACK_DIGEST_MISMATCH')
  }
  if (seen.size !== inventory.size) throw new Error('PACK_MANIFEST_INVALID')
  for (const category of ['ontologyVocabulary','rulePacks','interpretationScopes','promptSections','reviewTemplates','defaults','overridePoints'] as const) {
    const indexed = new Map(definition.manifest.contributions[category].map(c => [c.id, c.contentDigest]))
    for (const raw of definition.contributions[category] as unknown[]) { const c=raw as JsonObject; const id=typeof c.contributionId==='string'?c.contributionId:String(c.id); if (indexed.get(id) !== c.contentDigest || contributionDigest(c) !== c.contentDigest) throw new Error('PACK_DIGEST_MISMATCH') }
  }
  const manifestHash = sha256(json(definition.manifest))
  const normalizedFiles = files.map(f => ({path:f.path, contentDigest:bytesHash(f.bytes), byteLength:f.bytes.byteLength, role:inventory.get(f.path)!.role})).sort((a,b)=>a.path.localeCompare(b.path))
  const packageDigest = sha256({manifestHash, files:normalizedFiles})
  const distributionDigest = sha256({files:normalizedFiles})
  return {manifest:definition.manifest,manifestHash,packageDigest,distributionDigest,provenance:definition.manifest.provenance,acquisition:{sourceKind:'memory',sourceLocator:'memory',distributionDigest,lifecycleScriptsExecuted:false}}
}

function selectedEntry(catalog:ScenarioPackCatalogSnapshot, request:ScenarioPackRequest): ScenarioPackDescriptor | undefined { return catalog.entries.find(e=>e.manifest.packId===request.packId && e.manifest.version===request.versionRange) }
function failureReport(selected:ScenarioPackDescriptor[], dependencyTrace:PackResolutionReport['dependencyTrace'], compositionTrace:PackResolutionReport['compositionTrace'], overrideTraces:PackResolutionReport['overrideTraces'], conflicts:PackResolutionReport['conflicts'], warnings:PackResolutionReport['warnings']): PackResolutionReport & {status:'blocked'} {
  const base = {status:'blocked' as const,selected:selected.map(e=>({packId:e.manifest.packId,version:e.manifest.version,kind:e.manifest.kind,packageDigest:e.packageDigest,manifestHash:e.manifestHash})),dependencyTrace,compositionTrace,overrideTraces,conflicts,warnings}
  return {...base, reportHash:hashWithoutSelf(base,'reportHash')}
}

export function resolveScenario(selection:ScenarioPackSelection, catalog:ScenarioPackCatalogSnapshot, packages:ReadonlyMap<string,ScenarioPack>):ScenarioPackResolution {
  const selected:ScenarioPackDescriptor[] = [], depTrace:PackResolutionReport['dependencyTrace']=[], compTrace:PackResolutionReport['compositionTrace']=[], overrideTraces:PackResolutionReport['overrideTraces']=[], conflicts:PackResolutionReport['conflicts']=[], warnings:PackResolutionReport['warnings']=[]
  const root = selectedEntry(catalog, selection.root)
  if (!root) return {status:'blocked',report:failureReport([],[],[],[],[{code:'PACK_NOT_FOUND',packIds:[selection.root.packId],contributionIds:[],overrideIds:[],reason:'Root is not present at the exact requested version.',action:'Register the exact local pack version.'}],[])}
  if (root.manifest.kind !== 'root') conflicts.push({code:'PACK_ROOT_REQUIRED',packIds:[root.manifest.packId],contributionIds:[],overrideIds:[],reason:'Root request selected an extension.',action:'Select a root pack.'})
  selected.push(root)
  const add = (descriptor:ScenarioPackDescriptor, request:ScenarioPackRequest, owner:ScenarioPackDescriptor) => {
    if (!exact(request.versionRange)) { conflicts.push({code:'PACK_VERSION_UNSATISFIABLE',packIds:[request.packId],contributionIds:[],overrideIds:[],reason:'Only exact normal SemVer is accepted in v0.1.',action:'Use x.y.z.'}); return }
    if (descriptor.manifest.kind !== 'extension' || !descriptor.manifest.extensionOf || descriptor.manifest.extensionOf.rootPackId !== root.manifest.packId || !sameVersion(descriptor.manifest.extensionOf.rootVersionRange, root.manifest.version)) conflicts.push({code:'PACK_COMPATIBILITY_MISMATCH',packIds:[owner.manifest.packId,descriptor.manifest.packId],contributionIds:[],overrideIds:[],reason:'Extension root compatibility does not match the selected root.',action:'Select a compatible extension.'})
    if (!selected.some(x=>keyOf(x.manifest.packId,x.manifest.version)===keyOf(descriptor.manifest.packId,descriptor.manifest.version))) selected.push(descriptor)
  }
  for (const request of selection.extensions) { const e=selectedEntry(catalog,request); if (!e) conflicts.push({code:'PACK_NOT_FOUND',packIds:[request.packId],contributionIds:[],overrideIds:[],reason:'Explicit extension is missing.',action:'Register the exact local extension version.'}); else add(e,request,root) }
  for (let i=0;i<selected.length;i++) { const owner=selected[i]; for (const dep of owner.manifest.dependencies) { const e=selectedEntry(catalog,{packId:dep.packId,versionRange:dep.versionRange}); if (!e) { depTrace.push({packId:owner.manifest.packId,dependencyPackId:dep.packId,status:'missing',reasonCode:'PACK_DEPENDENCY_MISSING'}); conflicts.push({code:'PACK_DEPENDENCY_MISSING',packIds:[owner.manifest.packId,dep.packId],contributionIds:[],overrideIds:[],reason:'A declared dependency is absent.',action:'Register the exact dependency.'}) } else { depTrace.push({packId:owner.manifest.packId,dependencyPackId:dep.packId,status:'resolved',reasonCode:'PACK_DEPENDENCY_RESOLVED'}); add(e,{packId:e.manifest.packId,versionRange:e.manifest.version},owner) } } }
  for (const a of selected) for (const c of a.manifest.conflicts) if (selected.some(b=>b.manifest.packId===c.packId && b.manifest.version===c.versionRange)) conflicts.push({code:'PACK_CONFLICT',packIds:[a.manifest.packId,c.packId],contributionIds:[],overrideIds:[],reason:'Manifest declares an explicit conflict.',action:'Remove one conflicting selection.'})
  const nodes=selected.map(e=>keyOf(e.manifest.packId,e.manifest.version)), edges=new Map(nodes.map(n=>[n,new Set<string>()]))
  const edge=(from:string,to:string,reasonCode:string)=>{if(from!==to&&edges.has(from)&&edges.has(to)){edges.get(from)!.add(to);compTrace.push({from,to,reasonCode})}}
  for (const e of selected) { const from=keyOf(e.manifest.packId,e.manifest.version); for(const dep of e.manifest.dependencies){const target=keyOf(dep.packId,dep.versionRange);edge(target,from,'PACK_DEPENDENCY_ORDER')} for(const x of e.manifest.composition.before) {const target=nodes.find(n=>n.startsWith(`${x}@`));if(target)edge(from,target,'PACK_MANIFEST_BEFORE')} for(const x of e.manifest.composition.after){const target=nodes.find(n=>n.startsWith(`${x}@`));if(target)edge(target,from,'PACK_MANIFEST_AFTER')} }
  for (const e of selected.filter(e=>e.manifest.kind==='extension')) edge(keyOf(root.manifest.packId,root.manifest.version),keyOf(e.manifest.packId,e.manifest.version),'ROOT_BEFORE_EXTENSION')
  const order:string[]=[]; const remaining=new Set(nodes); while(remaining.size){const ready=[...remaining].filter(n=>![...edges].some(([from,to])=>remaining.has(from)&&to.has(n))).sort();if(!ready.length){conflicts.push({code:'PACK_ORDER_CYCLE',packIds:[...remaining].map(n=>n.split('@')[0]),contributionIds:[],overrideIds:[],reason:'Composition edges contain a cycle.',action:'Remove the cycle.'});break} const n=ready[0];order.push(n);remaining.delete(n)}
  if (conflicts.length) return {status:'blocked',report:failureReport(selected,depTrace,compTrace,overrideTraces,conflicts,warnings)}
  const ordered=order.map(n=>selected.find(e=>keyOf(e.manifest.packId,e.manifest.version)===n)!); const configs=new Map<string,JsonObject>(); for(const e of ordered){const req=[selection.root,...selection.extensions].find(r=>r.packId===e.manifest.packId&&r.versionRange===e.manifest.version);configs.set(e.manifest.packId,req?.configuration??{})}
  const applied:EffectiveScenario['appliedOverrides']=[], overlay=selection.hostPolicyOverlay
  if(overlay){for(const o of overlay.overrides){const p=ordered.find(e=>e.manifest.packId===o.operation.packId);const pack=p&&packages.get(keyOf(p.manifest.packId,p.manifest.version));const point=pack?.contributions.overridePoints.find(x=>x.id===o.operation.overridePointId);const op=o.operation;const expected=op.kind==='set_configuration'?'configuration':op.kind==='set_declared_default'?'declared_default':'contribution_activation';let reason='';if(!p)reason='PACK_NOT_FOUND';else if(!point)reason='PACK_OVERRIDE_POINT_NOT_FOUND';else if(point.targetKind!==expected)reason='PACK_OVERRIDE_INVALID';else if(op.kind==='set_contribution_activation'&&!op.active&&!point.allowDisable)reason='PACK_OVERRIDE_FORBIDDEN';else if(op.kind!=='set_contribution_activation'&&point.valueSchema?.schemaId==='string'&&typeof op.value!=='string')reason='PACK_OVERRIDE_INVALID';if(reason){overrideTraces.push({hostOverrideId:o.id,packId:op.packId,overridePointId:op.overridePointId,status:'blocked',reasonCode:reason});conflicts.push({code:reason,packIds:[op.packId],contributionIds:[point?.targetPath??''],overrideIds:[o.id],reason:'Host override is outside the declared typed override point.',action:'Use a declared, type-compatible override point.'})}else{overrideTraces.push({hostOverrideId:o.id,packId:op.packId,overridePointId:op.overridePointId,status:'applied',reasonCode:'PACK_OVERRIDE_APPLIED'});applied.push({packId:op.packId,overridePointId:op.overridePointId,hostOverrideId:o.id,contentHash:o.contentHash})}}}
  if(conflicts.length)return {status:'blocked',report:failureReport(selected,depTrace,compTrace,overrideTraces,conflicts,warnings)}
  const categories=['ontologyVocabulary','rulePacks','interpretationScopes','promptSections','reviewTemplates','defaults'] as const; const effective:any={lockHash:'',rootPackId:root.manifest.packId,extensionPackIds:ordered.filter(e=>e.manifest.kind==='extension').map(e=>e.manifest.packId),compositionOrder:order,ontologyVocabulary:[],rulePacks:[],interpretationScopes:[],promptSections:[],reviewTemplates:[],defaults:[],capabilityRequirements:ordered.flatMap(e=>e.manifest.capabilityRequirements),declarations:ordered.map(e=>e.manifest.declarations),appliedOverrides:applied,effectiveScenarioHash:''}
  for(const category of categories) effective[category]=ordered.flatMap(e=>(packages.get(keyOf(e.manifest.packId,e.manifest.version)) as any).contributions?.[category]??[])
  const entries=ordered.map(e=>({packId:e.manifest.packId,version:e.manifest.version,kind:e.manifest.kind,manifestHash:e.manifestHash,packageDigest:e.packageDigest,configurationHash:sha256(configs.get(e.manifest.packId)!),resolvedDependencies:e.manifest.dependencies.map(d=>({packId:d.packId,version:d.versionRange,packageDigest:selectedEntry(catalog,{packId:d.packId,versionRange:d.versionRange})!.packageDigest})),contributionDigests:Object.fromEntries(categories.flatMap(c=>(e.manifest.contributions[c]??[]).map(x=>[`${c}:${x.id}`,x.contentDigest])))}))
  const lockBase={schemaVersion:'voce.scenario-pack-lock/v1alpha1' as const,contractVersion:CONTRACT_VERSION as 'voce.scenario-pack/v1alpha1',resolverVersion:catalog.resolverVersion,catalogHash:catalog.catalogHash,canonicalization:'voce.canonical-json/v1alpha1' as const,rootPackId:root.manifest.packId,entries,compositionOrder:order,...(overlay?{hostPolicyOverlayHash:overlay.overlayHash}:{}),hostOverrideHashes:applied.map(o=>o.contentHash)}; const lock={...lockBase,compositionHash:sha256(json(lockBase)),lockHash:''}; lock.lockHash=hashWithoutSelf(lock,'lockHash');effective.lockHash=lock.lockHash;effective.effectiveScenarioHash=hashWithoutSelf(effective,'effectiveScenarioHash');const reportBase={status:'resolved' as const,lockHash:lock.lockHash,effectiveScenarioHash:effective.effectiveScenarioHash,selected:selected.map(e=>({packId:e.manifest.packId,version:e.manifest.version,kind:e.manifest.kind,packageDigest:e.packageDigest,manifestHash:e.manifestHash})),dependencyTrace:depTrace,compositionTrace:compTrace,overrideTraces,conflicts:[],warnings};const report={...reportBase,reportHash:hashWithoutSelf(reportBase,'reportHash')};return {status:'resolved',lock,effectiveScenario:effective,report}
}

export class MemoryScenarioPackRegistry implements ScenarioPackRegistry {
  private revision=0; private readonly packs=new Map<string,ScenarioPack>(); private readonly descriptors=new Map<string,ScenarioPackDescriptor>(); private readonly policies=[] as ScenarioPackCatalogSnapshot['availabilityPolicies']
  register(source:LocalScenarioPackSource):ScenarioPackDescriptor { if(source.kind!=='memory')throw new Error('PACK_SOURCE_UNSUPPORTED'); const d=descriptorFor(source.definition,source.logicalFiles);const key=keyOf(d.manifest.packId,d.manifest.version);const prior=this.descriptors.get(key);if(prior&&prior.packageDigest!==d.packageDigest)throw new Error('PACK_DUPLICATE_ID_VERSION');this.descriptors.set(key,d);this.packs.set(key,source.definition);this.revision++;return d }
  list():ScenarioPackDescriptor[]{return [...this.descriptors.values()].sort((a,b)=>keyOf(a.manifest.packId,a.manifest.version).localeCompare(keyOf(b.manifest.packId,b.manifest.version)))}
  snapshot():ScenarioPackCatalogSnapshot{const entries=this.list();const base={contractVersion:CONTRACT_VERSION as 'voce.scenario-pack/v1alpha1',resolverVersion:RESOLVER_VERSION,registryRevision:this.revision,entries,availabilityPolicies:this.policies};return {...base,catalogHash:sha256(json(base))}}
  resolve(selection:ScenarioPackSelection,catalog=this.snapshot()):ScenarioPackResolution{return resolveScenario(selection,catalog,this.packs)}
}
export function createScenarioPackRegistry():ScenarioPackRegistry{return new MemoryScenarioPackRegistry()}
