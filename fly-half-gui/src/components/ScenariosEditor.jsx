import React, { useState } from 'react'
import * as api from '../api.js'

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
        <div className="label">Then run playbook</div>
        <div />
        {scenarios.map((s, i) => (
          <React.Fragment key={i}>
            <textarea
              rows={2}
              value={s.when}
              placeholder="Describe the trigger condition…"
              onChange={(e) => update(i, { when: e.target.value })}
            />
            <select value={s.then} onChange={(e) => update(i, { then: e.target.value })}>
              {!names.has(s.then) && <option value={s.then}>⚠ {s.then || '(none)'} (missing)</option>}
              {playbooks.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              className="mini-btn danger"
              onClick={() => change(scenarios.filter((_, j) => j !== i))}
              title="Delete scenario"
            >
              ✕
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="step-actions">
        <button onClick={() => change([...scenarios, { when: '', then: playbooks[0]?.name || '' }])}>
          + Scenario
        </button>
      </div>
    </div>
  )
}
