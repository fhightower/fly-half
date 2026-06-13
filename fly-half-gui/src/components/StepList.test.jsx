import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import StepList from './StepList.jsx'

const playbooks = [
  { name: 'current', steps: [] },
  { name: 'other', steps: [] },
]

function renderList(steps, onChange = vi.fn(), onNavigate = vi.fn()) {
  render(
    <StepList
      steps={steps}
      playbooks={playbooks}
      currentName="current"
      onChange={onChange}
      onNavigate={onNavigate}
    />
  )
  return { onChange, onNavigate }
}

describe('StepList', () => {
  it('adds a text step', async () => {
    const { onChange } = renderList(['existing'])
    await userEvent.click(screen.getByText('+ Step'))
    expect(onChange).toHaveBeenCalledWith(['existing', ''])
  })

  it('edits a text step', async () => {
    const { onChange } = renderList(['abc'])
    await userEvent.type(screen.getByDisplayValue('abc'), 'd')
    expect(onChange).toHaveBeenLastCalledWith(['abcd'])
  })

  it('inserts a new step below on Enter', async () => {
    const { onChange } = renderList(['a', 'b'])
    await userEvent.type(screen.getByDisplayValue('a'), '{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['a', '', 'b'])
  })

  it('deletes a step', async () => {
    const { onChange } = renderList(['a', 'b'])
    await userEvent.click(screen.getAllByTitle('Delete step')[0])
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('adds notes to a text step, converting it to {text, ai_agent_notes}', async () => {
    const { onChange } = renderList(['do thing'])
    await userEvent.type(
      screen.getByPlaceholderText('Notes for the agent about this step, one per line…'),
      'n'
    )
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'do thing', ai_agent_notes: ['n'] }])
  })

  it('renders existing note lists, one per line, and collapses back to string when cleared', async () => {
    const { onChange } = renderList([{ text: 'do thing', ai_agent_notes: ['note a', 'note b'] }])
    expect(screen.getByDisplayValue('do thing')).toBeInTheDocument()
    const notesBox = screen.getByPlaceholderText('Notes for the agent about this step, one per line…')
    expect(notesBox).toHaveValue('note a\nnote b')
    await userEvent.clear(notesBox)
    expect(onChange).toHaveBeenLastCalledWith(['do thing'])
  })

  it('shows clickable chips for inline [[refs]] in step text', async () => {
    const { onNavigate } = renderList(['Tell the agent to [[other]]'])
    await userEvent.click(screen.getByText('⧉ other'))
    expect(onNavigate).toHaveBeenCalledWith('other')
  })

  it('flags missing inline refs', () => {
    renderList(['run [[nope]]'])
    expect(screen.getByText('⚠ nope (missing)')).toBeInTheDocument()
  })

  // Stateful wrapper so typed text accumulates (StepList is controlled)
  function StatefulList({ initial, onSteps = () => {} }) {
    const [steps, setSteps] = useState(initial)
    return (
      <StepList
        steps={steps}
        playbooks={playbooks}
        currentName="current"
        onChange={(next) => {
          setSteps(next)
          onSteps(next)
        }}
        onNavigate={() => {}}
      />
    )
  }

  const stepBox = () =>
    screen.getAllByPlaceholderText('Describe this step… type [[ to reference a playbook')[0]

  it('opens a typeahead when typing [[ and filters by query', async () => {
    render(<StatefulList initial={['']} />)
    await userEvent.type(stepBox(), 'do [[[[oth')
    expect(screen.getByRole('option', { name: 'other' })).toBeInTheDocument()
    await userEvent.type(stepBox(), 'zzz')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('accepts a typeahead suggestion with Enter, completing the [[ref]]', async () => {
    const onSteps = vi.fn()
    render(<StatefulList initial={['']} onSteps={onSteps} />)
    await userEvent.type(stepBox(), 'Tell agent to [[[[oth{Enter}')
    expect(onSteps).toHaveBeenLastCalledWith(['Tell agent to [[other]]'])
  })

  it('accepts a typeahead suggestion by click', async () => {
    const onSteps = vi.fn()
    render(<StatefulList initial={['']} onSteps={onSteps} />)
    await userEvent.type(stepBox(), '[[[[')
    await userEvent.click(screen.getByRole('option', { name: 'other' }))
    expect(onSteps).toHaveBeenLastCalledWith(['[[other]]'])
  })

  it('Escape closes the typeahead and Enter then adds a step', async () => {
    const onSteps = vi.fn()
    render(<StatefulList initial={['']} onSteps={onSteps} />)
    await userEvent.type(stepBox(), '[[[[{Escape}')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await userEvent.type(stepBox(), '{Enter}')
    expect(onSteps).toHaveBeenLastCalledWith(['[[', ''])
  })

  it('has no + Playbook ref button', () => {
    renderList([])
    expect(screen.queryByText('+ Playbook ref')).not.toBeInTheDocument()
  })
})
