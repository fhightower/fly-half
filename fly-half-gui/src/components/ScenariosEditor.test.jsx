import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScenariosEditor from './ScenariosEditor.jsx'

const playbooks = [
  { name: 'pb_one', steps: [] },
  { name: 'pb_two', steps: [] },
]

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
})

function renderEditor(scenarios = [], props = {}) {
  const handlers = {
    onDirty: vi.fn(),
    onSaved: vi.fn(),
    onError: vi.fn(),
    ...props,
  }
  render(<ScenariosEditor scenarios={scenarios} playbooks={playbooks} {...handlers} />)
  return handlers
}

describe('ScenariosEditor', () => {
  it('renders existing scenarios', () => {
    renderEditor([{ when: 'ticket assigned', then: 'pb_one' }])
    expect(screen.getByDisplayValue('ticket assigned')).toBeInTheDocument()
  })

  it('adds a scenario and marks dirty', async () => {
    const { onDirty } = renderEditor([])
    await userEvent.click(screen.getByText('+ Scenario'))
    expect(screen.getByPlaceholderText('Describe the trigger condition…')).toBeInTheDocument()
    expect(onDirty).toHaveBeenCalledWith(true)
  })

  it('deletes a scenario', async () => {
    renderEditor([{ when: 'gone soon', then: 'pb_one' }])
    await userEvent.click(screen.getByTitle('Delete scenario'))
    expect(screen.queryByDisplayValue('gone soon')).not.toBeInTheDocument()
  })

  it('flags a scenario pointing at a missing playbook', () => {
    renderEditor([{ when: 'w', then: 'nope' }])
    expect(screen.getByText('⚠ nope (missing)')).toBeInTheDocument()
  })

  it('adds a second playbook and saves a then-list', async () => {
    const { onSaved } = renderEditor([{ when: 'w', then: 'pb_one' }])
    await userEvent.selectOptions(screen.getByRole('combobox'), 'pb_two')
    await userEvent.click(screen.getByText('Save'))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      scenarios: [{ when: 'w', then: ['pb_one', 'pb_two'] }],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('removes a playbook target, collapsing back to a scalar', async () => {
    renderEditor([{ when: 'w', then: ['pb_one', 'pb_two'] }])
    await userEvent.click(screen.getAllByTitle('Remove playbook')[0])
    await userEvent.click(screen.getByText('Save'))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      scenarios: [{ when: 'w', then: 'pb_two' }],
    })
  })

  it('disables Save until there is a change', async () => {
    renderEditor([{ when: 'w', then: 'pb_one' }])
    expect(screen.getByText('Save')).toBeDisabled()
    await userEvent.type(screen.getByDisplayValue('w'), 'x')
    expect(screen.getByText('Save')).toBeEnabled()
  })

  it('saves via the API', async () => {
    const { onSaved } = renderEditor([{ when: 'w', then: 'pb_one' }])
    await userEvent.type(screen.getByDisplayValue('w'), 'x')
    await userEvent.click(screen.getByText('Save'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/scenarios',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      scenarios: [{ when: 'wx', then: 'pb_one' }],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('reports save errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'boom' }),
    })
    const { onError } = renderEditor([{ when: 'w', then: 'pb_one' }])
    await userEvent.type(screen.getByDisplayValue('w'), 'x')
    await userEvent.click(screen.getByText('Save'))
    expect(onError).toHaveBeenCalledWith('boom')
  })
})
