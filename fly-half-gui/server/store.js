import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

// Names become filenames: block path separators, traversal, hidden files,
// control chars, and Windows-reserved characters. Anything else is fine.
function isValidName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    !name.startsWith('.') &&
    name.trim() === name &&
    // eslint-disable-next-line no-control-regex
    !/[/\\:*?"<>|\x00-\x1f]/.test(name)
  )
}

export class Store {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir)
    this.playbooksDir = path.join(this.rootDir, 'playbooks')
    this.scenariosFile = path.join(this.rootDir, 'scenarios.yaml')
    fs.mkdirSync(this.playbooksDir, { recursive: true })
    if (!fs.existsSync(this.scenariosFile)) {
      atomicWrite(this.scenariosFile, yaml.dump({ scenarios: [] }))
    }
  }

  readScenarios() {
    const doc = yaml.load(fs.readFileSync(this.scenariosFile, 'utf8')) || {}
    if (!Array.isArray(doc.scenarios)) return []
    return doc.scenarios.map((s) => {
      const notes = toNotesList(s.ai_agent_notes)
      return notes.length ? { ...s, ai_agent_notes: notes } : s
    })
  }

  writeScenarios(scenarios) {
    validateScenarios(scenarios)
    atomicWrite(this.scenariosFile, yaml.dump({ scenarios: scenarios.map(cleanScenario) }))
  }

  listPlaybooks() {
    return fs
      .readdirSync(this.playbooksDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => this.readPlaybook(f.replace(/\.ya?ml$/, '')))
  }

  playbookPath(name) {
    if (!isValidName(name)) throw new BadRequest(`Invalid playbook name: ${name}`)
    const yml = path.join(this.playbooksDir, `${name}.yml`)
    if (fs.existsSync(yml)) return yml
    return path.join(this.playbooksDir, `${name}.yaml`)
  }

  readPlaybook(name) {
    const doc = yaml.load(fs.readFileSync(this.playbookPath(name), 'utf8')) || {}
    return {
      name,
      description: doc.description || '',
      ai_agent_notes: toNotesList(doc.ai_agent_notes),
      steps: Array.isArray(doc.steps) ? doc.steps : [],
    }
  }

  playbookExists(name) {
    return isValidName(name) && fs.existsSync(this.playbookPath(name))
  }

  writePlaybook(name, { description = '', ai_agent_notes = [], steps = [] }) {
    validateSteps(steps)
    const doc = { name }
    if (description) doc.description = description
    const notes = toNotesList(ai_agent_notes)
    if (notes.length) doc.ai_agent_notes = notes
    doc.steps = steps.map(cleanStep)
    atomicWrite(this.playbookPath(name), yaml.dump(doc, { lineWidth: 120 }))
  }

  deletePlaybook(name) {
    fs.rmSync(this.playbookPath(name))
  }

  // Names of scenarios/playbooks that reference `name`
  referrers(name) {
    const scenarios = this.readScenarios()
      .filter((s) => thenPlaybooks(s.then).includes(name))
      .map((s) => ({ type: 'scenario', when: s.when }))
    const playbooks = this.listPlaybooks()
      .filter((p) => p.name !== name && stepRefs(p.steps).includes(name))
      .map((p) => ({ type: 'playbook', name: p.name }))
    return [...scenarios, ...playbooks]
  }

  renamePlaybook(oldName, newName) {
    if (!isValidName(newName)) throw new BadRequest(`Invalid playbook name: ${newName}`)
    if (this.playbookExists(newName)) throw new BadRequest(`Playbook already exists: ${newName}`)
    const data = this.readPlaybook(oldName)
    const oldPath = this.playbookPath(oldName)
    this.writePlaybook(newName, data)
    fs.rmSync(oldPath)

    // Auto-update all references
    const scenarios = this.readScenarios().map((s) => {
      const names = thenPlaybooks(s.then)
      if (!names.includes(oldName)) return s
      return { ...s, then: names.map((n) => (n === oldName ? newName : n)) }
    })
    this.writeScenarios(scenarios)
    for (const p of this.listPlaybooks()) {
      if (stepRefs(p.steps).includes(oldName)) {
        const steps = p.steps.map((s) => renameInStep(s, oldName, newName))
        this.writePlaybook(p.name, { ...p, steps })
      }
    }
  }
}

// Parse the leading `---`-fenced YAML frontmatter of a markdown file.
// Returns null when the file does not open with a frontmatter block.
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const doc = yaml.load(m[1])
  return doc && typeof doc === 'object' ? doc : null
}

// Discover skills by scanning each dir for `<dir>/<name>/SKILL.md` packages.
// Best-effort: missing dirs, subdirs without SKILL.md, and unparseable
// frontmatter are skipped. Deduped by name across dirs, first dir wins.
export function scanSkills(dirs) {
  const skills = []
  const seen = new Set()
  for (const dir of dirs) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue // missing/unreadable dir
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = path.join(dir, entry.name, 'SKILL.md')
      let fm
      try {
        fm = parseFrontmatter(fs.readFileSync(source, 'utf8'))
      } catch {
        continue // no SKILL.md
      }
      if (!fm) continue // no/invalid frontmatter
      const name = typeof fm.name === 'string' && fm.name ? fm.name : entry.name
      if (seen.has(name)) continue
      seen.add(name)
      skills.push({ name, description: typeof fm.description === 'string' ? fm.description : '', source })
    }
  }
  return skills
}

// Inline references embed a playbook inside step text: "do x then [[other_playbook]]"
const INLINE_REF_RE = /\[\[([^\]]+)\]\]/g

export function inlineRefs(text) {
  return [...String(text).matchAll(INLINE_REF_RE)].map((m) => m[1])
}

// All playbook names referenced by a steps list, via inline [[refs]]
export function stepRefs(steps) {
  const refs = []
  for (const s of steps) {
    if (typeof s === 'string') refs.push(...inlineRefs(s))
    else if (s && typeof s === 'object' && typeof s.text === 'string') refs.push(...inlineRefs(s.text))
  }
  return refs
}

// Notes accept a single string (legacy / hand-edited yaml) or a list of strings;
// the canonical form is a list with blank entries dropped.
export function toNotesList(v) {
  if (Array.isArray(v)) return v.filter((n) => typeof n === 'string' && n.trim() !== '')
  if (typeof v === 'string' && v.trim() !== '') return [v]
  return []
}

// Canonicalize a step before writing: normalize notes, collapse a note-less
// {text} object back to a plain string.
function cleanStep(s) {
  if (typeof s === 'string') return s
  const notes = toNotesList(s.ai_agent_notes)
  return notes.length ? { text: s.text, ai_agent_notes: notes } : s.text
}

function renameInline(text, oldName, newName) {
  return text.replaceAll(`[[${oldName}]]`, `[[${newName}]]`)
}

function renameInStep(s, oldName, newName) {
  if (typeof s === 'string') return renameInline(s, oldName, newName)
  return { ...s, text: renameInline(s.text, oldName, newName) }
}

export class BadRequest extends Error {
  constructor(message) {
    super(message)
    this.status = 400
  }
}

// A scenario's `then` is one playbook name, or a list of them. Normalize to a list.
export function thenPlaybooks(then) {
  if (Array.isArray(then)) return then.filter((n) => typeof n === 'string' && n !== '')
  return then ? [then] : []
}

function isValidThen(v) {
  return typeof v === 'string' || (Array.isArray(v) && v.every((n) => typeof n === 'string'))
}

function validateScenarios(scenarios) {
  if (!Array.isArray(scenarios)) throw new BadRequest('scenarios must be a list')
  for (const s of scenarios) {
    if (
      !s ||
      typeof s.when !== 'string' ||
      !isValidThen(s.then) ||
      !isValidNotes(s.ai_agent_notes) ||
      !Object.keys(s).every((k) => ['when', 'then', 'ai_agent_notes'].includes(k))
    ) {
      throw new BadRequest('each scenario needs a string `when` and a `then` playbook name or list')
    }
  }
}

// Canonicalize a scenario before writing: collapse a single-playbook `then` list
// back to a scalar, normalize notes, drop them when empty.
function cleanScenario(s) {
  const names = thenPlaybooks(s.then)
  const then = names.length <= 1 ? names[0] || '' : names
  const notes = toNotesList(s.ai_agent_notes)
  return notes.length ? { when: s.when, then, ai_agent_notes: notes } : { when: s.when, then }
}

// A step is a plain string, or a {text} object with an optional `ai_agent_notes`
// list of strings (a single string is accepted and normalized to a one-item list).
function isValidNotes(v) {
  return (
    v === undefined ||
    typeof v === 'string' ||
    (Array.isArray(v) && v.every((n) => typeof n === 'string'))
  )
}

function validateSteps(steps) {
  if (!Array.isArray(steps)) throw new BadRequest('steps must be a list')
  for (const s of steps) {
    if (typeof s === 'string') continue
    const ok =
      s &&
      typeof s === 'object' &&
      typeof s.text === 'string' &&
      isValidNotes(s.ai_agent_notes) &&
      Object.keys(s).every((k) => ['text', 'ai_agent_notes'].includes(k))
    if (!ok) {
      throw new BadRequest('each step must be a string or {text, ai_agent_notes?}')
    }
  }
}

// Write via temp file + rename so agents never read a half-written file
function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}
