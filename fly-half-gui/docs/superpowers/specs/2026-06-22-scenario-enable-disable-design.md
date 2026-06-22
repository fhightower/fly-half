# Enable/disable scenarios from the GUI

## Goal

Let a user toggle a scenario on or off in the GUI without deleting it. A
disabled scenario stays in `scenarios.yaml` but is marked so the agent loop
skips it.

## Data model

A scenario gains one optional field:

```yaml
scenarios:
  - when: A release is cut
    then: Notify the team
  - when: There is a ticket in "In Review" assigned to me
    then: Review a ticket assigned to me
    disabled: true
```

- `disabled: true` — the scenario is inactive; agents skip it.
- Field absent (or `false`) — the scenario is enabled.

Default-enabled-when-absent keeps existing files byte-identical until a
scenario is actually disabled, and is backward compatible with any agent that
hasn't learned the field yet (it just keeps running every scenario).

## Server (`server/store.js`)

- `validateScenarios`: add `disabled` to the per-scenario key whitelist and
  validate it via a new `isValidDisabled(v)` helper (`undefined` or boolean).
- `cleanScenario`: write `disabled: true` only when truthy; omit it otherwise
  — same minimal-YAML approach already used for empty `ai_agent_notes`. Key
  order on write: `when`, `then`, `disabled?`, `ai_agent_notes?`.
- `readScenarios`: already spreads unknown keys through (`{ ...s }`), so
  `disabled` survives a read. No change needed there beyond validation/clean.

## UI (`src/components/ScenariosEditor.jsx`, `src/styles.css`)

- Each scenario row gets a toggle switch in the trailing action cell, stacked
  above the existing delete ✕ button. The grid's last column changes from a
  fixed `34px` to `auto`, with a `.scenario-actions` flex column holding the
  switch and the delete button.
- Toggle handler: `update(i, { disabled: !s.disabled })`, which marks the
  editor dirty like any other edit and persists on Save.
- A disabled row renders dimmed: a `disabled` modifier class on the `when`
  textarea, the `then-cell`, and the notes `<details>` reduces opacity. The row
  keeps its position — no reordering or hiding.
- "+ Scenario" creates an enabled scenario (no `disabled` field written).
- The switch is an accessible `<button>` with `aria-pressed` reflecting the
  enabled state and a `title` describing the action.

## README

Document the `disabled` field under the Scenarios section, including the
contract that agents skip scenarios where `disabled: true`.

## Testing

- `server/store.test.js`: round-trips `disabled: true`; omits the field when
  `false`/absent on write; rejects a non-boolean `disabled`.
- `src/components/ScenariosEditor.test.jsx`: toggling flips state and dims the
  row; saving sends `disabled: true`; a new scenario is enabled by default.
- Existing tests stay green.

## Out of scope

- The external agent loop that scans `scenarios.yaml` lives outside this repo.
  This change only persists and surfaces the flag (plus documents the
  skip contract); honoring it at scan time is the agent's responsibility.
