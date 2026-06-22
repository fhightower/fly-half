import express from 'express'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { Store, BadRequest, stepRefs, thenPlaybooks, scanSkills } from './store.js'

export function createApp(rootDir, { skillDirs = [] } = {}) {
  const store = new Store(rootDir)
  // The user's global skills dir is always scanned, ahead of any --skills-dir
  // entries, so it wins on name collisions.
  const allSkillDirs = [path.join(os.homedir(), '.claude', 'skills'), ...skillDirs]
  const app = express()
  app.use(express.json())

  app.get('/api/state', (req, res) => {
    const playbooks = store.listPlaybooks()
    const scenarios = store.readScenarios()
    const skills = scanSkills(allSkillDirs)
    const names = new Set(playbooks.map((p) => p.name))
    const brokenRefs = []
    for (const s of scenarios) {
      for (const ref of thenPlaybooks(s.then)) {
        if (!names.has(ref)) brokenRefs.push({ type: 'scenario', when: s.when, missing: ref })
      }
    }
    for (const p of playbooks) {
      for (const ref of stepRefs(p.steps)) {
        if (!names.has(ref)) brokenRefs.push({ type: 'playbook', name: p.name, missing: ref })
      }
    }
    res.json({ scenarios, playbooks, skills, brokenRefs })
  })

  app.put('/api/scenarios', (req, res) => {
    store.writeScenarios(req.body.scenarios)
    res.json({ ok: true })
  })

  app.put('/api/playbooks/:name', (req, res) => {
    store.writePlaybook(req.params.name, req.body)
    res.json({ ok: true })
  })

  app.delete('/api/playbooks/:name', (req, res) => {
    if (!store.playbookExists(req.params.name)) return res.status(404).json({ error: 'not found' })
    store.deletePlaybook(req.params.name)
    res.json({ ok: true })
  })

  app.get('/api/playbooks/:name/referrers', (req, res) => {
    res.json({ referrers: store.referrers(req.params.name) })
  })

  app.post('/api/playbooks/:name/rename', (req, res) => {
    if (!store.playbookExists(req.params.name)) return res.status(404).json({ error: 'not found' })
    store.renamePlaybook(req.params.name, req.body.newName)
    res.json({ ok: true })
  })

  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  app.use(express.static(dist))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))

  app.use((err, req, res, next) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message })
    if (err?.code === 'ENOENT') return res.status(404).json({ error: 'not found' })
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  })

  return app
}
