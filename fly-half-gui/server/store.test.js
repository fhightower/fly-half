import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanSkills } from './store.js'

let root
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fly-half-skills-'))
})

// Write a skill package <dir>/<name>/SKILL.md with the given frontmatter body
function writeSkill(dir, name, frontmatter) {
  const d = path.join(dir, name)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'SKILL.md'), `---\n${frontmatter}\n---\nbody text\n`)
  return path.join(d, 'SKILL.md')
}

describe('scanSkills', () => {
  it('parses name and description from SKILL.md frontmatter', () => {
    const src = writeSkill(root, 'review-pr', 'name: review-pr\ndescription: Review a GitHub PR')
    expect(scanSkills([root])).toEqual([
      { name: 'review-pr', description: 'Review a GitHub PR', source: src },
    ])
  })

  it('falls back to the directory name when frontmatter omits name', () => {
    writeSkill(root, 'tidy', 'description: Tidy things up')
    expect(scanSkills([root])[0]).toMatchObject({ name: 'tidy', description: 'Tidy things up' })
  })

  it('defaults description to empty string when absent', () => {
    writeSkill(root, 'bare', 'name: bare')
    expect(scanSkills([root])[0]).toMatchObject({ name: 'bare', description: '' })
  })

  it('skips a subdirectory without a SKILL.md', () => {
    fs.mkdirSync(path.join(root, 'not-a-skill'), { recursive: true })
    writeSkill(root, 'real', 'name: real\ndescription: d')
    expect(scanSkills([root]).map((s) => s.name)).toEqual(['real'])
  })

  it('skips a missing directory without throwing', () => {
    expect(scanSkills([path.join(root, 'does-not-exist')])).toEqual([])
  })

  it('skips a skill whose frontmatter is unparseable', () => {
    const d = path.join(root, 'broken')
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'SKILL.md'), 'no frontmatter here\n')
    writeSkill(root, 'ok', 'name: ok\ndescription: d')
    expect(scanSkills([root]).map((s) => s.name)).toEqual(['ok'])
  })

  it('dedupes by name across dirs, first dir wins', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'fly-half-skills-a-'))
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'fly-half-skills-b-'))
    writeSkill(a, 'dup', 'name: dup\ndescription: from a')
    writeSkill(b, 'dup', 'name: dup\ndescription: from b')
    const skills = scanSkills([a, b])
    expect(skills).toHaveLength(1)
    expect(skills[0].description).toBe('from a')
  })
})
