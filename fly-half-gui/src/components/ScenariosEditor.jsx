import React, { useState } from 'react'
import * as api from '../api.js'
import { thenPlaybooks } from '../refs.js'

export default function ScenariosEditor({ scenarios: initial, playbooks, onDirty, onSaved, onError }) {
  const [scenarios, setScenarios] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const names = new Set(playbooks.map((p) => p.name))

  const change = (next) => {
    setScenarios(next)
    setDirty(true)
    onDirty(true)
  }

  const update = (i, patch) => change(scenarios.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  // Keep yaml minimal: a single-playbook `then` stays a scalar, multiple become a list
  const setTargets = (i, list) => update(i, { then: list.length === 1 ? list[0] : list })

  // Notes are a list of strings, edited as one note per line; tolerate legacy single-string yaml
  const notesToText = (n) => (Array.isArray(n) ? n.join('\n') : n || '')
  const textToNotes = (text) => text.split('\n').filter((l) => l.trim() !== '')

  const save = async () => {
    setSaving(true)
    try {
      await api.saveScenarios(scenarios)
      setDirty(false)
      await onSaved()
    } catch (e) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <h2>Scenarios</h2>
        <div className="actions">
          <button className="primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      <p className="hint">
        Agents scan this list: when a scenario matches, they run its playbook.
      </p>

      <div className="scenario-grid">
        <div className="label">When</div>
        <div className="label">Then run playbook(s)</div>
        <div />
        {scenarios.map((s, i) => {
          const targets = thenPlaybooks(s.then)
          const unused = playbooks.filter((p) => !targets.includes(p.name))
          return (
          <React.Fragment key={i}>
            <textarea
              rows={2}
              value={s.when}
              placeholder="Describe the trigger condition…"
              onChange={(e) => update(i, { when: e.target.value })}
            />
            <div className="then-cell">
              {targets.map((n, k) => (
                <span key={k} className={`then-chip ${names.has(n) ? '' : 'missing'}`}>
                  {names.has(n) ? n : `⚠ ${n} (missing)`}
                  <button
                    className="chip-x"
                    onClick={() => setTargets(i, targets.filter((_, x) => x !== k))}
                    title="Remove playbook"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && setTargets(i, [...targets, e.target.value])}
              >
                <option value="">{targets.length ? '+ Add playbook…' : 'Select a playbook…'}</option>
                {unused.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="mini-btn danger"
              onClick={() => change(scenarios.filter((_, j) => j !== i))}
              title="Delete scenario"
            >
              ✕
            </button>
            <details className="agent-notes">
              <summary>AI agent notes{notesToText(s.ai_agent_notes) ? ' •' : ''}</summary>
              <textarea
                rows={3}
                placeholder="Notes for the agent running this scenario, one per line…"
                value={notesToText(s.ai_agent_notes)}
                onChange={(e) => update(i, { ai_agent_notes: textToNotes(e.target.value) })}
              />
            </details>
          </React.Fragment>
          )
        })}
      </div>

      <div className="step-actions">
        <button onClick={() => change([...scenarios, { when: '', then: playbooks[0]?.name || '' }])}>
          + Scenario
        </button>
      </div>
    </div>
  )
}
