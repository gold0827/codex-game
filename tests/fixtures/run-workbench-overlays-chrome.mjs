import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result: overlayReport } = await runChromeAcceptance(async ({
  evaluate,
  importFixture,
  navigate,
}) => {
  await navigate({
    path: "./?editor=1",
    readyExpression: `document.querySelector("#app [data-phase='briefing']") !== null`,
    readyLabel: "the Chuncheon briefing with an inert retired editor query",
  });
  await importFixture(
    "/codex-game/tests/fixtures/workbench-overlays-chrome.ts",
    "Workbench overlay fixture",
  );
  return evaluate(`({
    url: location.pathname + location.search,
    phase: document.querySelector("#app [data-phase]")?.dataset.phase ?? null,
    result: globalThis.__overlayFixtureResult ?? null,
  })`, "Workbench overlay report");
});

const passed = overlayReport.url === "/codex-game/?editor=1" &&
  overlayReport.result?.passed === true &&
  browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({
  passed,
  ...overlayReport,
  productionErrors: browserErrors,
})}\n`);
if (!passed) process.exitCode = 1;
