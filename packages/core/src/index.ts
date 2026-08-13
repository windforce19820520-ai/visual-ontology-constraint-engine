import { createHash } from 'node:crypto'
import type { JsonValue } from '@voce/contracts'
export { type JsonValue } from '@voce/contracts'
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('CANONICAL_JSON_NUMBER_INVALID'); return JSON.stringify(value) }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}
export function sha256(value: JsonValue): string { return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}` }
export function hashWithoutSelf<T extends Record<string, unknown>>(value:T, field:string):string { const copy={...value}; delete copy[field]; return sha256(copy as JsonValue) }
export function assertRecord(value: unknown, label='value'): asserts value is Record<string, unknown> { if (value===null || typeof value!=='object' || Array.isArray(value)) throw new Error(`${label}: expected object`) }
export function validateRequired(value: unknown, fields: string[], label='value'): void { assertRecord(value,label); for (const field of fields) if (!(field in value)) throw new Error(`${label}.${field}: required`) }
export function validateManifest(value: unknown): void {
  validateRequired(value,['schemaVersion','packId','version','kind','declarations','permissions','distributionInventory'],'ScenarioPackManifest'); const m=value as Record<string,unknown>
  if (m.schemaVersion!=='voce.scenario-pack/v1alpha1') throw new Error('PACK_SCHEMA_UNSUPPORTED')
  if (typeof m.packId!=='string' || !m.packId || typeof m.version!=='string' || !m.version) throw new Error('PACK_MANIFEST_INVALID')
  if (m.kind!=='root' && m.kind!=='extension') throw new Error('PACK_KIND_INVALID')
  const declarations=m.declarations as Record<string,unknown>; const permissions=m.permissions as Record<string,unknown>
  for (const key of ['containsExecutableScenarioCode','distributionLifecycleScripts','containsExecutableFiles','fixturesRequireNetwork','fixturesRequireRealProvider']) if (declarations?.[key]!==false) throw new Error('PACK_DECLARATION_INVALID')
  for (const key of ['network','remoteCalls','secrets','filesystemWrite','mutateConfirmedFacts','authorizeCalls','overrideHostPolicy','selectProvider','changeBudgets']) if (permissions?.[key]!==false) throw new Error('PACK_PERMISSION_FORBIDDEN')
  if (!Array.isArray(m.distributionInventory) || (m.distributionInventory as unknown[]).some(e => (e as Record<string,unknown>).path==='scenario-pack/manifest.json')) throw new Error('PACK_MANIFEST_INVALID')
}
