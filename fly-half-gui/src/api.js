async function req(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const getState = () => req('/api/state')
export const saveScenarios = (scenarios) =>
  req('/api/scenarios', { method: 'PUT', body: JSON.stringify({ scenarios }) })
export const savePlaybook = (name, data) =>
  req(`/api/playbooks/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deletePlaybook = (name) =>
  req(`/api/playbooks/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const getReferrers = (name) => req(`/api/playbooks/${encodeURIComponent(name)}/referrers`)
export const renamePlaybook = (name, newName) =>
  req(`/api/playbooks/${encodeURIComponent(name)}/rename`, {
    method: 'POST',
    body: JSON.stringify({ newName }),
  })
