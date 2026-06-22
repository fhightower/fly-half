import React, { useState, useEffect, useRef } from 'react'
import PlaybookPreview from './PlaybookPreview.jsx'
import SkillPreview from './SkillPreview.jsx'
import { skillRefs } from '../refs.js'

export default function StepList({ steps, playbooks, skills = [], currentName, onChange, onNavigate }) {
  const [dragIndex, setDragIndex] = useState(null)
  // Boundary the dragged step would land at (0..steps.length); null when not dragging.
  const [overIndex, setOverIndex] = useState(null)
  const [focusIndex, setFocusIndex] = useState(null)
  // Set of "stepIndex:refName" keys whose referenced playbook is expanded inline
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  // {step: index, query: text typed after "[[", active: highlighted suggestion}
  const [typeahead, setTypeahead] = useState(null)
  const containerRef = useRef(null)
  const textareaRefs = useRef({})
  const names = new Set(playbooks.map((p) => p.name))
  const refTargets = playbooks.filter((p) => p.name !== currentName).map((p) => p.name)
  const skillNames = new Set(skills.map((s) => s.name))
  const skillByName = new Map(skills.map((s) => [s.name, s]))

  useEffect(() => {
    if (focusIndex === null) return
    containerRef.current
      ?.querySelectorAll('.step-row')
      [focusIndex]?.querySelector('textarea')
      ?.focus()
    setFocusIndex(null)
  }, [focusIndex])

  // Grow the textarea to its content; CSS max-height caps it and scrolls past.
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

  // An unclosed "[[query" opens the playbook typeahead; a "/query" at a word
  // boundary opens the skill typeahead. `kind` drives suggestions and insertion.
  const detectTypeahead = (i, el) => {
    const upToCursor = el.value.slice(0, el.selectionStart)
    const pb = upToCursor.match(/\[\[([^\][]*)$/)
    if (pb) return setTypeahead({ step: i, query: pb[1], active: 0, kind: 'playbook' })
    const sk = upToCursor.match(/(?:^|\s)\/([\w:-]*)$/)
    if (sk) return setTypeahead({ step: i, query: sk[1], active: 0, kind: 'skill' })
    setTypeahead(null)
  }

  const suggestionsFor = (query, kind) => {
    const pool = kind === 'skill' ? [...skillNames] : refTargets
    return pool.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
  }

  // Replace the open "[[query" with "[[name]]", or the open "/query" with "/name"
  const acceptSuggestion = (i, name, kind) => {
    const el = textareaRefs.current[i]
    const text = stepText(steps[i])
    const cursor = el?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    if (kind === 'skill') {
      const start = before.lastIndexOf('/')
      setText(i, `${text.slice(0, start)}/${name}${text.slice(cursor)}`)
    } else {
      const start = before.lastIndexOf('[[')
      setText(i, `${text.slice(0, start)}[[${name}]]${text.slice(cursor)}`)
    }
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
      const suggestions = suggestionsFor(typeahead.query, typeahead.kind)
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
        acceptSuggestion(i, suggestions[typeahead.active] || suggestions[0], typeahead.kind)
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

  // While hovering a row, the insertion boundary is the row's index (top half)
  // or the next index (bottom half), so the line tracks the cursor precisely.
  const onRowDragOver = (e, i) => {
    e.preventDefault()
    if (dragIndex === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setOverIndex(after ? i + 1 : i)
  }

  const clearDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  const drop = () => {
    if (dragIndex === null || overIndex === null) return clearDrag()
    const next = [...steps]
    const [moved] = next.splice(dragIndex, 1)
    // Removing the source shifts every later boundary left by one.
    const insert = dragIndex < overIndex ? overIndex - 1 : overIndex
    next.splice(insert, 0, moved)
    onChange(next)
    clearDrag()
  }

  // Hide the line at the two boundaries that wouldn't move the step.
  const showLineAt = (i) =>
    dragIndex !== null && overIndex === i && i !== dragIndex && i !== dragIndex + 1

  return (
    <div className="steps" ref={containerRef}>
      {steps.map((step, i) => {
        const notes = stepNotes(step)
        const suggestions =
          typeahead?.step === i ? suggestionsFor(typeahead.query, typeahead.kind) : []
        return (
          <React.Fragment key={i}>
            {showLineAt(i) && <div className="drop-line" />}
          <div
            className={`step-row ${dragIndex === i ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragIndex(i)
              // Snapshot only the step's main line for the drag ghost.
              // The full row's border-box can bleed into the row below,
              // dragging a phantom copy of the next step along with it.
              const main = e.currentTarget.querySelector('.step-main')
              if (main) e.dataTransfer?.setDragImage(main, 12, 12)
            }}
            onDragOver={(e) => onRowDragOver(e, i)}
            onDrop={drop}
            onDragEnd={clearDrag}
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
                  placeholder="Describe this step… [[playbook]] or /skill to reference"
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
                          acceptSuggestion(i, n, typeahead.kind)
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
            {(inlineRefs(stepText(step)).length > 0 ||
              skillRefs(stepText(step), skillNames).length > 0) && (
              <div className="ref-chips">
                {inlineRefs(stepText(step)).map((n, j) =>
                  names.has(n) ? (
                    <span key={`p${j}`} className="ref-chip-group">
                      <button
                        className="ref-chip expand"
                        onClick={() => toggleExpand(`${i}:${n}`)}
                        title={expanded.has(`${i}:${n}`) ? 'Collapse' : 'Expand inline'}
                      >
                        {expanded.has(`${i}:${n}`) ? '▾' : '▸'}
                      </button>
                      <button className="ref-chip" onClick={() => onNavigate(n)} title="Open">
                        ⧉ {n}
                      </button>
                    </span>
                  ) : (
                    <span key={`p${j}`} className="ref-chip missing" title="No playbook with this name">
                      ⚠ {n} (missing)
                    </span>
                  )
                )}
                {skillRefs(stepText(step), skillNames).map((n, j) => (
                  <button
                    key={`s${j}`}
                    className="ref-chip skill"
                    onClick={() => toggleExpand(`${i}:skill:${n}`)}
                    title={expanded.has(`${i}:skill:${n}`) ? 'Collapse' : 'Expand inline'}
                  >
                    {expanded.has(`${i}:skill:${n}`) ? '▾' : '▸'} ⚡ {n}
                  </button>
                ))}
              </div>
            )}
            {inlineRefs(stepText(step))
              .filter((n) => names.has(n) && expanded.has(`${i}:${n}`))
              .map((n) => (
                <PlaybookPreview
                  key={n}
                  name={n}
                  playbooks={playbooks}
                  seen={[currentName]}
                />
              ))}
            {skillRefs(stepText(step), skillNames)
              .filter((n) => expanded.has(`${i}:skill:${n}`))
              .map((n) => (
                <SkillPreview key={`skill-${n}`} skill={skillByName.get(n)} />
              ))}
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
          </React.Fragment>
        )
      })}

      {showLineAt(steps.length) && <div className="drop-line" />}
      <div className="step-actions">
        <button onClick={() => onChange([...steps, ''])}>+ Step</button>
      </div>
    </div>
  )
}
