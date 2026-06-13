import React, { useState } from 'react'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { yaml as yamlLang } from '@codemirror/lang-yaml'
import * as api from '../api.js'
import StepList from './StepList.jsx'

export default function PlaybookEditor({
  playbook,
  playbooks,
  onDirty,
  onSaved,
  onDeleted,
  onNavigate,
  onError,
}) {
  // Notes are a list of strings, edited as one note per line; tolerate legacy single-string yaml
  const notesToText = (n) => (Array.isArray(n) ? n.join('\n') : n || '')
  const textToNotes = (text) => text.split('\n').filter((l) => l.trim() !== '')

  const [description, setDescription] = useState(playbook.description)
  const [agentNotes, setAgentNotes] = useState(notesToText(playbook.ai_agent_notes))
  const [steps, setSteps] = useState(playbook.steps)
  const [tab, setTab] = useState('steps')
  const [yamlText, setYamlText] = useState('')
  const [yamlError, setYamlError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const markDirty = () => {
    setDirty(true)
    onDirty(true)
  }

  const toYaml = (desc, notes, st) => {
    const doc = { name: playbook.name }
    if (desc) doc.description = desc
    const noteList = textToNotes(notes)
    if (noteList.length) doc.ai_agent_notes = noteList
    doc.steps = st
    return yaml.dump(doc, { lineWidth: 120 })
  }

  // Parse yaml text back into structured state; returns false on error
  const syncFromYaml = (text) => {
    try {
      const doc = yaml.load(text) || {}
      if (doc.steps && !Array.isArray(doc.steps)) throw new Error('steps must be a list')
      setDescription(doc.description || '')
      setAgentNotes(notesToText(doc.ai_agent_notes))
      setSteps(Array.isArray(doc.steps) ? doc.steps : [])
      setYamlError(null)
      return true
    } catch (e) {
      setYamlError(e.message)
      return false
    }
  }

  const switchTab = (next) => {
    if (next === tab) return
    if (next === 'yaml') {
      setYamlText(toYaml(description, agentNotes, steps))
      setTab('yaml')
    } else {
      if (!syncFromYaml(yamlText)) return // invalid yaml blocks tab switch
      setTab('steps')
    }
  }

  const save = async () => {
    let desc = description
    let notes = agentNotes
    let st = steps
    if (tab === 'yaml') {
      if (!syncFromYaml(yamlText)) return // invalid yaml blocks save
      const doc = yaml.load(yamlText) || {}
      desc = doc.description || ''
      notes = notesToText(doc.ai_agent_notes)
      st = Array.isArray(doc.steps) ? doc.steps : []
    }
    setSaving(true)
    try {
      await api.savePlaybook(playbook.name, {
        description: desc,
        ai_agent_notes: textToNotes(notes),
        steps: st,
      })
      setDirty(false)
      await onSaved()
    } catch (e) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const rename = async () => {
    const newName = window.prompt('New name:', playbook.name)
    if (!newName || newName === playbook.name) return
    try {
      await api.renamePlaybook(playbook.name, newName)
      await onSaved(newName)
    } catch (e) {
      onError(e.message)
    }
  }

  const remove = async () => {
    try {
      const { referrers } = await api.getReferrers(playbook.name)
      const warning = referrers.length
        ? `"${playbook.name}" is referenced by:\n` +
          referrers
            .map((r) => (r.type === 'scenario' ? `• scenario: ${r.when}` : `• playbook: ${r.name}`))
            .join('\n') +
          '\n\nDeleting will leave broken references. Delete anyway?'
        : `Delete "${playbook.name}"?`
      if (!window.confirm(warning)) return
      await api.deletePlaybook(playbook.name)
      await onDeleted()
    } catch (e) {
      onError(e.message)
    }
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <h2>{playbook.name}</h2>
        <div className="actions">
          <button onClick={rename}>Rename</button>
          <button className="danger" onClick={remove}>
            Delete
          </button>
          <button className="primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <input
        className="description"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value)
          markDirty()
        }}
        disabled={tab === 'yaml'}
      />

      {tab === 'steps' && (
        <details className="agent-notes">
          <summary>AI agent notes{agentNotes ? ' •' : ''}</summary>
          <textarea
            rows={3}
            placeholder="Notes for the agent running this playbook, one per line…"
            value={agentNotes}
            onChange={(e) => {
              setAgentNotes(e.target.value)
              markDirty()
            }}
          />
        </details>
      )}

      <div className="tabs">
        <button className={tab === 'steps' ? 'active' : ''} onClick={() => switchTab('steps')}>
          Steps
        </button>
        <button className={tab === 'yaml' ? 'active' : ''} onClick={() => switchTab('yaml')}>
          YAML
        </button>
        {yamlError && <span className="yaml-error">Invalid YAML: {yamlError}</span>}
      </div>

      {tab === 'steps' ? (
        <StepList
          steps={steps}
          playbooks={playbooks}
          currentName={playbook.name}
          onChange={(next) => {
            setSteps(next)
            markDirty()
          }}
          onNavigate={onNavigate}
        />
      ) : (
        <CodeMirror
          value={yamlText}
          extensions={[yamlLang()]}
          onChange={(text) => {
            setYamlText(text)
            setYamlError(null)
            markDirty()
          }}
          height="400px"
        />
      )}
    </div>
  )
}
