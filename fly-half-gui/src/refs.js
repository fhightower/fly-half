// A scenario's `then` is one playbook name, or a list of them. Normalize to a list.
export function thenPlaybooks(then) {
  if (Array.isArray(then)) return then.filter((n) => typeof n === 'string' && n !== '')
  return then ? [then] : []
}

// How many scenarios trigger the playbook `name`
export function scenarioUsage(scenarios, name) {
  return scenarios.filter((s) => thenPlaybooks(s.then).includes(name)).length
}
