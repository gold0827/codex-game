import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result: gameReport } = await runChromeAcceptance(async ({
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
    "/codex-game/tests/fixtures/bridge-defense-chrome.ts",
    "Bridge defense fixture",
  );
  return evaluate(`(() => {
    const output = document.querySelector("#fixture-result")?.textContent;
    return {
      url: location.pathname,
      result: output ? JSON.parse(output) : null,
      phase: document.querySelector("#app [data-phase]")?.dataset.phase ?? null,
      operationClock: document.querySelector(".operation-clock")?.textContent ?? null,
    };
  })()`, "Bridge defense report");
});

const passed = gameReport.url === "/codex-game/" &&
  gameReport.result?.passed === true &&
  browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({
  passed,
  ...gameReport,
  productionErrors: browserErrors,
})}\n`);
if (!passed) process.exitCode = 1;
