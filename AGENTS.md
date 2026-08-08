# Project overlay

Shared rules are loaded from the user-scope `catalog.md`. This file contains
only rules true of this project.

## Goal

`goal.md` is this project's acceptance test. Its creation and maintenance
belong to this project's session.

## Session roles

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

All project planning, implementation, coordination, verification, audit, and
documentation use Codex only. Project work is not launched or delegated to
Claude.

Four distinct Codex sessions own the following roles. The liaison and
implementer run in the same issue worktree as separate sessions.

- **Codex — secretary.** Keeps the user-facing thread, coordinates work, and
  dispatches the liaison.
- **Codex — liaison.** Solely controls the implementer. The liaison does not
  implement, audit, or merge.
- **Codex — implementer.** Owns issue → branch → PR, verification, and audit
  responses under liaison control. The implementer does not audit or merge its
  own work.
- **Fresh Codex — independent auditor.** Has no implementation role and audits
  the resulting PR.

## Work-item intake

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- Decompose a product milestone before issue opening.
- One issue supplies one independently testable behavior or one mechanical
  prerequisite. Declared touch surfaces are required.
- Split an issue that combines simulation, player interaction, presentation,
  and deployment.
- Draft work does not justify a larger merge unit.
