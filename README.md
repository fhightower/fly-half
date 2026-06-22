# Fly Half

A simple, file-based system for capturing workflows ("playbooks") that AI agents act on, plus a local GUI for creating and managing them.

In rugby, the fly-half reads the game and decides which play to run. Fly Half does the same for agents: an agent runs on a loop, scans a list of scenarios, and when one matches, executes the corresponding playbook.

## How it works

Everything is plain YAML on disk — agents read the files directly, no database or API required.

```
work-directory/
  scenarios.yaml        # the single file agents scan for triggers
  playbooks/
    <name>.yaml         # one file per playbook
```

### Scenarios

`scenarios.yaml` maps trigger conditions to playbooks. Keeping all triggers in one file means an agent loop only has to scan a single file, not every playbook:

```yaml
scenarios:
  - when: There is a ticket in "In Review" that's assigned to me
    then: Review a ticket assigned to me
    ai_agent_notes:
      - Only act on tickets assigned to me, not ones I'm just watching.
  - when: A release is cut
    then:
      - Notify the team
      - Validate release live on prod
```

- `when` — a natural-language description of the condition, interpreted by the agent
- `then` — the playbook to run, or a list of playbooks to run in order (a single name is kept as a scalar)
- `ai_agent_notes` — optional list of free-form guidance strings for the agent (a single string is accepted and normalized to a one-item list)
- `disabled` — optional boolean. When `true`, agents skip the scenario; the field is absent on active scenarios. This lets you turn a scenario off without deleting it (toggle it from the GUI), and is backward compatible — a scenario with no `disabled` field is enabled.

### Playbooks

A playbook is an ordered list of steps. Each step is a plain-text instruction that can reference other playbooks — playbooks nest and compose, so common procedures are written once and reused:

```yaml
name: Review a ticket assigned to me
description: Review a ticket that has been assigned to me
ai_agent_notes:
  - Pass the PR URL/number as args. The skill runs `gh pr view --json title,body,...` + `gh pr diff`.
  - For config-only diffs the diff alone is not enough — fetch the full surrounding source to validate claims.
  - Run gh from /tmp.

steps:
  - Pull details for the ticket
  - text: A step can also carry its own notes
    ai_agent_notes:
      - Skip this if the ticket has no description
```

A step is a plain string or `{text, ai_agent_notes}` — `ai_agent_notes` is an optional list of free-form guidance strings for the executing agent (a single string is accepted and normalized to a one-item list).

Step text references other playbooks *inline* with wiki-link syntax:

```yaml
steps:
  - Start a new tmux session with [[start_tmux_agent]] and send it the ticket details
  - Tell the new tmux agent to [[review_ticket]]
```

Inline `[[refs]]` are first-class: renames rewrite them, deletes warn about them, and missing targets are flagged.

A step can also reference a **skill** (an [Anthropic Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)) with slash-command syntax, `/skill-name`:

```yaml
steps:
  - Use /review-pr to review the PR, then [[notify_team]]
```

Only a `/token` that names a discovered skill is treated as a reference (so paths and prose like `/tmp/x` or `and/or` are left alone). In the GUI a skill reference shows an expandable chip that previews the skill's summary inline, the same way a referenced playbook expands. Skills are read-only — Fly Half never edits a skill file.

There is deliberately no distinction between "playbooks" and "actions" — everything is a playbook, and small reusable ones serve as building blocks for larger ones.

## The GUI

[`fly-half-gui/`](fly-half-gui/) is a local web app for visually creating, editing, and deleting scenarios and playbooks. It reads and writes the same YAML files the agents consume.

```bash
cd fly-half-gui
npm install
npm run build
node bin/cli.js /path/to/your/project   # serves on http://localhost:4242
```

`/path/to/your/project` is the **data directory** — where `scenarios.yaml` and `playbooks/` live. It is independent of where the GUI is installed, so you can keep your scenario files anywhere and point the GUI at them:

```bash
node /opt/fly-half-gui/bin/cli.js ~/my-agent-workflows
```

If omitted, the data directory defaults to the current working directory. Either way, `scenarios.yaml` and `playbooks/` must be siblings under that one directory; missing ones are created on first run.

Other flags:

- `--no-open` — don't auto-open a browser
- `--skills-dir <path>` — scan an additional directory for skills (repeatable). Each skill is a `<name>/SKILL.md` package with `name` and `description` frontmatter. The user's global skills directory (`~/.claude/skills`) is always scanned.
- `PORT=<n>` — serve on a different port (default `4242`)

After `npm install`, the package also exposes a `fly-half-gui` binary equivalent to `node bin/cli.js`.

For development, a Vite dev server with API proxy:

```bash
npm run dev   # UI on http://localhost:5173, API on :4242
```

Tests run with `npm test`.

Features:

- Sidebar library of playbooks with search, plus the scenario list
- Structured step editor (drag to reorder, `[[ref]]` typeahead with click-through navigation) and an editable YAML source tab, kept in sync
- Explicit save with dirty indicators; writes are atomic so an agent never reads a half-written file
- Renaming a playbook automatically updates every reference to it; deleting one warns you about referrers; broken references are flagged with ⚠

## Design principles

- **Files are the source of truth.** Agents and humans share the same plain YAML — diffable, version-controllable, editable by hand, by GUI, or by another agent.
- **One scan file.** Triggers live in `scenarios.yaml` so the agent loop is cheap.
- **Natural language where it helps.** Conditions and steps are prose for an LLM to interpret; structure exists only where it buys consistency (references, ordering).
- **Compose, don't duplicate.** Nested playbook references keep procedures DRY.

## Similar libraries

- **[Agent Events](https://agentevents.io)** — an open format for scheduled and event-driven agent workflows. Each event is a directory package (`EVENT.md` with YAML frontmatter plus optional `scripts/`, `references/`, `skills/`) and the spec defines a taxonomy of eight trigger types (cron, webhooks, state changes, absence, composite, …). Fly Half covers similar ground with a deliberately smaller surface: a single free-text `when` interpreted by the agent, one central scan file instead of per-package discovery, and nested playbook composition. The two could interoperate — a Fly Half scenario + playbook maps fairly naturally onto an `EVENT.md`.
- **[Anthropic Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)** — markdown skill packages that define *what* an agent can do; Fly Half's scenarios focus on *when* to act and playbooks sequence the steps. Skills are referenced from playbook steps with `/skill-name`, and the GUI previews their summaries inline.
- **Workflow engines (n8n, Temporal, GitHub Actions)** — deterministic, machine-executed pipelines with explicit triggers. Fly Half targets the opposite end: loosely specified, natural-language procedures executed by an LLM agent that fills in the gaps.

![Fly Half](fly-half.png)

