import React, { useState, useEffect, useRef } from 'react'

export default function StepList({ steps, playbooks, currentName, onChange, onNavigate }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [focusIndex, setFocusIndex] = useState(null)
  // {step: index, query: text typed after "[[", active: highlighted suggestion}
  const [typeahead, setTypeahead] = useState(null)
  const containerRef = useRef(null)
  const textareaRefs = useRef({})
  const names = new Set(playbooks.map((p) => p.name))
  const refTargets = playbooks.filter((p) => p.name !== currentName).map((p) => p.name)

  useEffect(() => {
    if (focusIndex === null) return
    containerRef.current
      ?.querySelectorAll('.step-row')
      [focusIndex]?.querySelector('textarea')
      ?.focus()
    setFocusIndex(null)
  }, [focusIndex])

  // Size the textarea to its content
  const autoGrow = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const update = (i, value) => onChange(steps.map((s, j) => (j === i ? value : s)))
  const remove = (i) => onChange(steps.filter((_, j) => j !== i))

  const stepText = (s) => (typeof s === 'string' ? s : s.text)
  // Notes are a list of strings; tolerate legacy single-string yaml
  const stepNotes = (s) => {
    if (typeof s === 'string') return []
    const n = s.ai_agent_notes
    return Array.isArray(n) ? n : n ? [n] : []
  }
  const inlineRefs = (text) => [...String(text).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1])

  // Keep yaml minimal: a text step without notes collapses back to a plain string
  const setText = (i, text) => {
    const notes = stepNotes(steps[i])
    update(i, notes.length ? { text, ai_agent_notes: notes } : text)
  }

  // One note per line; blank lines survive while typing and are dropped on save
  const setNotes = (i, raw) => {
    const s = steps[i]
    update(i, raw ? { text: stepText(s), ai_agent_notes: raw.split('\n') } : stepText(s))
  }

  // An unclosed "[[query" immediately before the cursor opens the typeahead
  const detectTypeahead = (i, el) => {
    const upToCursor = el.value.slice(0, el.selectionStart)
    const match = upToCursor.match(/\[\[([^\][]*)$/)
    setTypeahead(match ? { step: i, query: match[1], active: 0 } : null)
  }

  const suggestionsFor = (query) =>
    refTargets.filter((n) => n.toLowerCase().includes(query.toLowerCase()))

  // Replace the open "[[query" before the cursor with "[[name]]"
  const acceptSuggestion = (i, name) => {
    const el = textareaRefs.current[i]
    const text = stepText(steps[i])
    const cursor = el?.selectionStart ?? text.length
    const start = text.slice(0, cursor).lastIndexOf('[[')
    setText(i, `${text.slice(0, start)}[[${name}]]${text.slice(cursor)}`)
    setTypeahead(null)
    el?.focus()
  }

  // <enter> inserts a fresh step below the current one and focuses it
  const insertAfter = (i) => {
    onChange([...steps.slice(0, i + 1), '', ...steps.slice(i + 1)])
    setFocusIndex(i + 1)
  }

  const onStepKeyDown = (e, i) => {
    if (typeahead?.step === i) {
      const suggestions = suggestionsFor(typeahead.query)
      if (e.key === 'ArrowDown' && suggestions.length) {
        e.preventDefault()
        setTypeahead({ ...typeahead, active: (typeahead.active + 1) % suggestions.length })
        return
      }
      if (e.key === 'ArrowUp' && suggestions.length) {
        e.preventDefault()
        setTypeahead({
          ...typeahead,
          active: (typeahead.active - 1 + suggestions.length) % suggestions.length,
        })
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && suggestions.length) {
        e.preventDefault()
        acceptSuggestion(i, suggestions[typeahead.active] || suggestions[0])
        return
      }
      if (e.key === 'Escape') {
        setTypeahead(null)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(i)
    }
  }

  const drop = (i) => {
    if (dragIndex === null || dragIndex === i) return
    const next = [...steps]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(i, 0, moved)
    onChange(next)
    setDragIndex(null)
  }

  return (
    <div className="steps" ref={containerRef}>
      {steps.map((step, i) => {
        const notes = stepNotes(step)
        const suggestions = typeahead?.step === i ? suggestionsFor(typeahead.query) : []
        return (
          <div
            key={i}
            className="step-row"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)}
          >
            <div className="step-main">
              <span className="drag-handle" title="Drag to reorder">
                ⠿
              </span>
              <div className="step-input-wrap">
                <textarea
                  className="step-input"
                  rows={1}
                  value={stepText(step)}
                  placeholder="Describe this step… type [[ to reference a playbook"
                  ref={(el) => {
                    textareaRefs.current[i] = el
                    autoGrow(el)
                  }}
                  onChange={(e) => {
                    setText(i, e.target.value)
                    autoGrow(e.target)
                    detectTypeahead(i, e.target)
                  }}
                  onKeyDown={(e) => onStepKeyDown(e, i)}
                  onBlur={() => setTimeout(() => setTypeahead(null), 150)}
                />
                {suggestions.length > 0 && (
                  <ul className="typeahead" role="listbox">
                    {suggestions.map((n, j) => (
                      <li
                        key={n}
                        role="option"
                        aria-selected={j === typeahead.active}
                        className={j === typeahead.active ? 'active' : ''}
                        // mousedown fires before the textarea's blur
                        onMouseDown={(e) => {
                          e.preventDefault()
                          acceptSuggestion(i, n)
                        }}
                      >
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button className="mini-btn danger" onClick={() => remove(i)} title="Delete step">
                ✕
              </button>
            </div>
            {inlineRefs(stepText(step)).length > 0 && (
              <div className="ref-chips">
                {inlineRefs(stepText(step)).map((n, j) =>
                  names.has(n) ? (
                    <button key={j} className="ref-chip" onClick={() => onNavigate(n)} title="Open">
                      ⧉ {n}
                    </button>
                  ) : (
                    <span key={j} className="ref-chip missing" title="No playbook with this name">
                      ⚠ {n} (missing)
                    </span>
                  )
                )}
              </div>
            )}
            <details className="agent-notes step-notes">
              <summary>AI agent notes{notes.length ? ' •' : ''}</summary>
              <textarea
                rows={2}
                placeholder="Notes for the agent about this step, one per line…"
                value={notes.join('\n')}
                onChange={(e) => setNotes(i, e.target.value)}
              />
            </details>
          </div>
        )
      })}

      <div className="step-actions">
        <button onClick={() => onChange([...steps, ''])}>+ Step</button>
      </div>
    </div>
  )
}
