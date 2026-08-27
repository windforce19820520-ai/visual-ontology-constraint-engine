export const CREDENTIAL_PLACEHOLDER = '[REDACTED]'

export function redactCredentialText(text, credentialValue) {
  if (typeof text !== 'string' || !credentialValue || typeof credentialValue !== 'string') return text
  return text.split(credentialValue).join(CREDENTIAL_PLACEHOLDER)
}

export function redactCredentialDiagnosticText(value, credentialValue) {
  return redactCredentialText(String(value || ''), credentialValue)
    .replace(/ark-[A-Za-z0-9-]+/g, CREDENTIAL_PLACEHOLDER)
    .replace(/Bearer\s+\S+/gi, `Bearer ${CREDENTIAL_PLACEHOLDER}`)
    .slice(0, 500)
}

export function redactCredentialDeep(value, credentialValue) {
  if (!credentialValue || typeof credentialValue !== 'string') return value
  if (typeof value === 'string') return redactCredentialText(value, credentialValue)
  if (Array.isArray(value)) return value.map((item) => redactCredentialDeep(item, credentialValue))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactCredentialDeep(item, credentialValue)]))
  }
  return value
}
