#!/usr/bin/env node
import { createApp } from '../server/app.js'

const args = process.argv.slice(2).filter((a) => a !== '--no-open')
const noOpen = process.argv.includes('--no-open')
const rootDir = args[0] || process.cwd()
const port = Number(process.env.PORT) || 4242

const app = createApp(rootDir)
app.listen(port, async () => {
  const url = `http://localhost:${port}`
  console.log(`playbook-gui serving ${rootDir} at ${url}`)
  if (!noOpen) {
    try {
      const { default: open } = await import('open')
      await open(url)
    } catch {
      /* opening the browser is best-effort */
    }
  }
})
