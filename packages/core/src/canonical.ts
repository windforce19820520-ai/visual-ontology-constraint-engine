import { createHash } from 'node:crypto'
import type { JsonValue } from '@voce/contracts'

function compareCodeUnits(a: string, b: string): number {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index)
    if (difference !== 0) return difference
  }
  return a.length - b.length
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
  return sha256(copy as JsonValue)
}
