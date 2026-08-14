import { runConsumer } from './consumer.mjs'

const summary = await runConsumer()
console.log(JSON.stringify({ status: summary.status, output: 'clean-room/v0.1.0-rc.1', install: summary.install, packageSources: summary.packageSources, workspaceSymlinks: summary.workspaceSymlinks }))
