import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result } = await runChromeAcceptance(async ({
  evaluate,
  importFixture,
  navigate,
}) => {
  await navigate({
    path: "./?legacy=1",
    readyExpression: `document.querySelector("#app [data-phase='briefing']") !== null`,
    readyLabel: "the production bridge briefing",
  });
  await importFixture(
    "/codex-game/tests/fixtures/panic-canvas-chrome.ts",
    "Panic Canvas fixture",
  );
  return evaluate(
    `globalThis.__panicCanvasFixtureResult ?? null`,
    "Panic Canvas report",
  );
});

const passed = result?.passed === true && browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({ passed, result, browserErrors })}\n`);
if (!passed) process.exitCode = 1;

