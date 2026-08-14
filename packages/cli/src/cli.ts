#!/usr/bin/env node
import { runCli } from './index.js'

const exitCode = await runCli()
process.exitCode = exitCode
