import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SkillPreview from './SkillPreview.jsx'

describe('SkillPreview', () => {
  it('renders the skill description as the summary', () => {
    render(
      <SkillPreview skill={{ name: 'review-pr', description: 'Review a GitHub PR', source: '/s/SKILL.md' }} />
    )
    expect(screen.getByText('Review a GitHub PR')).toBeInTheDocument()
  })

  it('shows the source path', () => {
    render(
      <SkillPreview skill={{ name: 'review-pr', description: 'd', source: '/skills/review-pr/SKILL.md' }} />
    )
    expect(screen.getByText('/skills/review-pr/SKILL.md')).toBeInTheDocument()
  })

  it('falls back to (no description) when description is empty', () => {
    render(<SkillPreview skill={{ name: 'bare', description: '', source: '/s/SKILL.md' }} />)
    expect(screen.getByText('(no description)')).toBeInTheDocument()
  })
})
