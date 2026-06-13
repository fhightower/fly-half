import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar.jsx'

const playbooks = [
  { name: 'review_ticket', description: '', steps: [] },
  { name: 'triage_bug', description: '', steps: [] },
]

const baseProps = {
  scenarios: [{ when: 'w', then: 'review_ticket' }],
  playbooks,
  brokenRefs: [],
  selection: { type: 'scenarios' },
  dirty: false,
  onSelect: () => {},
  onNewPlaybook: () => {},
}

describe('Sidebar', () => {
  it('lists playbooks and a scenarios entry', () => {
    render(<Sidebar {...baseProps} />)
    expect(screen.getByText('review_ticket')).toBeInTheDocument()
    expect(screen.getByText('triage_bug')).toBeInTheDocument()
    expect(screen.getByText('Scenarios')).toBeInTheDocument()
    expect(screen.getByText('Fly Half')).toBeInTheDocument()
  })

  it('filters playbooks by search', async () => {
    render(<Sidebar {...baseProps} />)
    await userEvent.type(screen.getByPlaceholderText('Search…'), 'triage')
    expect(screen.queryByText('review_ticket')).not.toBeInTheDocument()
    expect(screen.getByText('triage_bug')).toBeInTheDocument()
  })

  it('selects a playbook on click', async () => {
    const onSelect = vi.fn()
    render(<Sidebar {...baseProps} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('triage_bug'))
    expect(onSelect).toHaveBeenCalledWith({ type: 'playbook', name: 'triage_bug' })
  })

  it('flags playbooks with broken refs', () => {
    render(
      <Sidebar
        {...baseProps}
        brokenRefs={[{ type: 'playbook', name: 'review_ticket', missing: 'gone' }]}
      />
    )
    const item = screen.getByText('review_ticket').closest('button')
    expect(item.querySelector('.broken')).not.toBeNull()
  })

  it('shows dirty dot on active selection when dirty', () => {
    render(<Sidebar {...baseProps} selection={{ type: 'scenarios' }} dirty={true} />)
    const item = screen.getByText('Scenarios').closest('button')
    expect(item.querySelector('.dirty')).not.toBeNull()
  })
})
