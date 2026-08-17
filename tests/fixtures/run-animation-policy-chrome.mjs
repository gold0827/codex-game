import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const { browserErrors, result } = await runChromeAcceptance(async ({
  evaluate,
  importFixture,
  navigate,
}) => {
  await navigate({
    path: "./",
    readyExpression: `document.querySelector("#app [data-phase='briefing']") !== null`,
    readyLabel: "the production briefing",
  });
  await importFixture(
    "/codex-game/tests/fixtures/animation-policy-chrome.ts",
    "Canvas animation policy fixture",
  );
  return evaluate(
    `globalThis.__animationPolicyFixtureResult ?? null`,
    "Canvas animation policy report",
  );
});

const passed = result?.passed === true && browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({ passed, result, browserErrors })}\n`);
if (!passed) process.exitCode = 1;
