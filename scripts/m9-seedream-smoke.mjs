import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  RecordingMockTransport,
  SeedreamAdapter,
  VISUAL_COMPOSITION_PATHS,
  compileConstraints,
  compilePromptIR,
  computeArtifactBytesHash,
  computeProviderErrorHash,
  computeProviderResponseEnvelopeHash,
  createRemoteCallAuthorization,
  expandVisualCompositionPreset,
  MOCK_IMAGE_PROFILE,
  sha256,
} from '../packages/core/dist/index.js'
import {
  fixtureM4ConstraintInput,
  fixtureM5CompilationInput,
  fixtureM5Context,
  fixtureM5Scenario,
} from '../packages/testkit/dist/index.js'

const ENDPOINT = process.env.VOCE_SEEDREAM_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const MODEL = process.env.VOCE_SEEDREAM_MODEL || 'doubao-seedream-5-0-pro-260628'
const API_KEY = process.env.VOCE_SEEDREAM_API_KEY || ''
const PREFLIGHT_ONLY = process.argv.includes('--preflight-only')
const PREPARE_ASSETS_ONLY = process.argv.includes('--prepare-assets-only')
const COMPOSITION_ACCEPTANCE = process.argv.includes('--composition-acceptance')
const TIMEOUT_MS = 360_000
const MAX_REAL_CALLS = COMPOSITION_ACCEPTANCE ? 3 : 2
const CREDENTIAL_REF = 'env:VOCE_SEEDREAM_API_KEY'
const ROOT = resolve('m9-smoke-artifacts')
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')
const RUN_DIR = join(ROOT, RUN_ID)
const INPUT_DIR = join(ROOT, 'input')
const RESULT_DIR = join(RUN_DIR, 'results')

const INPUT_SPECS = {
  person: {
    id: 'user-synthetic-person',
    stem: 'person-01',
    binding: 'Preserve identity, face, hair, body, pose, campus background, and shoes.',
  },
  garment: {
    id: 'user-synthetic-top',
    stem: 'top-01',
    binding: 'Copy the navy blazer, blue striped shirt, dark tie, black knit layer, gold buttons, and badge.',
  },
  skirt: {
    id: 'user-synthetic-skirt',
    stem: 'skirt-01',
    binding: 'Copy only the white tiered eyelet ruffle mini skirt, blue waistband, and drawstring; ignore visible hands and upper garments.',
  },
  costume: {
    id: 'user-synthetic-cosplay',
    stem: 'cosplay-01',
    binding: 'Use the blue hair, horn ornaments, makeup, earrings, arm ornaments, blue-white-gold costume, and visible signature weapon; preserve the weapon type, long silhouette, blue-gold color scheme, scale, and hand assignment; ignore text, logos, ratings, UI, and graphic background.',
  },
}

const adapterPin = { id: 'voce.seedream', version: '0.1.0-rc.4', digest: sha256({ id: 'voce.seedream', version: '0.1.0-rc.4' }) }
const profilePin = { id: 'voce.seedream.domestic.pro', version: '2026-06-28', digest: sha256({ endpoint: ENDPOINT, model: MODEL, referenceLimit: 10, outputCount: 1 }) }

const jsonReady = (value) => JSON.parse(JSON.stringify(value))
const safeText = (value) => String(value || '').replace(/ark-[A-Za-z0-9-]+/g, '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 500)

const COMPOSITION_GLOSSES = {
  'medium-shot': 'Use an intentional half-body medium shot, approximately waist-up, with the face, upper costume, hands, and visible signature weapon readable.',
  'full-shot': 'Use a full-body shot with both feet inside the frame and the entire signature weapon visibly retained.',
  'long-shot': 'Use a long shot in which the character remains identifiable while the surrounding environment is clearly established.',
  'low-angle': 'Place the camera below the subject and look upward with a clearly visible low-angle perspective.',
  'rule-of-thirds': 'Place the character on a rule-of-thirds line or intersection instead of centering by default.',
  'centered-symmetry': 'Use a centered, bilaterally balanced composition.',
  'leading-lines': 'Use visible scene geometry such as rails, paths, or architecture as leading lines toward the character.',
  'diagonal-composition': 'Use strong diagonal visual flow through the character, weapon, or scene geometry.',
  'reflection-composition': 'Look across calm foreground water toward the cosplayer on the dry far bank; keep the shoreline below both feet and align the readable water reflection directly below the cosplayer.',
  'telephoto-compression': 'Use a telephoto-compressed perspective with reduced apparent depth spacing.',
  'environmental-portrait': 'Create an environmental portrait in which the character and surrounding location both contribute to the image.',
}

const COSPLAY_FIDELITY_PROMPT = 'Create a realistic cosplay transformation from two references. Preserve from the first reference the adult person identity, facial structure, and body proportions; do not inherit that person\'s original clothing as the target costume. From the second reference reproduce the blue hairstyle, horn-like hair ornaments, makeup, earrings, arm ornaments, the complete blue-white-gold costume design, and the visible signature weapon. Preserve the weapon type, long primary silhouette, blue-gold color scheme, character-relative scale, major signature details, hand assignment, and visible presence. Do not inherit the illustrated character face as the real-person identity. Adapt the illustrated styling into a coherent wearable photorealistic cosplay. Ignore all source text, logos, ratings, interface elements, and graphic background. Add no extra people, unrelated props, text, or watermark.'

function detectMediaType(bytes) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  return undefined
}

async function ensureDirectories() {
  await mkdir(INPUT_DIR, { recursive: true })
  await mkdir(RESULT_DIR, { recursive: true })
}

async function fetchBytes(url, timeoutMs = 60_000) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'VOCE-M9-Smoke/0.1' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading provider result asset`)
  return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: response.headers.get('content-type')?.split(';')[0] }
}

function artifactFor(source, bytes) {
  return {
    id: source.id,
    storeId: 'm9-local-inputs',
    contentHash: computeArtifactBytesHash(bytes),
    mediaType: source.mediaType,
    byteLength: bytes.byteLength,
    role: 'reference-image',
    resolverId: 'm9-local-files',
    availability: 'available',
    retentionClass: 'local-smoke',
    redactionPolicy: 'user-authorized-local-input-hash',
  }
}

async function loadInputs(requiredNames = Object.keys(INPUT_SPECS)) {
  const entries = await readdir(INPUT_DIR, { withFileTypes: true })
  const result = {}
  for (const name of requiredNames) {
    const spec = INPUT_SPECS[name]
    if (!spec) throw new Error(`Unknown input specification: ${name}.`)
    const started = performance.now()
    const matches = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().startsWith(`${spec.stem.toLowerCase()}.`) && ['.png', '.jpg', '.jpeg'].includes(extname(entry.name).toLowerCase()))
    if (matches.length !== 1) throw new Error(`Expected exactly one ${spec.stem}.png/.jpg/.jpeg in ${relative(process.cwd(), INPUT_DIR)}, found ${matches.length}.`)
    const path = join(INPUT_DIR, matches[0].name)
    const bytes = new Uint8Array(await readFile(path))
    const mediaType = detectMediaType(bytes)
    if (!mediaType) throw new Error(`${matches[0].name} is not a supported PNG or JPEG image.`)
    if (bytes.byteLength > 30 * 1024 * 1024) throw new Error(`${matches[0].name} exceeds Seedream's 30 MB input limit.`)
    const source = { ...spec, fileName: matches[0].name, mediaType, provenance: 'user-provided-ai-generated' }
    result[name] = {
      source,
      path,
      bytes,
      artifact: artifactFor(source, bytes),
      elapsedMs: Math.round(performance.now() - started),
    }
  }
  return result
}

function compileCompositionClosure(caseId, selections, sceneDescription) {
  const scenario = fixtureM5Scenario()
  scenario.ontologyVocabulary = [{
    packId: 'fixture.m5',
    contributionKind: 'ontologyVocabulary',
    contributionId: 'fixture.m5.composition-vocabulary',
    contentDigest: sha256({ fixture: 'composition-vocabulary' }),
    paths: VISUAL_COMPOSITION_PATHS,
  }]
  const scenarioHashBase = jsonReady(scenario)
  delete scenarioHashBase.effectiveScenarioHash
  scenario.effectiveScenarioHash = sha256(scenarioHashBase)
  const context = fixtureM5Context({ effectiveScenarioHash: scenario.effectiveScenarioHash })
  const changeIntents = selections.flatMap((selection) => expandVisualCompositionPreset(selection.presetId, {
    inputs: selection.inputs,
    sourceHintIds: [`rc4-real-provider:${caseId}`],
  }).map((intent) => ({
    ...intent,
    id: `${caseId}.${intent.id}`,
    importance: selection.importance ?? intent.importance,
  })))
  const constraintIR = compileConstraints(fixtureM4ConstraintInput({ context, effectiveScenario: scenario, changeIntents }))
  if (constraintIR.status !== 'ok') throw new Error(`RC4_COMPOSITION_CONSTRAINTS_BLOCKED:${caseId}`)
  const promptIR = compilePromptIR(fixtureM5CompilationInput(MOCK_IMAGE_PROFILE, {
    context,
    effectiveScenario: scenario,
    constraintIR,
    objective: `Create the approved cosplay scene for ${caseId}.`,
    positiveDescription: sceneDescription,
  }))
  const selectedPresetIds = selections.map((selection) => selection.presetId)
  const compositionSections = promptIR.sections.filter((section) => section.sourceIds.some((sourceId) => selectedPresetIds.includes(sourceId)))
  const activePresetIds = selectedPresetIds.filter((presetId) => compositionSections.some((section) => section.sourceIds.includes(presetId)))
  const excludedPresetIds = selectedPresetIds.filter((presetId) => constraintIR.constraints.some((constraint) => constraint.status === 'unsatisfied' && constraint.sourceIds.includes(presetId)))
  const providerInstructions = activePresetIds.map((presetId) => COMPOSITION_GLOSSES[presetId]).filter(Boolean)
  const prompt = [
    COSPLAY_FIDELITY_PROMPT,
    sceneDescription,
    'Apply the following VOCE-generated typed composition closure:',
    ...compositionSections.map((section) => section.content),
    'Provider-facing rendering of the active composition constraints:',
    ...providerInstructions,
  ].join('\n')
  return {
    prompt,
    composition: {
      selectedPresetIds,
      activePresetIds,
      excludedPresetIds,
      promptIRHash: promptIR.deterministicSignature,
      constraintIRHash: constraintIR.deterministicSignature,
      compositionSections: compositionSections.map((section) => ({ content: section.content, constraintIds: section.constraintIds, sourceIds: section.sourceIds })),
      excludedConstraints: promptIR.excludedConstraints,
      providerInstructions,
      providerPromptHash: sha256({ prompt }),
    },
  }
}

function compositionDefinitions() {
  const cases = [
    {
      id: 'rc4-lakeside-medium-shot-conflict',
      title: 'RC.4 lakeside half-body conflict closure',
      sceneDescription: 'Place the recognizable cosplayer beside a calm lake with shoreline, water, and distant landscape visibly establishing the location. Keep the intended half-body character presentation and make the environment supportive rather than dominant.',
      selections: [
        { presetId: 'medium-shot', importance: 'required' },
        { presetId: 'close-up', importance: 'preferred' },
        { presetId: 'rule-of-thirds' },
        { presetId: 'environmental-portrait' },
      ],
      expectedExcludedPresetIds: ['close-up'],
      acceptanceCriteria: ['half-body medium shot', 'close-up preference absent', 'lakeside visible', 'rule-of-thirds placement', 'identity and costume retained', 'signature weapon visible'],
    },
    {
      id: 'rc4-low-angle-diagonal-full-shot',
      title: 'RC.4 low-angle diagonal full shot',
      sceneDescription: 'Place the cosplayer on a modern pedestrian bridge or plaza with rails and paving that can form strong directional geometry. Keep an opaque photorealistic environment.',
      selections: [
        { presetId: 'full-shot', importance: 'required' },
        { presetId: 'low-angle' },
        { presetId: 'diagonal-composition' },
        { presetId: 'leading-lines' },
      ],
      expectedExcludedPresetIds: [],
      acceptanceCriteria: ['full body and both feet visible', 'low camera angle', 'diagonal visual flow', 'leading scene lines', 'identity and costume retained', 'entire signature weapon visible'],
    },
    {
      id: 'rc4-water-reflection-telephoto-long-shot',
      title: 'RC.4 water reflection telephoto long shot',
      sceneDescription: 'Look across calm foreground water toward the cosplayer standing on the dry far bank. Keep the shoreline below both feet and align the readable reflection directly below the cosplayer. Use an opaque photorealistic scene with distant shoreline layers suitable for compressed perspective.',
      selections: [
        { presetId: 'long-shot', importance: 'required' },
        { presetId: 'reflection-composition' },
        { presetId: 'telephoto-compression' },
        { presetId: 'centered-symmetry' },
      ],
      expectedExcludedPresetIds: [],
      acceptanceCriteria: ['long shot with environment visible', 'dry far-bank shoreline below both feet', 'water reflection aligned below person', 'telephoto-compressed depth', 'centered symmetry', 'character and costume identifiable', 'signature weapon visible'],
    },
  ]
  return cases.map((definition) => {
    const closure = compileCompositionClosure(definition.id, definition.selections, definition.sceneDescription)
    const expectedExcluded = [...definition.expectedExcludedPresetIds].sort()
    const actualExcluded = [...closure.composition.excludedPresetIds].sort()
    const expectedActive = definition.selections.map((selection) => selection.presetId).filter((presetId) => !expectedExcluded.includes(presetId)).sort()
    const actualActive = [...closure.composition.activePresetIds].sort()
    if (JSON.stringify(actualExcluded) !== JSON.stringify(expectedExcluded) || JSON.stringify(actualActive) !== JSON.stringify(expectedActive)) throw new Error(`RC4_COMPOSITION_CLOSURE_UNEXPECTED:${definition.id}`)
    return { ...definition, references: ['person', 'costume'], ...closure }
  })
}

class LocalFileAssetSink {
  constructor(directory) {
    this.directory = directory
    this.items = []
  }

  async put(input) {
    const bytes = new Uint8Array(input.bytes)
    const hash = computeArtifactBytesHash(bytes)
    const extension = input.mediaType === 'image/png' ? '.png' : input.mediaType === 'image/jpeg' ? '.jpg' : '.bin'
    const path = join(this.directory, `${hash.slice('sha256:'.length, 'sha256:'.length + 24)}${extension}`)
    await writeFile(path, bytes)
    const artifact = {
      id: `m9-output-${this.items.length + 1}`,
      storeId: 'm9-local-results',
      contentHash: hash,
      mediaType: input.mediaType,
      byteLength: bytes.byteLength,
      role: input.role,
      resolverId: 'm9-local-files',
      availability: 'available',
      retentionClass: 'local-smoke',
      redactionPolicy: 'safe-hash-only',
    }
    this.items.push({ artifact, path, bytes })
    return jsonReady(artifact)
  }

  async putRemote(input) {
    const downloaded = await fetchBytes(input.url, TIMEOUT_MS)
    const detectedMediaType = detectMediaType(downloaded.bytes)
    if (!detectedMediaType) throw new Error('Provider result URL did not return a supported PNG or JPEG image.')
    return this.put({ bytes: downloaded.bytes, mediaType: detectedMediaType, role: input.role, sourceHash: input.sourceHash })
  }

  async resolve(handle) {
    const item = this.items.find((candidate) => candidate.artifact.id === handle.id)
    return item ? new Uint8Array(item.bytes) : undefined
  }
}

function providerError(requestHash, code, message, details = {}, submissionUnknown = false) {
  const errorBase = {
    schemaVersion: 'voce.provider-error/v1alpha1',
    code,
    message: safeText(message),
    retryable: false,
    submissionUnknown,
    safeDetails: jsonReady(details),
  }
  const error = { ...errorBase, errorHash: computeProviderErrorHash(errorBase) }
  const base = {
    schemaVersion: 'voce.provider-response-envelope/v1alpha1',
    requestHash,
    status: submissionUnknown ? 'submission_unknown' : 'failed',
    outputArtifactIds: [],
    error,
  }
  return { ...base, responseHash: computeProviderResponseEnvelopeHash(base) }
}

class FetchSeedreamTransport {
  constructor() {
    this.id = 'voce.m9.fetch-transport'
    this.mode = 'network'
    this.callCount = 0
    this.receipts = []
  }

  async send(request, context) {
    if (this.callCount >= MAX_REAL_CALLS) return providerError(request.requestHash, 'M9_CALL_LIMIT_EXCEEDED', 'M9 real-call limit was reached.')
    if (!context.credential?.value) return providerError(request.requestHash, 'ADAPTER_CREDENTIAL_MISSING', 'M9 credential was not injected.')
    this.callCount += 1
    const startedAt = new Date().toISOString()
    const started = performance.now()
    try {
      const response = await fetch(request.destination, {
        method: 'POST',
        signal: AbortSignal.timeout(Math.min(context.timeoutMs || TIMEOUT_MS, TIMEOUT_MS)),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.credential.value}`,
          'X-Client-Request-Id': request.idempotencyKey,
        },
        body: JSON.stringify(request.payload),
      })
      const elapsedMs = Math.round(performance.now() - started)
      const text = await response.text()
      let body
      try { body = text ? JSON.parse(text) : {} } catch { body = {} }
      const providerRequestId = response.headers.get('x-request-id') || body?.request_id || body?.id
      const receipt = { startedAt, completedAt: new Date().toISOString(), elapsedMs, httpStatus: response.status, providerRequestId: providerRequestId || null, requestHash: request.requestHash }
      this.receipts.push(receipt)
      if (!response.ok) {
        const code = safeText(body?.error?.code || body?.code || `HTTP_${response.status}`)
        const message = safeText(body?.error?.message || body?.message || `Seedream returned HTTP ${response.status}`)
        return providerError(request.requestHash, code || 'PROVIDER_HTTP_ERROR', message, { httpStatus: response.status, providerRequestId: providerRequestId || null })
      }
      const base = {
        schemaVersion: 'voce.provider-response-envelope/v1alpha1',
        requestHash: request.requestHash,
        status: 'succeeded',
        ...(providerRequestId ? { providerRequestId } : {}),
        body,
        outputArtifactIds: [],
      }
      return { ...base, responseHash: computeProviderResponseEnvelopeHash(base) }
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started)
      const submissionUnknown = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      this.receipts.push({ startedAt, completedAt: new Date().toISOString(), elapsedMs, httpStatus: null, providerRequestId: null, requestHash: request.requestHash, failure: safeText(error?.message) })
      return providerError(request.requestHash, submissionUnknown ? 'M9_SUBMISSION_UNKNOWN' : 'M9_NETWORK_FAILURE', error?.message || 'Network request failed.', { elapsedMs }, submissionUnknown)
    }
  }

  async lookup(request) {
    return providerError(request.requestHash, 'M9_LOOKUP_UNSUPPORTED', 'M9 smoke does not automatically resubmit or poll unknown submissions.')
  }
}

function authorizationFor(caseId, prompt, artifacts) {
  const inputHash = sha256({ caseId, prompt, artifactHashes: artifacts.map((artifact) => artifact.contentHash), model: MODEL })
  return createRemoteCallAuthorization({
    schemaVersion: 'voce.remote-call-authorization/v1alpha1',
    id: `m9-auth-${caseId}`,
    caseId,
    caseRevision: 1,
    contextHash: sha256({ runId: RUN_ID, caseId }),
    stepId: `generate-${caseId}`,
    purpose: 'generation',
    inputHash,
    permittedArtifactHashes: artifacts.map((artifact) => artifact.contentHash).sort(),
    permittedScopeIds: COMPOSITION_ACCEPTANCE ? ['apparel', 'camera.composition', 'camera.framing', 'camera.lens', 'camera.view', 'character.signatureProps.primary', 'environment.background', 'person.identity'] : ['person.identity', 'apparel'],
    constraintIds: COMPOSITION_ACCEPTANCE ? ['m9-multi-reference', 'm9-one-output', 'm9-opaque-output', 'rc4-composition-closure'] : ['m9-multi-reference', 'm9-one-output', 'm9-opaque-output'],
    modelId: MODEL,
    modelVersion: MODEL,
    adapterId: adapterPin.id,
    adapterDigest: adapterPin.digest,
    profileDigest: profilePin.digest,
    destination: ENDPOINT,
    region: 'cn-beijing',
    dataCategories: ['prompt', 'reference_image'],
    maximumCalls: 1,
    maximumRetries: 0,
    timeoutMs: TIMEOUT_MS,
    idempotencyKey: sha256({ runId: RUN_ID, caseId }),
    authority: 'explicit-user-authorization',
    authorizedBy: 'repository-owner',
    authorizedAt: new Date().toISOString(),
  })
}

async function runPreflight() {
  const transport = new RecordingMockTransport()
  const sink = new LocalFileAssetSink(RESULT_DIR)
  const adapter = new SeedreamAdapter({ endpoint: ENDPOINT, credentialRef: CREDENTIAL_REF, model: MODEL, modelVersion: MODEL, adapter: adapterPin, profile: profilePin, destination: ENDPOINT, region: 'cn-beijing', endpointProfile: 'domestic', transport, assetSink: sink })
  const cases = [
    { name: 'n-greater-than-one', input: { prompt: 'invalid', n: 2 }, expected: 'SEEDREAM_CARDINALITY_INVALID' },
    { name: 'sequential-parameter', input: { prompt: 'invalid', sequential_image_generation: false }, expected: 'SEEDREAM_FIELD_UNSUPPORTED' },
    { name: 'wrong-reference-field', input: { prompt: 'invalid', image_urls: ['https://example.invalid/a.png'] }, expected: 'SEEDREAM_FIELD_UNSUPPORTED' },
    { name: 'too-many-references', input: { prompt: 'invalid', image: Array.from({ length: 11 }, () => 'data:image/png;base64,AA==') }, expected: 'SEEDREAM_REFERENCE_LIMIT_EXCEEDED' },
    { name: 'transparent-product-field', input: { prompt: 'invalid', background: 'transparent' }, expected: 'SEEDREAM_FIELD_UNSUPPORTED' },
  ]
  const results = []
  for (const item of cases) {
    const auth = authorizationFor(`preflight-${item.name}`, item.name, [])
    const result = await adapter.generate(item.input, auth, { credential: { ref: CREDENTIAL_REF, value: 'not-a-real-key' } })
    results.push({ name: item.name, expectedFailureCode: item.expected, actualFailureCode: result.failureCode, passed: result.failureCode === item.expected })
  }
  return { cases: results, networkCalls: transport.calls.length, passed: results.every((item) => item.passed) && transport.calls.length === 0 }
}

async function runCase(definition, sources, adapter, transport, sink) {
  const references = definition.references.map((name) => sources[name])
  const artifacts = references.map((item) => item.artifact)
  const input = {
    prompt: definition.prompt,
    image: artifacts,
    referenceArtifacts: references.map((item) => ({ artifact: item.artifact, bytes: item.bytes })),
    n: 1,
    output_format: 'jpeg',
    size: '2K',
    watermark: false,
  }
  const authorization = authorizationFor(definition.id, definition.prompt, artifacts)
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const result = await adapter.generate(input, authorization, { credential: { ref: CREDENTIAL_REF, value: API_KEY }, timeoutMs: TIMEOUT_MS })
  const elapsedMs = Math.round(performance.now() - started)
  const saved = result.artifacts.map((artifact) => {
    const item = sink.items.find((candidate) => candidate.artifact.id === artifact.id)
    return { artifact, path: item ? relative(process.cwd(), item.path).replace(/\\/g, '/') : null }
  })
  return {
    caseId: definition.id,
    title: definition.title,
    startedAt,
    completedAt: new Date().toISOString(),
    elapsedMs,
    status: result.status,
    failureCode: result.failureCode || null,
    requestReceipt: transport.receipts.at(-1) || null,
    response: result.response,
    inputArtifacts: artifacts,
    outputArtifacts: saved,
    ...(definition.composition ? { composition: definition.composition, acceptanceCriteria: definition.acceptanceCriteria } : {}),
  }
}

async function writeReport(report) {
  const reportPath = join(RUN_DIR, 'm9-report.json')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const lines = [
    COMPOSITION_ACCEPTANCE ? '# RC.4 Seedream composition acceptance report' : '# M9 Seedream real-smoke report',
    '',
    `- Run: ${report.runId}`,
    `- Endpoint profile: domestic`,
    `- Model: ${report.model}`,
    `- Preflight: ${report.preflight.passed ? 'PASS' : 'FAIL'} (${report.preflight.networkCalls} network calls)`,
    `- Real calls: ${report.realCallCount}`,
    '',
    '## Cases',
    '',
    ...report.cases.flatMap((item) => [
      `### ${item.title}`,
      '',
      `- Status: ${item.status}`,
      `- Elapsed: ${item.elapsedMs} ms`,
      `- Failure: ${item.failureCode || 'none'}`,
      `- Result: ${item.outputArtifacts.map((artifact) => artifact.path).filter(Boolean).join(', ') || 'none'}`,
      '',
    ]),
  ]
  await writeFile(join(RUN_DIR, 'summary.md'), `${lines.join('\n')}\n`, 'utf8')
  await writeFile(join(ROOT, COMPOSITION_ACCEPTANCE ? 'latest-composition.json' : 'latest.json'), `${JSON.stringify({ runId: RUN_ID, reportPath: relative(process.cwd(), reportPath).replace(/\\/g, '/'), completedAt: report.completedAt }, null, 2)}\n`, 'utf8')
  return reportPath
}

async function main() {
  await ensureDirectories()
  const plannedCompositionDefinitions = COMPOSITION_ACCEPTANCE ? compositionDefinitions() : undefined
  const preflight = await runPreflight()
  const requiredInputNames = COMPOSITION_ACCEPTANCE ? ['person', 'costume'] : Object.keys(INPUT_SPECS)
  const baseReport = { schemaVersion: 'voce.m9-seedream-smoke/v1alpha1', runId: RUN_ID, startedAt: new Date().toISOString(), mode: COMPOSITION_ACCEPTANCE ? 'rc4-composition-acceptance' : 'm9-standard', endpointProfile: 'domestic', endpointHost: new URL(ENDPOINT).host, model: MODEL, maximumRealCalls: MAX_REAL_CALLS, credentialRecorded: false, preflight, expectedInputs: requiredInputNames.map((name) => INPUT_SPECS[name]), ...(plannedCompositionDefinitions ? { compositionPlans: plannedCompositionDefinitions.map((definition) => ({ caseId: definition.id, title: definition.title, acceptanceCriteria: definition.acceptanceCriteria, composition: definition.composition })) } : {}), cases: [] }
  if (!preflight.passed) {
    const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, failureReason: 'Offline parameter interception failed.' }
    console.error(`M9 preflight failed. Report: ${await writeReport(report)}`)
    process.exitCode = 1
    return
  }
  if (PREFLIGHT_ONLY) {
    const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, failureReason: null }
    console.log(`M9 preflight passed without network calls. Report: ${await writeReport(report)}`)
    return
  }
  if (PREPARE_ASSETS_ONLY) {
    try {
      const sources = await loadInputs(requiredInputNames)
      const preparedSources = Object.fromEntries(Object.entries(sources).map(([name, item]) => [name, { path: relative(process.cwd(), item.path).replace(/\\/g, '/'), contentHash: item.artifact.contentHash, byteLength: item.artifact.byteLength, elapsedMs: item.elapsedMs }]))
      const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, preparedSources, failureReason: null }
      console.log(`M9 local inputs validated without provider calls. Report: ${await writeReport(report)}`)
    } catch (error) {
      const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, failureReason: safeText(error?.message) }
      console.error(`Local input validation failed. Report: ${await writeReport(report)}`)
      process.exitCode = 3
    }
    return
  }
  if (!API_KEY) {
    const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, failureReason: 'VOCE_SEEDREAM_API_KEY was not injected.' }
    console.error(`M9 credential missing. Report: ${await writeReport(report)}`)
    process.exitCode = 2
    return
  }
  let sources
  try { sources = await loadInputs(requiredInputNames) } catch (error) {
    const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: 0, failureReason: safeText(error?.message) }
    console.error(`Local input validation failed. Report: ${await writeReport(report)}`)
    process.exitCode = 3
    return
  }
  const sink = new LocalFileAssetSink(RESULT_DIR)
  const transport = new FetchSeedreamTransport()
  const adapter = new SeedreamAdapter({ endpoint: ENDPOINT, credentialRef: CREDENTIAL_REF, model: MODEL, modelVersion: MODEL, adapter: adapterPin, profile: profilePin, destination: ENDPOINT, region: 'cn-beijing', endpointProfile: 'domestic', transport, assetSink: sink })
  const definitions = plannedCompositionDefinitions ?? [
    {
      id: 'm9-virtual-tryon',
      title: 'Multi-reference virtual try-on',
      references: ['person', 'garment', 'skirt'],
      prompt: 'Create a commercial virtual try-on image from three references. Preserve from the first reference the adult person identity, facial features, long dark hair, body proportions, standing pose, campus background, and white shoes. Replace the original T-shirt, shorts, and belt. Copy from the second reference the navy blazer, blue striped shirt, dark tie, black knit layer, gold buttons, and badge. Copy from the third reference only the white tiered eyelet ruffle mini skirt, blue waistband, and drawstring; ignore the hands and any blazer or upper garments visible in that reference. Make the combined outfit coherent and wearable, keep a photorealistic full-body fashion-photo result, and add no extra people, unrelated text, or watermark.',
    },
    {
      id: 'm9-cosplay',
      title: 'Multi-reference character cosplay',
      references: ['person', 'costume'],
      prompt: 'Create a realistic cosplay transformation from two references. Preserve from the first reference the adult person identity, facial structure, body proportions, and half-body presentation; do not inherit that person\'s original clothing as the target costume. From the second reference reproduce the blue hairstyle, horn-like hair ornaments, makeup, earrings, arm ornaments, the complete visible blue-white-gold costume design, and the visible signature weapon. Preserve the weapon type, long primary silhouette, blue-gold color scheme, character-relative scale, major signature details, hand assignment, and visible presence. Do not inherit the illustrated character face as the real-person identity. Adapt the illustrated character styling into a coherent wearable photorealistic cosplay while keeping the person recognizable. Ignore all source text, logos, ratings, interface elements, and graphic background. Use a clean opaque photographic background and add no extra people, unrelated props, text, or watermark.',
    },
  ]
  const cases = []
  for (const definition of definitions) {
    console.log(`Starting ${definition.title}...`)
    const result = await runCase(definition, sources, adapter, transport, sink)
    cases.push(result)
    if (result.status === 'failed' && Number(result.requestReceipt?.httpStatus) >= 400 && Number(result.requestReceipt?.httpStatus) < 500) {
      console.error('Stopping remaining cases after a non-retryable provider request error.')
      break
    }
  }
  const report = { ...baseReport, completedAt: new Date().toISOString(), realCallCount: transport.callCount, cases, failureReason: cases.every((item) => item.status === 'succeeded') ? null : 'One or more real provider cases failed.' }
  const reportPath = await writeReport(report)
  console.log(`M9 finished. Real calls: ${transport.callCount}. Report: ${reportPath}`)
  if (report.failureReason) process.exitCode = 4
}

main().catch(async (error) => {
  await ensureDirectories().catch(() => {})
  const report = { schemaVersion: 'voce.m9-seedream-smoke/v1alpha1', runId: RUN_ID, completedAt: new Date().toISOString(), endpointHost: (() => { try { return new URL(ENDPOINT).host } catch { return 'invalid' } })(), model: MODEL, credentialRecorded: false, realCallCount: 0, preflight: { passed: false, networkCalls: 0, cases: [] }, cases: [], failureReason: safeText(error?.message) }
  await writeReport(report).catch(() => {})
  console.error(`M9 failed safely: ${safeText(error?.message)}`)
  process.exitCode = 1
})
