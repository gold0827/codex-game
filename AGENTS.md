# Project overlay

Shared rules are loaded from the user-scope `catalog.md`. This file contains
only rules true of this project.

## Goal

`goal.md` is this project's acceptance test. Its creation and maintenance
belong to this project's session.

## Korean reader-facing surfaces

Project proposals written for Korean readers and player-visible game copy are
Korean reader-facing surfaces under `catalog.md` § Language.

## Session roles

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

All project planning, implementation, coordination, verification, audit, and
documentation use Codex only. Four distinct Codex sessions own these roles:

- **Codex secretary.** Keeps the user-facing thread, selects one work item,
  dispatches the issue worktree, and merges only after independent audit.
- **Codex liaison.** Runs beside the implementer in the issue worktree and is
  its sole controller. The liaison does not implement, audit, or merge.
- **Codex implementer.** Owns issue → branch → PR, verification, and audit
  responses under liaison control. The implementer does not audit or merge its
  own work.
- **Fresh Codex auditor.** Has no implementation or liaison role and audits the
  issue and PR artifacts before merge.

## Cycle continuity

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- Pin the Codex model and reasoning effort for every role launch.
- An unavailable Orca runtime stops cycle mutation. Resume after tracked
  transport is restored; do not substitute local files or direct prompts.

## Work-item intake

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- Decompose a product milestone before issue opening.
- One issue supplies one independently testable behavior or one mechanical
  prerequisite. Declared touch surfaces are required.
- Split an issue that combines simulation, player interaction, presentation,
  and deployment.
- Draft work does not justify a larger merge unit.

## External coordination

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- Keep product work and control-friction records in this repository.
- Do not create or update an issue, pull request, or comment in another
  repository without explicit user approval for that action.
- Report a proposed external coordination action to the user before acting.
