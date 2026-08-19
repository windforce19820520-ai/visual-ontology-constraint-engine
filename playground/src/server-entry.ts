import { startPlaygroundServer } from './server.js'

const port = Number(process.env.PLAYGROUND_PORT ?? 4173)
await startPlaygroundServer(port)
console.log(`VOCE Playground listening on http://127.0.0.1:${port}/playground (render disabled)`)
