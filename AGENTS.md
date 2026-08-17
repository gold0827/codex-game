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

- **Codex secretary.** Keeps the user-facing thread, dispatches independent
  issue worktrees in parallel when their touch surfaces do not overlap, and
  merges only after runtime verification and a final independent verdict.
- **Codex liaison.** Runs beside the implementer in the issue worktree and is
  its sole controller. It enforces scope and transport without adding a design
  approval gate. The liaison does not implement, audit, or merge.
- **Codex implementer.** Owns issue → branch → PR, verification, and audit
  responses under liaison control. It implements first, exercises the result in
  its real runtime, and fixes observed failures before requesting a verdict.
  The implementer does not audit or merge its own work.
- **Fresh Codex auditor.** Runs once after implementation and runtime evidence
  are complete. It reproduces only acceptance-critical paths and returns a
  fatal-only verdict without merging.

## Runtime-first cycle

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

1. Dispatch the declared touch surface without a pre-implementation design or
   audit gate.
2. Build the smallest runnable behavior.
3. Exercise it through the real game, browser, CLI, or headless simulation that
   players and maintainers will use.
4. Fix failures observed in that execution, then run focused tests and the
   repository check.
5. Open the PR with runtime evidence. A fresh auditor performs one fatal-only
   pass against the implemented behavior.
6. A finding blocks merge only when it reproduces a declared acceptance failure,
   data loss, security issue, or build/runtime break. Record improvements outside
   the issue touch surface as later work instead of expanding the current cycle.

## Cycle continuity

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- Pin the Codex model and reasoning effort for every role launch.
- An unavailable Orca runtime stops cycle mutation. The affected role writes
  `.cycle/STOP.md` with its role, failed command, timestamp, and uncommitted
  state, then halts. This is a one-way distress beacon, not a message channel.
- Resume after tracked transport is restored; do not continue through direct
  prompts or a file-based message channel.
- The secretary may take over an orphaned implementer Run only after recording
  the former liaison dispatch, uncommitted state, and reason in a liaison
  handoff note. The takeover becomes the implementer's sole controller.

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
