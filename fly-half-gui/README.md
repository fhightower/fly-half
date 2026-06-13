# playbook-gui

A local visual editor for agent playbooks and scenarios stored as plain YAML files. Point it at a directory; agents read the same files directly.

## File format

```
your-dir/
  scenarios.yaml        # single file agents scan for triggers
  playbooks/
    <name>.yaml         # one file per playbook
```

`scenarios.yaml`:

```yaml
scenarios:
  - when: There is a ticket in "In Review" assigned to me
    then: review_ticket_assigned_to_me
```

`playbooks/<name>.yaml`:

```yaml
name: review_ticket_assigned_to_me
description: Optional one-liner
steps:
  - Pull details for the ticket
  - playbook: review_ticket # nested playbook reference
```

A step is a plain string (an instruction), `{text, ai_agent_notes}` (an instruction with agent guidance), or `{playbook, ai_agent_notes?}` (run another playbook). Playbooks may also carry a top-level `ai_agent_notes` field; the GUI exposes these through collapsed "AI agent notes" accordions.

## Usage

```bash
npm install
npm run build
node bin/cli.js /path/to/your/playbooks-dir   # serves on http://localhost:4242
```

Development (Vite dev server with API proxy):

```bash
npm run dev   # UI on http://localhost:5173, API on :4242
```

## Features

- Sidebar listing scenarios + playbooks with search
- Structured step editor (drag to reorder, playbook-ref picker) with an editable YAML source tab
- Explicit save with dirty indicators; atomic file writes so agents never read half-written files
- Rename updates all references automatically; delete warns about referrers; broken references are flagged with ⚠

## Tests

```bash
npm test
```
