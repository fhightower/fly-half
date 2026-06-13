import React, { useState } from 'react'
import { scenarioUsage } from '../refs.js'

export default function Sidebar({
  scenarios,
  playbooks,
  brokenRefs,
  selection,
  dirty,
  onSelect,
  onNewPlaybook,
}) {
  const [filter, setFilter] = useState('')
  const broken = new Set(brokenRefs.filter((b) => b.type === 'playbook').map((b) => b.name))
  const scenariosBroken = brokenRefs.some((b) => b.type === 'scenario')
  const visible = playbooks.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <aside className="sidebar">
      <h1>Fly Half</h1>
      <input
        className="search"
        placeholder="Search…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <button
        className={`nav-item ${selection.type === 'scenarios' ? 'active' : ''}`}
        onClick={() => onSelect({ type: 'scenarios' })}
      >
        Scenarios
        {scenariosBroken && <span className="broken" title="references a missing playbook">⚠</span>}
        {selection.type === 'scenarios' && dirty && <span className="dirty">●</span>}
      </button>
      <hr className="sidebar-divider" />

      <div className="section-label">
        Playbooks
        <button className="mini-btn" onClick={onNewPlaybook} title="New playbook">
          + New
        </button>
      </div>
      {visible.map((p) => (
        <button
          key={p.name}
          className={`nav-item ${selection.type === 'playbook' && selection.name === p.name ? 'active' : ''}`}
          onClick={() => onSelect({ type: 'playbook', name: p.name })}
        >
          {p.name}
          {scenarioUsage(scenarios, p.name) > 0 && (
            <span
              className="usage-count"
              title={`Used by ${scenarioUsage(scenarios, p.name)} scenario(s)`}
            >
              {scenarioUsage(scenarios, p.name)}
            </span>
          )}
          {broken.has(p.name) && <span className="broken" title="references a missing playbook">⚠</span>}
          {selection.type === 'playbook' && selection.name === p.name && dirty && (
            <span className="dirty">●</span>
          )}
        </button>
      ))}
      {visible.length === 0 && <div className="empty">No playbooks match</div>}
    </aside>
  )
}
