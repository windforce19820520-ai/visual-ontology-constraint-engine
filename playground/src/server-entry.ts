import { startPlaygroundServer } from './server.js'

const port = Number(process.env.PLAYGROUND_PORT ?? 4173)
const renderEnabled = process.env.PLAYGROUND_ENABLE_MOCK_RENDER === '1'
await startPlaygroundServer(port, { renderEnabled })
console.log(`VOCE Playground listening on http://127.0.0.1:${port}/playground (${renderEnabled ? 'mock render enabled' : 'render disabled'})`)
