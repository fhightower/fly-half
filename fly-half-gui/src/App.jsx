import React, { useEffect, useState, useCallback } from 'react'
import * as api from './api.js'
import Sidebar from './components/Sidebar.jsx'
import PlaybookEditor from './components/PlaybookEditor.jsx'
import ScenariosEditor from './components/ScenariosEditor.jsx'

export default function App() {
  const [state, setState] = useState(null)
  const [selection, setSelection] = useState({ type: 'scenarios' }) // or {type:'playbook', name}
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setState(await api.getState())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const select = (next) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    setDirty(false)
    setSelection(next)
  }

  const createPlaybook = async () => {
    const name = window.prompt('New playbook name:')
    if (!name) return
    try {
      await api.savePlaybook(name, { description: '', steps: [] })
      await refresh()
      select({ type: 'playbook', name })
    } catch (e) {
      setError(e.message)
    }
  }

  if (!state) return <div className="loading">{error || 'Loading…'}</div>

  const playbook =
    selection.type === 'playbook' ? state.playbooks.find((p) => p.name === selection.name) : null

  return (
    <div className="app">
      <Sidebar
        scenarios={state.scenarios}
        playbooks={state.playbooks}
        brokenRefs={state.brokenRefs}
        selection={selection}
        dirty={dirty}
        onSelect={select}
        onNewPlaybook={createPlaybook}
      />
      <main className="main">
        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} ✕
          </div>
        )}
        {selection.type === 'scenarios' ? (
          <ScenariosEditor
            key={JSON.stringify(state.scenarios)}
            scenarios={state.scenarios}
            playbooks={state.playbooks}
            onDirty={setDirty}
            onSaved={async () => {
              setDirty(false)
              await refresh()
            }}
            onError={setError}
          />
        ) : playbook ? (
          <PlaybookEditor
            key={playbook.name}
            playbook={playbook}
            playbooks={state.playbooks}
            onDirty={setDirty}
            onSaved={async (renamedTo) => {
              setDirty(false)
              await refresh()
              if (renamedTo) setSelection({ type: 'playbook', name: renamedTo })
            }}
            onDeleted={async () => {
              setDirty(false)
              await refresh()
              setSelection({ type: 'scenarios' })
            }}
            onNavigate={(name) => select({ type: 'playbook', name })}
            onError={setError}
          />
        ) : (
          <div className="loading">Playbook not found: {selection.name}</div>
        )}
      </main>
    </div>
  )
}
