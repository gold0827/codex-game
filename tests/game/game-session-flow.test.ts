import { describe, expect, it } from "vitest";

import type {
  CampaignDefinition,
  CampaignGuidanceStep,
} from "../../src/campaign";
import {
  createGameSession,
  GameSessionError,
  type GameSession,
} from "../../src/application/game-session";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { BALANCED_HARNESS } from "../../src/simulation/simulationTypes";
import { flowCampaign } from "../fixtures/flow-campaign";

const POOR_HARNESS = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
} as const;

function advanceToOperationTime(
  session: GameSession,
  operationElapsedMs: number,
): void {
  const simulationSpeed = session.read().scene.gameplayTuning.simulationSpeed;
  session.advance(operationElapsedMs / simulationSpeed);
}

const SIGNAL_TARGET = { x: 12, y: 8 } as const;

function campaignWithSpatialGuidance(): CampaignDefinition {
  const definition = structuredClone(completeCampaign) as CampaignDefinition;
  const firstScene = definition.scenes[0];
  if (!firstScene) throw new Error("Complete campaign requires a first scene.");
  const guidance: CampaignGuidanceStep[] = [
    {
      id: "signal-pause",
      instruction: "작전 시간을 멈춘다.",
      action: "pause",
      target: { kind: "operation-clock" },
      completionEvent: "operation-paused",
    },
    {
      id: "signal-inspect",
      instruction: "백돌격 소령을 살핀다.",
      action: "inspect",
      target: { kind: "officer", officerId: "major-baek" },
      completionEvent: "officer-inspected",
    },
    {
      id: "signal-defend",
      instruction: "선택 지점에 방어 신호를 보낸다.",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "defend",
        strength: 2,
        position: SIGNAL_TARGET,
      },
      completionEvent: "spatial-signal-issued",
    },
    {
      id: "signal-resume",
      instruction: "작전 시간을 다시 흐르게 한다.",
      action: "resume",
      target: { kind: "operation-clock" },
      completionEvent: "operation-resumed",
    },
  ];
  return {
    ...definition,
    scenes: [
      { ...firstScene, guidance },
      ...definition.scenes.slice(1),
    ],
  };
}

function completeTutorial(session: GameSession): void {
  const routeStep = session
    .read()
    .scene.guidance.find((step) => step.action === "route");
  if (!routeStep || routeStep.action !== "route") return;
  const reportBeat = session.read().scene.beats.find((beat) =>
    beat.reports.some(({ id }) => id === routeStep.target.reportId),
  );
  advanceToOperationTime(session, reportBeat?.timeMs ?? 0);
  expect(session.read().tutorial.active).toBe(true);
  session.dispatch({ type: "pause" });

  const inspectStep = session.read().tutorial.currentStep;
  if (inspectStep?.action === "inspect") {
    session.dispatch({ type: "inspect-officer", officerId: inspectStep.target.officerId });
  }
  session.dispatch({
    type: "route-report",
    reportId: routeStep.target.reportId,
    recipientOfficerId: routeStep.target.recipientOfficerId,
  });
  session.dispatch({ type: "resume" });
  expect(session.read().tutorial.currentStep).toBeNull();
}

function finishAttempt(session: GameSession): void {
  const snapshot = session.read();
  const remaining =
    snapshot.scene.encounterParameters.durationMs -
    (snapshot.operation?.elapsedMs ?? 0);
  session.advance(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 1);
}

function completeSharedBeliefObjective(session: GameSession): void {
  const snapshot = session.read();
  if (snapshot.scene.identity.id !== "night-switchboard") return;
  const message = snapshot.operation?.messages[0];
  const missingRecipient = completeCampaign.officers.find(({ id }) =>
    id !== message?.sourceOfficerId && !message?.recipientOfficerIds.includes(id));
  if (!message || !missingRecipient) {
    throw new Error("Night switchboard requires one missing report recipient.");
  }
  session.dispatch({
    type: "route-report",
    reportId: message.authoredReportId,
    recipientOfficerId: missingRecipient.id,
  });
}

function playBalancedAttempt(session: GameSession): void {
  session.dispatch({ type: "start-attempt" });
  completeTutorial(session);
  completeSharedBeliefObjective(session);
  finishAttempt(session);
}

describe("game session briefing and harness", () => {
  it("starts at the authored campaign scene and exposes a complete briefing", () => {
    const session = createGameSession(completeCampaign, "base-seed");
    const snapshot = session.read();
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
    const session = createGameSession(completeCampaign, 7);
    session.dispatch({ type: "configure-harness", axis: "informationReach", value: 0.2 });
    expect(session.read().harness).toEqual({
      ...BALANCED_HARNESS,
      informationReach: 0.2,
    });

    const beforeInvalid = session.read();
    expect(() => session.dispatch({
      type: "configure-harness",
      axis: "informationReach",
      value: -0.1,
    })).toThrow(
      GameSessionError,
    );
    expect(session.read()).toEqual(beforeInvalid);

    const beforeOverBudget = session.read();
    expect(() =>
      session.dispatch({
        type: "set-harness",
        harness: {
          informationReach: 1,
          authorityClarity: 1,
          verificationDepth: 1,
          feedbackCompression: 1,
        },
      }),
    ).toThrow(/only 80 are available/);
    expect(session.read()).toEqual(beforeOverBudget);

    session.dispatch({ type: "start-attempt" });
    const beforeLateChange = session.read();
    expect(() => session.dispatch({
      type: "configure-harness",
      axis: "informationReach",
      value: 0.4,
    })).toThrow(
      /briefing phase/,
    );
    expect(session.read()).toEqual(beforeLateChange);
  });
});

describe("game session operation", () => {
  it("makes segmented and one-call real-time ticking equivalent with fractional carry", () => {
    const single = createGameSession(completeCampaign, "timing");
    const segmented = createGameSession(completeCampaign, "timing");
    single.dispatch({ type: "start-attempt" });
    segmented.dispatch({ type: "start-attempt" });
    single.dispatch({ type: "set-player-speed", speed: 0.5 });
    segmented.dispatch({ type: "set-player-speed", speed: 0.5 });

    single.advance(20_003.5);
    [0.5, 1, 17, 300, 9_001, 10_684].forEach((elapsed) =>
      segmented.advance(elapsed),
    );

    expect(segmented.read()).toEqual(single.read());
  });

  it("does not manufacture a fixed step from just-below-integer segments", () => {
    const single = createGameSession(completeCampaign, "adversarial-timing");
    const segmented = createGameSession(
      completeCampaign,
      "adversarial-timing",
    );
    single.dispatch({ type: "start-attempt" });
    segmented.dispatch({ type: "start-attempt" });

    const simulationSpeed = single.read().scene.gameplayTuning.simulationSpeed;
    expect(simulationSpeed).toBe(0.75);
    const scaledSegments = [0.9999999994, 0.9999999994, 97.9999999995];
    const realSegments = scaledSegments.map((elapsed) => elapsed / simulationSpeed);

    single.advance(realSegments.reduce((total, elapsed) => total + elapsed, 0));
    realSegments.forEach((elapsed) => segmented.advance(elapsed));

    expect(segmented.read()).toEqual(single.read());
    expect(segmented.read().operation?.elapsedMs).toBe(0);
  });

  it("supports explicit pause and speed while paused ticks remain inert", () => {
    const session = createGameSession(completeCampaign, 8);
    session.dispatch({ type: "start-attempt" });
    session.dispatch({ type: "set-player-speed", speed: 2 });
    session.advance(1_000);
    expect(session.read().operation?.elapsedMs).toBe(1_500);
    session.dispatch({ type: "pause" });
    const paused = session.read();
    session.advance(10_000);
    expect(session.read()).toEqual(paused);
    session.dispatch({ type: "resume" });
    session.advance(1_000);
    expect(session.read().operation?.elapsedMs).toBe(3_000);
  });

  it("activates and completes authored tutorial guidance only in exact order", () => {
    const session = createGameSession(completeCampaign, 9);
    session.dispatch({ type: "start-attempt" });
    expect(session.read().tutorial.active).toBe(true);
    session.dispatch({ type: "inspect-officer", officerId: "captain-han" });
    expect(session.read().tutorial.currentStepIndex).toBe(0);

    advanceToOperationTime(session, 18_000);
    expect(session.read().tutorial.currentStep?.action).toBe("pause");
    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });
    expect(session.read().tutorial.currentStep?.action).toBe("pause");
    session.dispatch({ type: "pause" });
    expect(session.read().tutorial.currentStep?.action).toBe("inspect");
    session.dispatch({ type: "inspect-officer", officerId: "captain-han" });
    expect(session.read().tutorial.currentStep?.action).toBe("inspect");
    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });
    expect(session.read().tutorial.currentStep?.action).toBe("route");
    session.dispatch({
      type: "route-report",
      reportId: "school-han-address",
      recipientOfficerId: "major-baek",
    });
    expect(session.read().tutorial.currentStep?.action).toBe("resume");
    session.dispatch({ type: "resume" });
    expect(session.read().tutorial).toMatchObject({
      active: false,
      currentStepIndex: 4,
      currentStep: null,
    });
  });

  it("waits only when the current guidance step needs an authored report", () => {
    const session = createGameSession(completeCampaign, "current-report-step");
    session.dispatch({ type: "start-attempt" });

    expect(session.read().tutorial).toMatchObject({
      active: true,
      currentStep: { action: "pause" },
    });
    session.dispatch({ type: "pause" });
    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });

    expect(session.read().tutorial).toMatchObject({
      active: false,
      currentStep: { action: "route" },
      completedStepIds: ["tutorial-pause", "tutorial-inspect"],
    });
  });

  it.each([
    ["kind", { signal: "avoid", strength: 2, position: SIGNAL_TARGET }],
    ["strength", { signal: "defend", strength: 1, position: SIGNAL_TARGET }],
    ["position", { signal: "defend", strength: 2, position: { x: 12, y: 9 } }],
  ] as const)(
    "advances spatial guidance only after the exact %s matches",
    (_mismatch, wrongSignal) => {
      const session = createGameSession(
        campaignWithSpatialGuidance(),
        `spatial-guidance-${_mismatch}`,
      );
      session.dispatch({ type: "start-attempt" });
      session.dispatch({ type: "pause" });
      session.dispatch({ type: "inspect-officer", officerId: "major-baek" });

      session.dispatch({
        type: "issue-spatial-signal",
        ...wrongSignal,
      });
      expect(session.read().tutorial).toMatchObject({
        currentStep: { id: "signal-defend", action: "signal" },
        completedStepIds: ["signal-pause", "signal-inspect"],
      });
      expect(session.read().operation?.signals).toHaveLength(1);

      session.dispatch({
        type: "issue-spatial-signal",
        signal: "defend",
        strength: 2,
        position: SIGNAL_TARGET,
      });
      expect(session.read().tutorial.currentStep).toMatchObject({
        id: "signal-resume",
        action: "resume",
      });
      expect(session.read().operation?.signals).toHaveLength(2);
      session.dispatch({ type: "resume" });

      expect(session.read().tutorial).toMatchObject({
        active: false,
        currentStep: null,
        completedStepIds: [
          "signal-pause",
          "signal-inspect",
          "signal-defend",
          "signal-resume",
        ],
      });
    },
  );

  it("delegates every intervention and exposes its resource consequences", () => {
    const session = createGameSession(completeCampaign, 10);
    session.dispatch({ type: "start-attempt" });
    session.dispatch({
      type: "route-report",
      reportId: "school-baek-ready",
      recipientOfficerId: "captain-han",
    });
    expect(session.read().lastIntervention).toMatchObject({
      command: { kind: "route-report" },
      autonomyCost: 15,
      logisticsCost: 2,
      interventionCount: 1,
    });
    session.dispatch({ type: "authorize-officer", officerId: "captain-han" });
    session.dispatch({ type: "prioritize-verification", reportId: "school-baek-ready" });
    const snapshot = session.read();
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
    const session = createGameSession(completeCampaign, 11);
    session.dispatch({ type: "start-attempt" });
    const beliefs = session.read().operation?.officers.map(({ beliefs }) => beliefs);
    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });
    expect(session.read().selectedOfficerId).toBe("major-baek");
    expect(session.read().operation?.officers.map(({ beliefs: next }) => next)).toEqual(
      beliefs,
    );
  });
});

describe("game session campaign flow", () => {
  it("runs a poor attempt into a stable-seed retry, then retries successfully", () => {
    const session = createGameSession(completeCampaign, 0);
    session.dispatch({ type: "set-harness", harness: POOR_HARNESS });
    const firstSeed = session.read().attemptSeed;
    session.dispatch({ type: "start-attempt" });
    finishAttempt(session);
    expect(session.read()).toMatchObject({
      phase: "debrief",
      debrief: { status: "retry", outcomeId: "retry" },
    });
    session.dispatch({ type: "continue-campaign" });
    expect(session.read()).toMatchObject({
      phase: "briefing",
      attemptNumber: 2,
      harness: POOR_HARNESS,
    });
    expect(session.read().attemptSeed).toBe(firstSeed);

    session.dispatch({ type: "set-harness", harness: BALANCED_HARNESS });
    playBalancedAttempt(session);
    expect(session.read().debrief?.status).toBe("success");
    expect(session.read().debrief?.lessonChoices).toHaveLength(
      completeCampaign.officers.length,
    );
    const successfulDebrief = session.read();
    expect(() => session.dispatch({
      type: "choose-lesson",
      lessonId: "invented-lesson",
    })).toThrow(GameSessionError);
    expect(session.read()).toEqual(successfulDebrief);
  });

  it("plays all six operations through the authored epilogue and resets cleanly", () => {
    const session = createGameSession(flowCampaign, "complete-run");
    const playedSceneIds: string[] = [];
    const operationCount = flowCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    ).length;

    while (session.read().phase !== "epilogue") {
      if (playedSceneIds.length >= operationCount) {
        throw new Error("Campaign did not reach the epilogue within the authored operations.");
      }
      const sceneId = session.read().scene.identity.id;
      playedSceneIds.push(sceneId);
      playBalancedAttempt(session);
      expect(session.read()).toMatchObject({
        phase: "debrief",
        debrief: { status: "success", outcomeId: "success" },
      });
      const lesson = session.read().debrief?.lessonChoices[0];
      if (!lesson) throw new Error("A successful operation must offer a lesson.");
      session.dispatch({ type: "choose-lesson", lessonId: lesson.id });
    }

    expect(playedSceneIds).toEqual(
      flowCampaign.scenes
        .filter(({ identity }) => identity.kind !== "epilogue")
        .map(({ identity }) => identity.id),
    );
    expect(session.read()).toMatchObject({
      phase: "epilogue",
      scene: { identity: { id: "greenhouse-epilogue", kind: "epilogue" } },
      operation: null,
      progress: { completed: true },
    });
    expect(session.read().officerMemory[0]?.lessons).toHaveLength(2);
    expect(() => session.dispatch({ type: "start-attempt" })).toThrow(/briefing phase/);

    session.dispatch({ type: "reset" });
    expect(session.read()).toMatchObject({
      phase: "briefing",
      scene: { identity: { id: completeCampaign.startSceneId } },
      attemptNumber: 1,
      harness: BALANCED_HARNESS,
      operation: null,
      progress: { completedSceneIds: [], completed: false },
    });
  });

  it("keeps terminal ticks and interventions stable", () => {
    const session = createGameSession(completeCampaign, 12);
    playBalancedAttempt(session);
    const terminal = session.read();
    session.advance(99_999);
    session.dispatch({ type: "authorize-officer", officerId: "missing-officer" });
    session.dispatch({ type: "prioritize-verification", reportId: "missing-report" });
    session.dispatch({
      type: "route-report",
      reportId: "missing-report",
      recipientOfficerId: "missing-officer",
    });
    expect(session.read()).toEqual(terminal);
  });
});

describe("game session isolation and command validation", () => {
  it("resumes saved campaign progress at a safe briefing boundary", () => {
    const firstScene = completeCampaign.scenes[0]!;
    const nextScene = completeCampaign.scenes[1]!;
    const officer = completeCampaign.officers[0]!;
    const session = createGameSession(completeCampaign, "resume", {
      progress: {
        currentSceneId: nextScene.identity.id,
        completedSceneIds: [firstScene.identity.id],
        completed: false,
      },
      officerMemory: [{
        officerId: officer.id,
        lessons: [{ id: "saved-lesson", officerId: officer.id, summary: "저장된 교훈" }],
      }],
    });

    expect(session.read()).toMatchObject({
      phase: "briefing",
      scene: { identity: { id: nextScene.identity.id } },
      progress: { completedSceneIds: [firstScene.identity.id] },
    });
    expect(session.read().officerMemory.find(({ officerId }) => officerId === officer.id)?.lessons)
      .toContainEqual(expect.objectContaining({ summary: "저장된 교훈" }));
  });

  it("is deterministic for the same definition, seed, timing, and actions", () => {
    const first = createGameSession(completeCampaign, "replay");
    const second = createGameSession(completeCampaign, "replay");
    first.dispatch({ type: "start-attempt" });
    second.dispatch({ type: "start-attempt" });
    [31, 501.5, 1_111, 17_000].forEach((elapsed) => {
      first.advance(elapsed);
      second.advance(elapsed);
    });
    expect(second.read()).toEqual(first.read());
  });

  it("isolates supplied definitions, nested snapshots, tutorial arrays, and operation state", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const originalTitle = source.scenes[0]?.copy.title;
    const session = createGameSession(source, "isolation");
    (source.scenes[0]?.copy as { title: string }).title = "mutated source";
    const returned = session.read() as unknown as {
      scene: { copy: { title: string }; guidance: Array<{ id: string }> };
      tutorial: { completedStepIds: string[] };
      progress: { completedSceneIds: string[] };
    };
    returned.scene.copy.title = "mutated snapshot";
    returned.scene.guidance[0].id = "mutated guidance";
    returned.tutorial.completedStepIds.push("invented step");
    returned.progress.completedSceneIds.push("invented scene");

    expect(session.read().scene.copy.title).toBe(originalTitle);
    expect(session.read().scene.guidance[0]?.id).toBe("tutorial-pause");
    expect(session.read().tutorial.completedStepIds).toEqual([]);
    expect(session.read().progress.completedSceneIds).toEqual([]);

    session.dispatch({ type: "start-attempt" });
    const operation = session.read() as unknown as {
      operation: { officers: Array<{ beliefs: unknown[] }> };
      replay: Array<{ description: string }>;
    };
    operation.operation.officers[0].beliefs.push({ invented: true });
    operation.replay[0].description = "mutated replay";
    expect(session.read().operation?.officers[0]?.beliefs).not.toContainEqual({
      invented: true,
    });
    expect(session.read().replay[0]?.description).not.toBe("mutated replay");
  });

  it("rejects invalid phase, time, speed, and target commands atomically", () => {
    const session = createGameSession(completeCampaign, 13);
    const briefing = session.read();
    expect(() => session.advance(1)).toThrow(/operation phase/);
    expect(() => session.dispatch({
      type: "inspect-officer",
      officerId: "major-baek",
    })).toThrow(/operation phase/);
    expect(() => session.dispatch({
      type: "issue-spatial-signal",
      signal: "defend",
      strength: 2,
      position: SIGNAL_TARGET,
    })).toThrow(/operation phase/);
    expect(session.read()).toEqual(briefing);

    session.dispatch({ type: "start-attempt" });
    const operation = session.read();
    expect(() => session.advance(Number.NaN)).toThrow(GameSessionError);
    expect(() => session.advance(-1)).toThrow(GameSessionError);
    expect(() => session.dispatch({
      type: "set-player-speed",
      speed: 3 as 2,
    })).toThrow(GameSessionError);
    expect(() => session.dispatch({
      type: "inspect-officer",
      officerId: "missing",
    })).toThrow(GameSessionError);
    expect(() => session.dispatch({
      type: "route-report",
      reportId: "missing",
      recipientOfficerId: "major-baek",
    })).toThrow(
      RangeError,
    );
    expect(session.read()).toEqual(operation);
  });
});
