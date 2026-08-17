# Project guidance

## Runtime-first workflow

1. Keep each change inside one independently testable GitHub issue and its
   declared touch surface.
2. Build the smallest runnable behavior before judging the design.
3. Exercise it through the real browser, CLI, or headless simulation.
4. Fix observed failures, then run focused tests and `npm run check`.
5. Block delivery only for a reproducible acceptance, build, runtime, data-loss,
   or security failure. Queue other improvements as separate issues.
6. Run non-overlapping issue worktrees in parallel when useful.

## Sources of truth

- `README.md` explains setup and the current product.
- `docs/architecture/dependency-directions.md` defines module responsibilities
  and allowed dependencies.
- GitHub issues and pull requests own remaining work and development history.

Do not add local transcripts, audit evidence, cycle ledgers, or duplicate status
documents. Korean player copy and Korean-facing project text remain Korean.
