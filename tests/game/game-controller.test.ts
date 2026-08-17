import { describe, expect, it } from "vitest";

import type { CampaignDefinition } from "../../src/campaign";
import {
  createGameController,
  GameControllerError,
  type GameController,
} from "../../src/game";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { BALANCED_HARNESS } from "../../src/simulation/simulationTypes";

const POOR_HARNESS = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
} as const;

function advanceToOperationTime(
  controller: GameController,
  operationElapsedMs: number,
): void {
  const simulationSpeed = controller.snapshot().scene.gameplayTuning.simulationSpeed;
  controller.tick(operationElapsedMs / simulationSpeed);
}

function completeTutorial(controller: GameController): void {
  const routeStep = controller
    .snapshot()
    .scene.guidance.find((step) => step.action === "route");
  if (!routeStep || routeStep.action !== "route") return;
  const reportBeat = controller.snapshot().scene.beats.find((beat) =>
    beat.reports.some(({ id }) => id === routeStep.target.reportId),
  );
  advanceToOperationTime(controller, reportBeat?.timeMs ?? 0);
  expect(controller.snapshot().tutorial.active).toBe(true);
  controller.pause();

  const inspectStep = controller.snapshot().tutorial.currentStep;
  if (inspectStep?.action === "inspect") {
    controller.inspectOfficer(inspectStep.target.officerId);
  }
  controller.routeReport(
    routeStep.target.reportId,
    routeStep.target.recipientOfficerId,
  );
  controller.resume();
  expect(controller.snapshot().tutorial.currentStep).toBeNull();
}

function finishAttempt(controller: GameController): void {
  const snapshot = controller.snapshot();
  const remaining =
    snapshot.scene.encounterParameters.durationMs -
    (snapshot.operation?.elapsedMs ?? 0);
  controller.tick(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 1);
}

function completeSharedBeliefObjective(controller: GameController): void {
  const snapshot = controller.snapshot();
  if (snapshot.scene.identity.id !== "night-switchboard") return;
  const message = snapshot.operation?.messages[0];
  const missingRecipient = completeCampaign.officers.find(({ id }) =>
    id !== message?.sourceOfficerId && !message?.recipientOfficerIds.includes(id));
  if (!message || !missingRecipient) {
    throw new Error("Night switchboard requires one missing report recipient.");
  }
  controller.routeReport(message.authoredReportId, missingRecipient.id);
}

function playBalancedAttempt(controller: GameController): void {
  controller.startAttempt();
  completeTutorial(controller);
  completeSharedBeliefObjective(controller);
  finishAttempt(controller);
}

describe("game controller briefing and harness", () => {
  it("starts at the authored campaign scene and exposes a complete briefing", () => {
    const controller = createGameController(completeCampaign, "base-seed");
    const snapshot = controller.snapshot();
    const startScene = completeCampaign.scenes.find(
      ({ identity }) => identity.id === completeCampaign.startSceneId,
    );

    expect(snapshot).toMatchObject({
      phase: "briefing",
      attemptNumber: 1,
      progress: {
        currentSceneId: completeCampaign.startSceneId,
        completedSceneIds: [],
        completed: false,
      },
      harness: BALANCED_HARNESS,
    });
    expect(snapshot.scene).toEqual(startScene);
    expect(snapshot.briefing).toEqual({
      copy: startScene?.copy,
      presentation: startScene?.presentation,
      objectives: startScene?.objectives,
      harnessBudget: snapshot.harnessBudget,
    });
    expect(snapshot.harnessBudget.spent).toBeLessThanOrEqual(
      snapshot.harnessBudget.available,
    );
  });

  it("changes one axis only in briefing and rejects invalid or over-budget changes atomically", () => {
    const controller = createGameController(completeCampaign, 7);
    controller.configureHarness("informationReach", 0.2);
    expect(controller.snapshot().harness).toEqual({
      ...BALANCED_HARNESS,
      informationReach: 0.2,
    });

    const beforeInvalid = controller.snapshot();
    expect(() => controller.configureHarness("informationReach", -0.1)).toThrow(
      GameControllerError,
    );
    expect(controller.snapshot()).toEqual(beforeInvalid);

    const beforeOverBudget = controller.snapshot();
    expect(() =>
      controller.setHarness({
        informationReach: 1,
        authorityClarity: 1,
        verificationDepth: 1,
        feedbackCompression: 1,
      }),
    ).toThrow(/only 80 are available/);
    expect(controller.snapshot()).toEqual(beforeOverBudget);

    controller.startAttempt();
    const beforeLateChange = controller.snapshot();
    expect(() => controller.configureHarness("informationReach", 0.4)).toThrow(
      /briefing phase/,
    );
    expect(controller.snapshot()).toEqual(beforeLateChange);
  });
});

describe("game controller operation", () => {
  it("makes segmented and one-call real-time ticking equivalent with fractional carry", () => {
    const single = createGameController(completeCampaign, "timing");
    const segmented = createGameController(completeCampaign, "timing");
    single.startAttempt();
    segmented.startAttempt();
    single.setPlayerSpeed(0.5);
    segmented.setPlayerSpeed(0.5);

    single.tick(20_003.5);
    [0.5, 1, 17, 300, 9_001, 10_684].forEach((elapsed) =>
      segmented.tick(elapsed),
    );

    expect(segmented.snapshot()).toEqual(single.snapshot());
  });

  it("does not manufacture a fixed step from just-below-integer segments", () => {
    const single = createGameController(completeCampaign, "adversarial-timing");
    const segmented = createGameController(
      completeCampaign,
      "adversarial-timing",
    );
    single.startAttempt();
    segmented.startAttempt();

    const simulationSpeed = single.snapshot().scene.gameplayTuning.simulationSpeed;
    expect(simulationSpeed).toBe(0.75);
    const scaledSegments = [0.9999999994, 0.9999999994, 97.9999999995];
    const realSegments = scaledSegments.map((elapsed) => elapsed / simulationSpeed);

    single.tick(realSegments.reduce((total, elapsed) => total + elapsed, 0));
    realSegments.forEach((elapsed) => segmented.tick(elapsed));

    expect(segmented.snapshot()).toEqual(single.snapshot());
    expect(segmented.snapshot().operation?.elapsedMs).toBe(0);
  });

  it("supports explicit pause and speed while paused ticks remain inert", () => {
    const controller = createGameController(completeCampaign, 8);
    controller.startAttempt();
    controller.setPlayerSpeed(2);
    controller.tick(1_000);
    expect(controller.snapshot().operation?.elapsedMs).toBe(1_500);
    controller.pause();
    const paused = controller.snapshot();
    controller.tick(10_000);
    expect(controller.snapshot()).toEqual(paused);
    controller.resume();
    controller.tick(1_000);
    expect(controller.snapshot().operation?.elapsedMs).toBe(3_000);
  });

  it("activates and completes authored tutorial guidance only in exact order", () => {
    const controller = createGameController(completeCampaign, 9);
    controller.startAttempt();
    expect(controller.snapshot().tutorial.active).toBe(false);
    controller.inspectOfficer("captain-han");
    expect(controller.snapshot().tutorial.currentStepIndex).toBe(0);

    advanceToOperationTime(controller, 18_000);
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("pause");
    controller.inspectOfficer("major-baek");
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("pause");
    controller.pause();
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("inspect");
    controller.inspectOfficer("captain-han");
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("inspect");
    controller.inspectOfficer("major-baek");
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("route");
    controller.routeReport("school-han-address", "major-baek");
    expect(controller.snapshot().tutorial.currentStep?.action).toBe("resume");
    controller.resume();
    expect(controller.snapshot().tutorial).toMatchObject({
      active: false,
      currentStepIndex: 4,
      currentStep: null,
    });
  });

  it("delegates every intervention and exposes its resource consequences", () => {
    const controller = createGameController(completeCampaign, 10);
    controller.startAttempt();
    controller.routeReport("school-baek-ready", "captain-han");
    expect(controller.snapshot().lastIntervention).toMatchObject({
      command: { kind: "route-report" },
      autonomyCost: 15,
      logisticsCost: 2,
      interventionCount: 1,
    });
    controller.authorizeOfficer("captain-han");
    controller.prioritizeVerification("school-baek-ready");
    const snapshot = controller.snapshot();
    expect(snapshot.operation?.metrics).toMatchObject({
      interventionCount: 3,
      autonomyScore: 55,
      logistics: 94,
    });
    expect(
      snapshot.operation?.officers.find(({ id }) => id === "captain-han")
        ?.authorized,
    ).toBe(true);
    expect(snapshot.operation?.messages[0]?.prioritized).toBe(true);
  });

  it("keeps selection separate from officer knowledge", () => {
    const controller = createGameController(completeCampaign, 11);
    controller.startAttempt();
    const beliefs = controller.snapshot().operation?.officers.map(({ beliefs }) => beliefs);
    controller.inspectOfficer("major-baek");
    expect(controller.snapshot().selectedOfficerId).toBe("major-baek");
    expect(controller.snapshot().operation?.officers.map(({ beliefs: next }) => next)).toEqual(
      beliefs,
    );
  });
});

describe("game controller campaign flow", () => {
  it("runs a poor attempt into a stable-seed retry, then retries successfully", () => {
    const controller = createGameController(completeCampaign, "retry-base");
    controller.setHarness(POOR_HARNESS);
    const firstSeed = controller.snapshot().attemptSeed;
    controller.startAttempt();
    finishAttempt(controller);
    expect(controller.snapshot()).toMatchObject({
      phase: "debrief",
      debrief: { status: "retry", outcomeId: "retry" },
    });
    controller.continueCampaign();
    expect(controller.snapshot()).toMatchObject({
      phase: "briefing",
      attemptNumber: 2,
      harness: POOR_HARNESS,
    });
    expect(controller.snapshot().attemptSeed).toBe(firstSeed);

    controller.setHarness(BALANCED_HARNESS);
    playBalancedAttempt(controller);
    expect(controller.snapshot().debrief?.status).toBe("success");
  });

  it("plays all six operations through the authored epilogue and resets cleanly", () => {
    const controller = createGameController(completeCampaign, "complete-run");
    const playedSceneIds: string[] = [];
    const operationCount = completeCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    ).length;

    while (controller.snapshot().phase !== "epilogue") {
      if (playedSceneIds.length >= operationCount) {
        throw new Error("Campaign did not reach the epilogue within the authored operations.");
      }
      const sceneId = controller.snapshot().scene.identity.id;
      playedSceneIds.push(sceneId);
      playBalancedAttempt(controller);
      expect(controller.snapshot()).toMatchObject({
        phase: "debrief",
        debrief: { status: "success", outcomeId: "success" },
      });
      controller.continueCampaign();
    }

    expect(playedSceneIds).toEqual(
      completeCampaign.scenes
        .filter(({ identity }) => identity.kind !== "epilogue")
        .map(({ identity }) => identity.id),
    );
    expect(controller.snapshot()).toMatchObject({
      phase: "epilogue",
      scene: { identity: { id: "greenhouse-epilogue", kind: "epilogue" } },
      operation: null,
      progress: { completed: true },
    });
    expect(() => controller.startAttempt()).toThrow(/briefing phase/);

    controller.reset();
    expect(controller.snapshot()).toMatchObject({
      phase: "briefing",
      scene: { identity: { id: completeCampaign.startSceneId } },
      attemptNumber: 1,
      harness: BALANCED_HARNESS,
      operation: null,
      progress: { completedSceneIds: [], completed: false },
    });
  });

  it("keeps terminal ticks and interventions stable", () => {
    const controller = createGameController(completeCampaign, 12);
    playBalancedAttempt(controller);
    const terminal = controller.snapshot();
    controller.tick(99_999);
    controller.authorizeOfficer("missing-officer");
    controller.prioritizeVerification("missing-report");
    controller.routeReport("missing-report", "missing-officer");
    expect(controller.snapshot()).toEqual(terminal);
  });
});

describe("game controller isolation and command validation", () => {
  it("is deterministic for the same definition, seed, timing, and actions", () => {
    const first = createGameController(completeCampaign, "replay");
    const second = createGameController(completeCampaign, "replay");
    first.startAttempt();
    second.startAttempt();
    [31, 501.5, 1_111, 17_000].forEach((elapsed) => {
      first.tick(elapsed);
      second.tick(elapsed);
    });
    expect(second.snapshot()).toEqual(first.snapshot());
  });

  it("isolates supplied definitions, nested snapshots, tutorial arrays, and operation state", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const originalTitle = source.scenes[0]?.copy.title;
    const controller = createGameController(source, "isolation");
    (source.scenes[0]?.copy as { title: string }).title = "mutated source";
    const returned = controller.snapshot() as unknown as {
      scene: { copy: { title: string }; guidance: Array<{ id: string }> };
      tutorial: { completedStepIds: string[] };
      progress: { completedSceneIds: string[] };
    };
    returned.scene.copy.title = "mutated snapshot";
    returned.scene.guidance[0].id = "mutated guidance";
    returned.tutorial.completedStepIds.push("invented step");
    returned.progress.completedSceneIds.push("invented scene");

    expect(controller.snapshot().scene.copy.title).toBe(originalTitle);
    expect(controller.snapshot().scene.guidance[0]?.id).toBe("tutorial-pause");
    expect(controller.snapshot().tutorial.completedStepIds).toEqual([]);
    expect(controller.snapshot().progress.completedSceneIds).toEqual([]);

    controller.startAttempt();
    const operation = controller.snapshot() as unknown as {
      operation: { officers: Array<{ beliefs: unknown[] }> };
      replay: Array<{ description: string }>;
    };
    operation.operation.officers[0].beliefs.push({ invented: true });
    operation.replay[0].description = "mutated replay";
    expect(controller.snapshot().operation?.officers[0]?.beliefs).not.toContainEqual({
      invented: true,
    });
    expect(controller.snapshot().replay[0]?.description).not.toBe("mutated replay");
  });

  it("rejects invalid phase, time, speed, and target commands atomically", () => {
    const controller = createGameController(completeCampaign, 13);
    const briefing = controller.snapshot();
    expect(() => controller.tick(1)).toThrow(/operation phase/);
    expect(() => controller.inspectOfficer("major-baek")).toThrow(/operation phase/);
    expect(controller.snapshot()).toEqual(briefing);

    controller.startAttempt();
    const operation = controller.snapshot();
    expect(() => controller.tick(Number.NaN)).toThrow(GameControllerError);
    expect(() => controller.tick(-1)).toThrow(GameControllerError);
    expect(() => controller.setPlayerSpeed(3 as 2)).toThrow(GameControllerError);
    expect(() => controller.inspectOfficer("missing")).toThrow(GameControllerError);
    expect(() => controller.routeReport("missing", "major-baek")).toThrow(
      RangeError,
    );
    expect(controller.snapshot()).toEqual(operation);
  });
});
