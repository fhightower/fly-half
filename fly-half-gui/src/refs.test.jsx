import { describe, it, expect } from 'vitest'
import { skillRefs } from './refs.js'

const known = new Set(['review-pr', 'superpowers:brainstorming'])

describe('skillRefs', () => {
  it('finds a /skill at the start of the text', () => {
    expect(skillRefs('/review-pr the PR', known)).toEqual(['review-pr'])
  })

  it('finds a /skill after whitespace', () => {
    expect(skillRefs('First do /review-pr now', known)).toEqual(['review-pr'])
  })

  it('matches plugin-namespaced names with a colon', () => {
    expect(skillRefs('run /superpowers:brainstorming', known)).toEqual([
      'superpowers:brainstorming',
    ])
  })

  it('ignores a /token that is not a known skill', () => {
    expect(skillRefs('open /tmp/output and /nope', known)).toEqual([])
  })

  it('ignores a slash that is not at a word boundary', () => {
    // "and/or" — the "/review-pr" here is glued to a word, not a real ref
    expect(skillRefs('cd path/review-pr', known)).toEqual([])
  })

  it('returns every occurrence in order', () => {
    expect(skillRefs('/review-pr then /review-pr again', known)).toEqual(['review-pr', 'review-pr'])
  })

  it('returns nothing when there are no refs', () => {
    expect(skillRefs('plain step text', known)).toEqual([])
  })
})
