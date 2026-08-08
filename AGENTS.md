# Project overlay

Shared rules are loaded from the user-scope `catalog.md`. This file contains
only rules true of this project.

## Goal

`goal.md` is this project's acceptance test. Its creation and maintenance
belong to this project's session.

## Session roles

Bootstrap rule — expires after 3 cycles under `catalog.md` § How a rule enters.

- **Claude — secretary and independent auditor.** Keeps the user-facing thread,
  dispatches implementation, and audits the resulting PR.
- **Codex — implementer.** Owns issue → branch → PR and audit responses.
