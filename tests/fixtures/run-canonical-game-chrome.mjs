import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result } = await runChromeAcceptance(async ({ evaluate, navigate }) => {
  await navigate({
    path: "./",
    readyExpression: `document.querySelector("#app [data-phase='briefing']") !== null`,
    readyLabel: "the Chuncheon briefing",
  });
  return evaluate(`(async () => {
    document.querySelector('[data-action="start-attempt"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const actor = document.querySelector('.actor-select');
    actor?.click();
    return {
      phase: document.querySelector('#app [data-phase]')?.dataset.phase ?? null,
      formations: document.querySelectorAll('.formation-card').length,
      actors: document.querySelectorAll('.actor-select').length,
      evidence: document.querySelectorAll('.objective-evidence-list li').length,
      stages: document.querySelectorAll('.decision-stage-list li').length,
      legacyCommands: document.querySelectorAll(
        '[data-action="authorize-officer"], [data-action="route-report"], [data-action="prioritize-verification"]',
      ).length,
    };
  })()`, "canonical game report");
});

const passed = result?.phase === "operation" &&
  result.formations > 0 &&
  result.actors > 0 &&
  result.evidence > 0 &&
  result.stages === 5 &&
  result.legacyCommands === 0 &&
  browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({ passed, result, browserErrors })}\n`);
if (!passed) process.exitCode = 1;
