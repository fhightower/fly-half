import React, { useState } from 'react'

const inlineRefs = (text) => [...String(text).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1])
const stepText = (s) => (typeof s === 'string' ? s : s.text)

// Read-only, recursively expandable view of a referenced playbook.
// `seen` carries the chain of ancestors so cycles render a stub instead of looping forever.
export default function PlaybookPreview({ name, playbooks, seen = [] }) {
  const playbook = playbooks.find((p) => p.name === name)
  if (!playbook) return <div className="preview missing">⚠ {name} (missing)</div>
  if (seen.includes(name)) return <div className="preview cycle">↻ {name} (shown above)</div>
  const nextSeen = [...seen, name]
  return (
    <div className="preview">
      {playbook.description && <div className="preview-desc">{playbook.description}</div>}
      {playbook.steps.length === 0 ? (
        <div className="preview-empty">(no steps)</div>
      ) : (
        <ol className="preview-steps">
          {playbook.steps.map((s, i) => (
            <PreviewStep key={i} step={s} playbooks={playbooks} seen={nextSeen} />
          ))}
        </ol>
      )}
    </div>
  )
}

function PreviewStep({ step, playbooks, seen }) {
  const [open, setOpen] = useState(null) // name of the ref expanded under this step, if any
  const text = stepText(step)
  const refs = inlineRefs(text)
  return (
    <li className="preview-step">
      <span className="preview-text">{text}</span>
      {refs.map((n, j) => (
        <button
          key={j}
          className="ref-chip"
          onClick={() => setOpen(open === n ? null : n)}
          title={open === n ? 'Collapse' : 'Expand inline'}
        >
          {open === n ? '▾' : '▸'} {n}
        </button>
      ))}
      {open && <PlaybookPreview name={open} playbooks={playbooks} seen={seen} />}
    </li>
  )
}
