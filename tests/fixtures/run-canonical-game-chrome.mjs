import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result } = await runChromeAcceptance(async ({ evaluate, navigate }) => {
  await navigate({
    path: "./",
    readyExpression: `document.querySelector("#app [data-phase='briefing']") !== null`,
    readyLabel: "the Chuncheon briefing",
  });
  return evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs, label) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for ' + label + '.');
    };
    document.querySelector('[data-action="start-attempt"]')?.click();
    await waitFor(
      () => document.querySelectorAll('.decision-stage-list li').length === 0 &&
        document.querySelectorAll('.formation-card').length === 7,
      5_000,
      'the canonical operation',
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const actor = document.querySelector('.actor-select');
    actor?.click();
    document.querySelector('[data-action="set-formation-intent"]')?.click();
    const operation = {
      formations: document.querySelectorAll('.formation-card').length,
      actors: document.querySelectorAll('.actor-select').length,
      evidence: document.querySelectorAll('.objective-evidence-list li').length,
      stages: document.querySelectorAll('.decision-stage-list li').length,
      harnessPolicies: document.querySelectorAll('.canonical-policy-list dt').length,
      recentEvents: document.querySelectorAll('.event-flow-item').length,
      interventionReceipt: document.querySelector('.intervention-receipt')?.textContent ?? null,
      interventionBudget: document.querySelector('.intervention-budget')?.textContent ?? null,
      controllableFormations: document.querySelectorAll('.formation-card[data-controllable="true"]').length,
      hostileInterventionControls: document.querySelectorAll(
        '.formation-card[data-controllable="false"] [data-action="set-formation-intent"], ' +
        '.formation-card[data-controllable="false"] [data-action="issue-guidance"]',
      ).length,
      legacyCommands: document.querySelectorAll(
        '[data-action="authorize-officer"], [data-action="route-report"], [data-action="prioritize-verification"]',
      ).length,
    };
    document.querySelector('[data-action="speed-2"]')?.click();
    await waitFor(
      () => document.querySelector("#app [data-phase='debrief']") !== null,
      60_000,
      'the resolved debrief',
    );
    return {
      phase: document.querySelector('#app [data-phase]')?.dataset.phase ?? null,
      debriefObjectives: document.querySelectorAll('.debrief-objective').length,
      operation,
    };
  })()`, "canonical game report");
});

const passed = result?.phase === "debrief" &&
  result.debriefObjectives === 3 &&
  result.operation.formations === 7 &&
  result.operation.actors === 21 &&
  result.operation.evidence === 3 &&
  result.operation.stages === 5 &&
  result.operation.harnessPolicies === 4 &&
  result.operation.recentEvents > 0 &&
  result.operation.interventionReceipt?.includes("편성 개입 접수") &&
  result.operation.interventionBudget?.includes("3 / 4") &&
  result.operation.controllableFormations === 3 &&
  result.operation.hostileInterventionControls === 0 &&
  result.operation.legacyCommands === 0 &&
  browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({ passed, result, browserErrors })}\n`);
if (!passed) process.exitCode = 1;
