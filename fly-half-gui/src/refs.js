// A scenario's `then` is one playbook name, or a list of them. Normalize to a list.
export function thenPlaybooks(then) {
  if (Array.isArray(then)) return then.filter((n) => typeof n === 'string' && n !== '')
  return then ? [then] : []
}

// How many scenarios trigger the playbook `name`
export function scenarioUsage(scenarios, name) {
  return scenarios.filter((s) => thenPlaybooks(s.then).includes(name)).length
}

// Skills are referenced in step text with slash-command syntax: `/skill-name`.
// A slash must sit at a word boundary (start of text or after whitespace) so
// paths and prose like "path/x" or "and/or" don't match. Only tokens that name
// a known skill are returned — an unknown `/foo` is left as plain text.
const SKILL_REF_RE = /(?:^|\s)\/([\w:-]+)/g
export function skillRefs(text, skillNames) {
  return [...String(text).matchAll(SKILL_REF_RE)]
    .map((m) => m[1])
    .filter((n) => skillNames.has(n))
}
