import { runChromeAcceptance } from "./chrome-acceptance-runner.mjs";

const acceptance = await runChromeAcceptance(async ({ evaluate, navigate }) => {
  await navigate({
    path: "./",
    readyExpression: `document.querySelector(".squad-battle-game canvas[data-actor-count='18']") !== null`,
    readyLabel: "the production squad battle",
  });

  return evaluate(`(async () => {
    const action = (name) => {
      const button = document.querySelector('[data-action="' + name + '"]');
      if (!button) throw new Error('Missing squad battle action ' + name);
      button.click();
      return button;
    };
    action('main-advance');
    action('deploy-north');
    action('relief-focus-assault');
    action('speed-2');
    const enemyFormationSamples = new Set();
    let enemyMovementCueObserved = false;
    let squadLabelsObserved = false;
    const observationDeadline = performance.now() + 8_000;
    while (performance.now() < observationDeadline) {
      const observedCanvas = document.querySelector('canvas.battlefield-canvas');
      const formation = observedCanvas?.dataset.drawnEnemyFormationCenter;
      if (formation) enemyFormationSamples.add(formation);
      enemyMovementCueObserved ||= Number(observedCanvas?.dataset.enemyMovementCueCount ?? 0) > 0;
      squadLabelsObserved ||= Number(observedCanvas?.dataset.squadLabelCount ?? 0) >= 3;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const beforePause = document.querySelector('.squad-battle-clock')?.textContent ?? '';
    action('pause');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterPause = document.querySelector('.squad-battle-clock')?.textContent ?? '';
    const canvas = document.querySelector('canvas.battlefield-canvas');
    const main = document.querySelector('[data-squad-id="main"]');
    const relief = document.querySelector('[data-squad-id="relief"]');
    const shell = document.querySelector('.squad-battle-game');
    const commands = document.querySelector('.squad-battle-commands');
    const commandsVisible = Boolean(commands && commands.getBoundingClientRect().top < innerHeight);
    return {
      passed: Boolean(
        shell &&
        canvas?.dataset.actorCount === '27' &&
        canvas?.dataset.allyActorCount === '18' &&
        canvas?.dataset.enemyActorCount === '9' &&
        Number(canvas?.dataset.drawCount ?? 0) > 0 &&
        enemyFormationSamples.size >= 4 &&
        enemyMovementCueObserved &&
        squadLabelsObserved &&
        commandsVisible &&
        main?.textContent.includes('진군') &&
        relief?.textContent.includes('집중 공격') &&
        beforePause === afterPause &&
        document.querySelector('[data-action="resume"]')
      ),
      status: shell?.dataset.status ?? null,
      beforePause,
      afterPause,
      actorCount: canvas?.dataset.actorCount ?? null,
      allyActorCount: canvas?.dataset.allyActorCount ?? null,
      enemyActorCount: canvas?.dataset.enemyActorCount ?? null,
      drawCount: Number(canvas?.dataset.drawCount ?? 0),
      enemyFormationSampleCount: enemyFormationSamples.size,
      enemyMovementCueObserved,
      squadLabelsObserved,
      commandsVisible,
      mainText: main?.textContent ?? null,
      reliefText: relief?.textContent ?? null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`, "play the production squad battle");
});

const output = {
  passed: acceptance.browserErrors.length === 0 && acceptance.result.passed,
  result: acceptance.result,
  browserErrors: acceptance.browserErrors,
};
process.stdout.write(`${JSON.stringify(output)}\n`);
if (!output.passed) process.exitCode = 1;
