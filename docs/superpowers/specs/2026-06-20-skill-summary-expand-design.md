# Expandable skill summaries in playbook steps

## Problem

A playbook step can reference another playbook inline with `[[name]]`, and the
step editor renders an expand toggle (▸/▾) that shows a read-only `PlaybookPreview`
inline. Steps can also reference *skills* (Anthropic Agent Skills), but skills are
not a data source in Fly Half today, so a skill reference renders as a missing
playbook or as plain text. We want a step that references a skill to show an
expandable summary of that skill, mirroring the playbook-in-playbook experience.

## Decisions

- **Skill data source.** Discover skills by scanning directories for
  `<dir>/<name>/SKILL.md` files. The default scan directory is the user's global
  skills directory, `~/.claude/skills/`. Additional directories are supplied via a
  repeatable `--skills-dir <path>` CLI flag. Skills are **read-only** in the GUI —
  Fly Half never writes, renames, or deletes a skill file.
- **Reference syntax.** A step references a skill with slash-command syntax:
  `/skill-name` inline in the step text. This is visually distinct from the
  playbook `[[name]]` syntax and matches how skills are invoked in Claude Code.

## Out of scope (YAGNI)

- Auto-discovery of plugin skills nested under `~/.claude/plugins/...`. A user can
  point `--skills-dir` at such a directory if they want those skills surfaced.
- Editing skills from the GUI. Skills are external, read-only artifacts here.
- Showing the full `SKILL.md` body. The expandable preview shows the skill's
  `description` summary plus its source path — not the body.

## Architecture

### Backend — skill discovery (`server/store.js`)

Add a pure function (no `Store` instance state needed):

```
scanSkills(dirs) -> [{ name, description, source }]
```

- For each dir in `dirs`, list immediate subdirectories; for each subdir read
  `SKILL.md` if present.
- Parse the YAML frontmatter (the block between the leading `---` fences) with
  `js-yaml`, which is already a dependency. Take `name` and `description`.
- `name` falls back to the subdirectory name if frontmatter omits it.
  `description` falls back to `''`.
- `source` is the absolute path to the `SKILL.md`.
- A missing dir, a subdir without `SKILL.md`, or an unparseable frontmatter is
  skipped silently (best-effort discovery; one bad skill must not break state).
- Union by `name` across all dirs, **first-wins** on collision (so earlier dirs,
  i.e. the global dir, take precedence over later `--skills-dir` entries).

Expand `~` to the home directory when resolving the default global dir.

### Backend — wiring (`server/app.js`, `bin/cli.js`)

- `createApp(rootDir, opts = {})` accepts `opts.skillDirs` (array of extra dirs).
  It computes `skillDirs = [globalSkillsDir, ...opts.skillDirs]` and exposes a
  `store`-adjacent `listSkills()` that calls `scanSkills(skillDirs)`. Discovery
  runs per `/api/state` request (consistent with how playbooks are read fresh).
- `/api/state` response gains `skills: [{ name, description, source }]`.
- `brokenRefs` is unchanged — it stays playbook-only. `/skill` references are
  **not** broken-ref tracked, because a slash is common in ordinary prose
  (paths like `/tmp/x`, `and/or`, dates) and only tokens matching a known skill
  are ever surfaced.
- `bin/cli.js` collects repeatable `--skills-dir <path>` flags into an array and
  passes them as `createApp(rootDir, { skillDirs })`. The flag value is the token
  after `--skills-dir`. Existing `--no-open` handling is preserved.

### Frontend — reference detection (`src/refs.js`, `src/components/StepList.jsx`)

Add to `refs.js`:

```
skillRefs(text, skillNames) -> [name, ...]
```

- Match candidate tokens with `(?:^|\s)/([\w:-]+)` (a slash at a word boundary
  followed by name characters; `:` supports plugin-namespaced names like
  `superpowers:brainstorming`).
- Keep only tokens whose value is in `skillNames` (a `Set`). Exact-membership
  filtering means an unknown `/foo` stays plain text with no warning chip.

`StepList.jsx`:

- Receive `skills` (array) as a prop; derive `skillNames = new Set(...)`.
- Existing playbook `[[ ]]` chip rendering is unchanged.
- After the playbook ref chips, render a skill chip for each `skillRefs(...)` hit:
  a ▸/▾ expand toggle (reusing the existing `expanded` Set keyed by
  `"<stepIndex>:skill:<name>"`) and a label `⚡ <name>`. No ⧉-navigate button —
  skills have no editor page.
- When expanded, render `<SkillPreview skill={...} />` inline below the step,
  alongside the existing expanded `PlaybookPreview` block.
- **Typeahead.** Typing `/` at a word boundary opens a skill-suggestion list,
  parallel to the existing `[[` playbook typeahead. Reuse the typeahead UI and
  keyboard handling; track which trigger is active (`'playbook'` via `[[` vs
  `'skill'` via `/`) so `acceptSuggestion` inserts the right token (`[[name]]`
  vs `/name`). Suggestions come from `skillNames`.

### Frontend — `src/components/SkillPreview.jsx` (new)

- Read-only, non-recursive (a skill does not nest playbook steps in this model).
- Props: `skill` (`{ name, description, source }`).
- Renders the `description` summary; if empty, a muted `(no description)`.
  Renders the `source` path in a muted footer.
- Mirror the `.preview` styling used by `PlaybookPreview` for visual consistency.

## Data flow

1. `cli.js` parses `--skills-dir` → `createApp(rootDir, { skillDirs })`.
2. Browser calls `/api/state` → server returns `{ scenarios, playbooks, skills, brokenRefs }`.
3. `App` passes `skills` down to `StepList`.
4. `StepList` detects `/skill` tokens, renders chips, and expands to `SkillPreview`.

## Error handling

- Discovery is best-effort: missing dirs / missing `SKILL.md` / bad frontmatter
  are skipped, never thrown. State always returns a (possibly empty) `skills`
  array.
- Unknown `/foo` tokens are never chips and never flagged — prose is untouched.
- An expanded skill that has since disappeared from `skills` simply renders no
  preview (chip filter is membership-based each render).

## Testing

- `server/store` (or a dedicated test): `scanSkills` parses frontmatter from a
  temp dir, falls back to dir name when `name` is absent, skips a subdir without
  `SKILL.md`, skips a missing dir, and dedups first-wins across dirs.
- `server/app.test`: `/api/state` includes a `skills` array; an extra `skillDirs`
  entry is reflected.
- `StepList.test`: a known `/skill` renders a chip and expands to show the
  summary; an unknown `/foo` stays plain text; the `/` typeahead suggests skills
  and inserts `/name`.
- `SkillPreview.test`: renders description and source; shows `(no description)`
  fallback.

## Docs

- Update the README skills bullet to document `/skill` references and the
  `--skills-dir` flag (default `~/.claude/skills`).
