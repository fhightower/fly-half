import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import yaml from 'js-yaml'

// CodeMirror needs real DOM measurement APIs jsdom lacks — swap in a textarea
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }) => (
    <textarea aria-label="yaml-source" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => [] }))

import PlaybookEditor from './PlaybookEditor.jsx'

const playbook = {
  name: 'my_pb',
  description: 'does things',
  steps: ['first step', 'then run [[other]]'],
}
const playbooks = [playbook, { name: 'other', description: '', steps: [] }]

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
})

function renderEditor(props = {}) {
  const handlers = {
    onDirty: vi.fn(),
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    onNavigate: vi.fn(),
    onError: vi.fn(),
    ...props,
  }
  render(<PlaybookEditor playbook={playbook} playbooks={playbooks} {...handlers} />)
  return handlers
}

const yamlBox = () => screen.getByLabelText('yaml-source')

describe('PlaybookEditor', () => {
  it('renders steps tab by default', () => {
    renderEditor()
    expect(screen.getByDisplayValue('first step')).toBeInTheDocument()
    expect(screen.getByDisplayValue('does things')).toBeInTheDocument()
  })

  it('notes how many scenarios use the playbook', () => {
    renderEditor({
      scenarios: [
        { when: 'a', then: 'my_pb' },
        { when: 'b', then: 'my_pb' },
      ],
    })
    expect(screen.getByText('Used by 2 scenarios')).toBeInTheDocument()
  })

  it('says when no scenario uses the playbook', () => {
    renderEditor({ scenarios: [] })
    expect(screen.getByText('Not used by any scenario')).toBeInTheDocument()
  })

  it('generates yaml from structured state when switching tabs', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('YAML'))
    expect(yaml.load(yamlBox().value)).toEqual({
      name: 'my_pb',
      description: 'does things',
      steps: ['first step', 'then run [[other]]'],
    })
  })

  it('syncs edited yaml back into the steps view', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('YAML'))
    await userEvent.clear(yamlBox())
    await userEvent.paste('name: my_pb\nsteps:\n  - new step\n')
    await userEvent.click(screen.getByText('Steps'))
    expect(screen.getByDisplayValue('new step')).toBeInTheDocument()
  })

  it('blocks tab switch on invalid yaml', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('YAML'))
    await userEvent.clear(yamlBox())
    await userEvent.paste('steps: [unclosed')
    await userEvent.click(screen.getByText('Steps'))
    expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument()
    expect(yamlBox()).toBeInTheDocument() // still on yaml tab
  })

  it('blocks save on invalid yaml', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('YAML'))
    await userEvent.clear(yamlBox())
    await userEvent.paste('steps: [unclosed')
    await userEvent.click(screen.getByText('Save'))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument()
  })

  it('disables Save until there is a change', async () => {
    renderEditor()
    expect(screen.getByText('Save')).toBeDisabled()
    await userEvent.type(screen.getByDisplayValue('does things'), '!')
    expect(screen.getByText('Save')).toBeEnabled()
  })

  it('saves structured state via the API', async () => {
    const { onSaved } = renderEditor()
    await userEvent.type(screen.getByDisplayValue('does things'), '!')
    await userEvent.click(screen.getByText('Save'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/playbooks/my_pb',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      description: 'does things!',
      ai_agent_notes: [],
      steps: ['first step', 'then run [[other]]'],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('saves yaml-tab edits', async () => {
    renderEditor()
    await userEvent.click(screen.getByText('YAML'))
    await userEvent.clear(yamlBox())
    await userEvent.paste('name: my_pb\ndescription: updated\nsteps:\n  - only step\n')
    await userEvent.click(screen.getByText('Save'))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      description: 'updated',
      ai_agent_notes: [],
      steps: ['only step'],
    })
  })

  it('edits playbook-level AI agent notes as a one-per-line list in yaml', async () => {
    renderEditor()
    await userEvent.type(
      screen.getByPlaceholderText('Notes for the agent running this playbook, one per line…'),
      'be careful{Enter}be very careful'
    )
    await userEvent.click(screen.getByText('YAML'))
    expect(yaml.load(yamlBox().value).ai_agent_notes).toEqual(['be careful', 'be very careful'])
  })

  it('confirms with referrer list before delete', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url.includes('referrers')) {
        return { ok: true, json: async () => ({ referrers: [{ type: 'playbook', name: 'other' }] }) }
      }
      return { ok: true, json: async () => ({ ok: true }) }
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEditor()
    await userEvent.click(screen.getByText('Delete'))
    expect(confirmSpy.mock.calls[0][0]).toContain('playbook: other')
    // user declined → no DELETE request
    expect(global.fetch.mock.calls.every(([url, opts]) => opts?.method !== 'DELETE')).toBe(true)
    confirmSpy.mockRestore()
  })

  it('deletes when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    global.fetch.mockImplementation(async (url) => {
      if (url.includes('referrers')) return { ok: true, json: async () => ({ referrers: [] }) }
      return { ok: true, json: async () => ({ ok: true }) }
    })
    const { onDeleted } = renderEditor()
    await userEvent.click(screen.getByText('Delete'))
    expect(
      global.fetch.mock.calls.some(([url, opts]) => opts?.method === 'DELETE' && url.includes('my_pb'))
    ).toBe(true)
    expect(onDeleted).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('renames via prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('new_name')
    const { onSaved } = renderEditor()
    await userEvent.click(screen.getByText('Rename'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/playbooks/my_pb/rename',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ newName: 'new_name' }) })
    )
    expect(onSaved).toHaveBeenCalledWith('new_name')
    promptSpy.mockRestore()
  })
})
