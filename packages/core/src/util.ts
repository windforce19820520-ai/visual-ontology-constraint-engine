import type { JsonObject, JsonValue } from '@voce-engine/contracts'
import { canonicalize, compareCodeUnits, sha256 } from './canonical.js'

export { compareCodeUnits } from './canonical.js'

export function jsonReady(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON_VALUE_INVALID')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => jsonReady(item === undefined ? null : item))
  if (value && typeof value === 'object') {
    const object: JsonObject = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) object[key] = jsonReady(item)
    }
    return object
  }
  throw new Error('JSON_VALUE_INVALID')
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(jsonReady(value))) as T
}

export function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort(compareCodeUnits)
}

export function sortedBy<T>(values: T[], key: (value: T) => string): T[] {
  return values.map((value) => clone(value)).sort((left, right) => compareCodeUnits(key(left), key(right)) || compareCodeUnits(canonicalize(jsonReady(left)), canonicalize(jsonReady(right))))
}

export function hashId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(jsonReady(value)).slice('sha256:'.length, 'sha256:'.length + 24)}`
}