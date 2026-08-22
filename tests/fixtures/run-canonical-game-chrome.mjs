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
        document.querySelectorAll('.formation-card').length === 7 &&
        document.querySelector('[data-region="battlefield"] canvas') !== null,
      5_000,
      'the canonical operation',
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(
      () => Number(document.querySelector('[data-region="battlefield"] canvas')?.dataset.drawCount) > 0,
      5_000,
      'the rendered battlefield canvas',
    );
    const actorTransformsBefore = new Map(
      [...document.querySelectorAll('.battlefield-actor-pip')]
        .map((actor) => [actor.dataset.actorId, actor.style.transform]),
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    const actorMotionChanges = [...document.querySelectorAll('.battlefield-actor-pip')]
      .filter((actor) => actorTransformsBefore.get(actor.dataset.actorId) !== actor.style.transform)
      .length;
    const actionEffectCount = document.querySelectorAll('.battlefield-action-effect').length;
    const contactPressureEffectCount = document.querySelectorAll(
      '[data-effect-kind="contact-pressure"]',
    ).length;
    const pressureFlowEffectCount = document.querySelectorAll(
      '[data-effect-kind="pressure-flow"]',
    ).length;
    const battlefieldExchangeCount = Number(
      document.querySelector('[data-region="battlefield"]')?.dataset.exchangeCount ?? 0,
    );
    const guidanceInput = document.querySelector('[aria-label$="하네스 지침"]');
    const formationDock = document.querySelector('.formation-dock-list');
    if (guidanceInput) {
      guidanceInput.value = '우회로 경계 강화';
      guidanceInput.dispatchEvent(new Event('input', { bubbles: true }));
      guidanceInput.focus();
      guidanceInput.setSelectionRange(3, 7);
    }
    if (formationDock) formationDock.scrollLeft = 180;
    await new Promise((resolve) => setTimeout(resolve, 450));
    const restoredGuidance = document.querySelector('[aria-label$="하네스 지침"]');
    const guidanceDraftPreserved = restoredGuidance?.value === '우회로 경계 강화';
    const guidanceFocusPreserved = document.activeElement === restoredGuidance &&
      restoredGuidance?.selectionStart === 3 && restoredGuidance?.selectionEnd === 7;
    const dockScrollPreserved = document.querySelector('.formation-dock-list')?.scrollLeft >= 100;
    restoredGuidance?.closest('.formation-card')
      ?.querySelector('[data-action="issue-guidance"]')?.click();

    const dockActor = document.querySelector('.actor-select');
    dockActor?.focus();
    const dockActorId = dockActor?.dataset.actorId ?? null;
    await new Promise((resolve) => setTimeout(resolve, 450));
    const dockFocusPreserved = dockActorId !== null &&
      document.activeElement?.classList.contains('actor-select') &&
      document.activeElement?.dataset.actorId === dockActorId;
    const actor = document.querySelector('.battlefield-actor-pip');
    actor?.click();
    const focusedActorId = actor?.dataset.actorId ?? null;
    const selectedActor = [...document.querySelectorAll('.battlefield-actor-pip')]
      .find((element) => element.dataset.actorId === focusedActorId);
    selectedActor?.focus();
    await new Promise((resolve) => setTimeout(resolve, 450));
    const battlefieldFocusPreserved = focusedActorId !== null &&
      document.activeElement?.dataset.actorId === focusedActorId;
    const battlefield = document.querySelector('[data-region="battlefield"]');
    const battlefieldCanvas = battlefield?.querySelector('canvas') ?? null;
    const battlefieldPixels = battlefieldCanvas?.getContext('2d')
      ?.getImageData(0, 0, battlefieldCanvas.width, battlefieldCanvas.height).data ?? [];
    const battlefieldColors = new Set();
    let battlefieldOpaqueSamples = 0;
    for (let index = 0; index < battlefieldPixels.length; index += 4096) {
      const alpha = battlefieldPixels[index + 3] ?? 0;
      if (alpha > 0) battlefieldOpaqueSamples += 1;
      battlefieldColors.add(
        String(battlefieldPixels[index] ?? 0) + ',' +
          String(battlefieldPixels[index + 1] ?? 0) + ',' +
          String(battlefieldPixels[index + 2] ?? 0) + ',' + String(alpha),
      );
    }
    const operationGrid = document.querySelector('.canonical-operation-grid');
    const battlefieldRect = battlefield?.getBoundingClientRect() ?? null;
    const operationGridRect = operationGrid?.getBoundingClientRect() ?? null;
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
      battlefieldCanvasCount: battlefield?.querySelectorAll('canvas').length ?? 0,
      battlefieldDrawCount: Number(battlefieldCanvas?.dataset.drawCount ?? 0),
      battlefieldColorSamples: battlefieldColors.size,
      battlefieldOpaqueSamples,
      actorMotionChanges,
      actionEffectCount,
      contactPressureEffectCount,
      pressureFlowEffectCount,
      battlefieldExchangeCount,
      guidanceDraftPreserved,
      guidanceFocusPreserved,
      dockScrollPreserved,
      dockFocusPreserved,
      battlefieldFocusPreserved,
      battlefieldVisualState: battlefield?.dataset.visualState ?? null,
      battlefieldOperationState: battlefield?.dataset.operationState ?? null,
      battlefieldFormationCount: Number(battlefield?.dataset.formationCount ?? 0),
      battlefieldActorCount: Number(battlefield?.dataset.actorCount ?? 0),
      battlefieldControlledFormationCount: Number(
        battlefield?.dataset.controlledFormationCount ?? 0,
      ),
      battlefieldUncontrolledFormationCount: Number(
        battlefield?.dataset.uncontrolledFormationCount ?? 0,
      ),
      battlefieldWidth: battlefieldRect?.width ?? 0,
      battlefieldHeight: battlefieldRect?.height ?? 0,
      operationGridWidth: operationGridRect?.width ?? 0,
      hostileInterventionControls: document.querySelectorAll(
        '.formation-card[data-controllable="false"] [data-action="set-formation-intent"], ' +
        '.formation-card[data-controllable="false"] [data-action="issue-guidance"]',
      ).length,
      legacyCommands: document.querySelectorAll(
        '[data-action="authorize-officer"], [data-action="route-report"], [data-action="prioritize-verification"]',
      ).length,
      visibleInternalIds: /observe-and-delay|forward-observation|intent:|guidance:/.test(
        document.body.innerText,
      ),
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
  result.operation.battlefieldCanvasCount === 1 &&
  result.operation.battlefieldDrawCount > 0 &&
  result.operation.battlefieldColorSamples > 4 &&
  result.operation.battlefieldOpaqueSamples > 0 &&
  result.operation.actorMotionChanges > 0 &&
  result.operation.actionEffectCount > 0 &&
  result.operation.contactPressureEffectCount > 0 &&
  result.operation.pressureFlowEffectCount > 0 &&
  result.operation.battlefieldExchangeCount > 0 &&
  result.operation.guidanceDraftPreserved === true &&
  result.operation.guidanceFocusPreserved === true &&
  result.operation.dockScrollPreserved === true &&
  result.operation.dockFocusPreserved === true &&
  result.operation.battlefieldFocusPreserved === true &&
  result.operation.battlefieldVisualState === "ready" &&
  result.operation.battlefieldOperationState === "running" &&
  result.operation.battlefieldFormationCount === 7 &&
  result.operation.battlefieldActorCount === 21 &&
  result.operation.battlefieldControlledFormationCount === 3 &&
  result.operation.battlefieldUncontrolledFormationCount === 4 &&
  result.operation.operationGridWidth > 0 &&
  result.operation.battlefieldWidth >= result.operation.operationGridWidth * 0.5 &&
  result.operation.battlefieldHeight >= 400 &&
  result.operation.hostileInterventionControls === 0 &&
  result.operation.legacyCommands === 0 &&
  result.operation.visibleInternalIds === false &&
  browserErrors.length === 0;
process.stdout.write(`${JSON.stringify({ passed, result, browserErrors })}\n`);
if (!passed) process.exitCode = 1;
