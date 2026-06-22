#!/usr/bin/env node
import { createApp } from '../server/app.js'

const argv = process.argv.slice(2)
const noOpen = argv.includes('--no-open')

// Collect repeatable `--skills-dir <path>` flags; everything else is positional.
const skillDirs = []
const positional = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--no-open') continue
  if (argv[i] === '--skills-dir') {
    if (argv[i + 1]) skillDirs.push(argv[++i])
    continue
  }
  positional.push(argv[i])
}

const rootDir = positional[0] || process.cwd()
const port = Number(process.env.PORT) || 4242

const app = createApp(rootDir, { skillDirs })
app.listen(port, async () => {
  const url = `http://localhost:${port}`
  console.log(`fly-half-gui serving ${rootDir} at ${url}`)
  if (!noOpen) {
    try {
      const { default: open } = await import('open')
      await open(url)
    } catch {
      /* opening the browser is best-effort */
    }
  }
})
