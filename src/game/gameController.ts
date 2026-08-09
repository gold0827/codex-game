import {
  createCampaignProgress,
  type CampaignDefinition,
  type CampaignGuidanceStep,
  type CampaignScene,
} from "../campaign";
import { createOperationSimulation } from "../simulation/operationSimulation";
import {
  deriveRunSeed,
  hashSeed,
  type RandomSeed,
} from "../simulation/seededRandom";
import {
  BALANCED_HARNESS,
  type HarnessConfiguration,
  type OperationIntervention,
  type OperationSimulation,
} from "../simulation/simulationTypes";
import {
  GameControllerError,
  type GameController,
  type GameDebriefSnapshot,
  type GamePhase,
  type GameSnapshot,
  type HarnessAxis,
  type HarnessBudgetSnapshot,
  type InterventionResultSnapshot,
  type PlayerSpeed,
  type TutorialGuidanceSnapshot,
} from "./gameTypes";

export const HARNESS_AXES = [
  "informationReach",
  "authorityClarity",
  "verificationDepth",
  "feedbackCompression",
] as const satisfies readonly HarnessAxis[];

const PLAYER_SPEEDS = [0.5, 1, 2] as const satisfies readonly PlayerSpeed[];

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function harnessBudget(
  harness: HarnessConfiguration,
  startingResources: number,
): HarnessBudgetSnapshot {
  const available = Math.max(0, Math.trunc(startingResources));
  const axisCosts = Object.fromEntries(
    HARNESS_AXES.map((axis) => [
      axis,
      Math.ceil((available * harness[axis]) / 3),
    ]),
  ) as unknown as Record<HarnessAxis, number>;
  const spent = HARNESS_AXES.reduce((total, axis) => total + axisCosts[axis], 0);

  return {
    available,
    spent,
    remaining: available - spent,
    axisCosts,
  };
}

function assertHarness(harness: HarnessConfiguration): void {
  const suppliedKeys = Object.keys(harness);
  if (
    suppliedKeys.length !== HARNESS_AXES.length ||
    suppliedKeys.some(
      (key) => !HARNESS_AXES.includes(key as HarnessAxis),
    )
  ) {
    throw new GameControllerError(
      "invalid-harness",
      "A harness must contain exactly the four supported axes.",
    );
  }

  HARNESS_AXES.forEach((axis) => {
    const value = harness[axis];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new GameControllerError(
        "invalid-harness",
        `Harness ${axis} must be between zero and one.`,
      );
    }
  });
}

function assertAffordable(
  harness: HarnessConfiguration,
  scene: CampaignScene,
): HarnessBudgetSnapshot {
  const budget = harnessBudget(harness, scene.gameplayTuning.startingResources);
  if (budget.spent > budget.available) {
    throw new GameControllerError(
      "harness-over-budget",
      `Harness costs ${budget.spent} resources but only ${budget.available} are available.`,
    );
  }
  return budget;
}

function matchesGuidance(
  step: CampaignGuidanceStep,
  action: CampaignGuidanceStep["action"],
  target: Readonly<Record<string, string>>,
): boolean {
  if (step.action !== action) return false;
  if (step.action === "pause" || step.action === "resume") {
    return target.kind === "operation-clock";
  }
  if (step.action === "inspect") {
    return (
      target.kind === "officer" && target.officerId === step.target.officerId
    );
  }
  return (
    target.kind === "report-recipient" &&
    target.reportId === step.target.reportId &&
    target.recipientOfficerId === step.target.recipientOfficerId
  );
}

export function createGameController(
  suppliedDefinition: CampaignDefinition,
  baseSeed: RandomSeed,
): GameController {
  hashSeed(baseSeed);
  const progress = createCampaignProgress(suppliedDefinition);
  const definition = progress.definition();
  let scene = progress.currentScene();
  let phase: GamePhase =
    scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
  let attemptNumber = 1;
  let harness: HarnessConfiguration = clone(BALANCED_HARNESS);
  let simulation: OperationSimulation | null = null;
  let paused = false;
  let playerSpeed: PlayerSpeed = 1;
  let fractionalOperationMs = 0;
  let selectedOfficerId: string | null = null;
  let completedGuidanceSteps = 0;
  let lastIntervention: InterventionResultSnapshot | null = null;
  let debrief: GameDebriefSnapshot | null = null;

  assertAffordable(harness, scene);

  const attemptSeed = (): RandomSeed =>
    deriveRunSeed(
      definition.id,
      scene.identity.id,
      `${String(baseSeed)}:attempt-${attemptNumber}`,
    );

  const routeReportsExist = (): boolean => {
    if (!simulation) return false;
    const reportIds = new Set(
      simulation.snapshot().messages.map(({ authoredReportId }) => authoredReportId),
    );
    return scene.guidance
      .filter((step) => step.action === "route")
      .every((step) => reportIds.has(step.target.reportId));
  };

  const guidanceSnapshot = (): TutorialGuidanceSnapshot => {
    const currentStep = scene.guidance[completedGuidanceSteps] ?? null;
    return {
      active:
        phase === "operation" &&
        currentStep !== null &&
        routeReportsExist(),
      currentStepIndex: completedGuidanceSteps,
      currentStep: currentStep === null ? null : clone(currentStep),
      completedStepIds: scene.guidance
        .slice(0, completedGuidanceSteps)
        .map(({ id }) => id),
    };
  };

  const snapshot = (): GameSnapshot => {
    const budget = harnessBudget(harness, scene.gameplayTuning.startingResources);
    const operation = simulation?.snapshot() ?? null;
    const briefing =
      phase === "briefing"
        ? {
            copy: clone(scene.copy),
            presentation: clone(scene.presentation),
            objectives: clone(scene.objectives),
            harnessBudget: clone(budget),
          }
        : null;

    return clone({
      phase,
      scene,
      progress: progress.snapshot(),
      attemptNumber,
      attemptSeed: attemptSeed(),
      harness,
      harnessBudget: budget,
      briefing,
      operation,
      replay: simulation?.replay() ?? [],
      paused,
      playerSpeed,
      selectedOfficerId,
      tutorial: guidanceSnapshot(),
      lastIntervention,
      debrief,
    });
  };

  const requirePhase = (requiredPhase: GamePhase, action: string): void => {
    if (phase !== requiredPhase) {
      throw new GameControllerError(
        "invalid-phase",
        `${action} requires the ${requiredPhase} phase; current phase is ${phase}.`,
      );
    }
  };

  const setHarness = (suppliedHarness: HarnessConfiguration): GameSnapshot => {
    requirePhase("briefing", "Harness configuration");
    const candidate = clone(suppliedHarness);
    assertHarness(candidate);
    assertAffordable(candidate, scene);
    harness = candidate;
    return snapshot();
  };

  const configureHarness = (axis: HarnessAxis, value: number): GameSnapshot => {
    requirePhase("briefing", "Harness configuration");
    if (!HARNESS_AXES.includes(axis)) {
      throw new GameControllerError(
        "invalid-harness",
        `Unknown harness axis "${String(axis)}".`,
      );
    }
    return setHarness({ ...harness, [axis]: value });
  };

  const startAttempt = (): GameSnapshot => {
    requirePhase("briefing", "Starting an attempt");
    if (scene.identity.kind === "epilogue") {
      throw new GameControllerError(
        "invalid-phase",
        "An epilogue cannot start an operation.",
      );
    }
    if (
      !Number.isFinite(scene.gameplayTuning.simulationSpeed) ||
      scene.gameplayTuning.simulationSpeed <= 0
    ) {
      throw new GameControllerError(
        "invalid-time",
        "A playable scene must have a positive finite simulation speed.",
      );
    }

    const candidate = createOperationSimulation(
      scene,
      definition.officers,
      attemptSeed(),
      harness,
    );
    simulation = candidate;
    phase = "operation";
    paused = false;
    playerSpeed = 1;
    fractionalOperationMs = 0;
    selectedOfficerId = null;
    completedGuidanceSteps = 0;
    lastIntervention = null;
    debrief = null;
    return snapshot();
  };

  const finishIfTerminal = (): void => {
    const operation = simulation?.snapshot();
    if (!operation || operation.status === "running") return;
    if (operation.outcomeId === null) {
      throw new Error("A terminal operation must expose its declared outcome.");
    }
    phase = "debrief";
    paused = false;
    fractionalOperationMs = 0;
    debrief = {
      status: operation.status,
      outcomeId: operation.outcomeId,
      copy: operation.status === "success" ? scene.copy.success : scene.copy.failure,
    };
  };

  const tick = (realElapsedMs: number): GameSnapshot => {
    if (!Number.isFinite(realElapsedMs) || realElapsedMs < 0) {
      throw new GameControllerError(
        "invalid-time",
        "Elapsed time must be a non-negative finite number.",
      );
    }
    if (phase === "debrief" || phase === "epilogue") return snapshot();
    requirePhase("operation", "Ticking");
    if (paused || realElapsedMs === 0) return snapshot();

    const scaledElapsedMs =
      realElapsedMs * scene.gameplayTuning.simulationSpeed * playerSpeed;
    if (
      !Number.isFinite(scaledElapsedMs) ||
      scaledElapsedMs > Number.MAX_SAFE_INTEGER - fractionalOperationMs
    ) {
      throw new GameControllerError(
        "invalid-time",
        "Scaled operation time must remain finite and safe.",
      );
    }
    const totalOperationMs = fractionalOperationMs + scaledElapsedMs;
    const wholeOperationMs = Math.floor(totalOperationMs);
    simulation?.advance(wholeOperationMs);
    fractionalOperationMs = totalOperationMs - wholeOperationMs;
    finishIfTerminal();
    return snapshot();
  };

  const setPlayerSpeed = (speed: PlayerSpeed): GameSnapshot => {
    requirePhase("operation", "Changing player speed");
    if (!PLAYER_SPEEDS.includes(speed)) {
      throw new GameControllerError(
        "invalid-speed",
        "Player speed must be 0.5, 1, or 2.",
      );
    }
    playerSpeed = speed;
    return snapshot();
  };

  const completeGuidance = (
    action: CampaignGuidanceStep["action"],
    target: Readonly<Record<string, string>>,
  ): void => {
    const guidance = guidanceSnapshot();
    if (
      guidance.active &&
      guidance.currentStep &&
      matchesGuidance(guidance.currentStep, action, target)
    ) {
      completedGuidanceSteps += 1;
    }
  };

  const pause = (): GameSnapshot => {
    requirePhase("operation", "Pausing");
    if (paused) return snapshot();
    paused = true;
    completeGuidance("pause", { kind: "operation-clock" });
    return snapshot();
  };

  const resume = (): GameSnapshot => {
    requirePhase("operation", "Resuming");
    if (!paused) return snapshot();
    paused = false;
    completeGuidance("resume", { kind: "operation-clock" });
    return snapshot();
  };

  const inspectOfficer = (officerId: string): GameSnapshot => {
    if (phase === "debrief") return snapshot();
    requirePhase("operation", "Inspecting an officer");
    if (!simulation?.snapshot().officers.some(({ id }) => id === officerId)) {
      throw new GameControllerError(
        "invalid-target",
        `Unknown officer "${officerId}".`,
      );
    }
    selectedOfficerId = officerId;
    completeGuidance("inspect", { kind: "officer", officerId });
    return snapshot();
  };

  const intervene = (command: OperationIntervention): GameSnapshot => {
    if (phase === "debrief") return snapshot();
    requirePhase("operation", "Intervening");
    if (!simulation) throw new Error("Operation phase requires a simulation.");
    const before = simulation.snapshot().metrics;
    const after = simulation.intervene(command).metrics;
    lastIntervention = {
      command: clone(command),
      autonomyCost: before.autonomyScore - after.autonomyScore,
      logisticsCost: before.logistics - after.logistics,
      interventionCount: after.interventionCount,
    };
    return snapshot();
  };

  const routeReport = (
    reportId: string,
    recipientOfficerId: string,
  ): GameSnapshot => {
    const result = intervene({
      kind: "route-report",
      reportId,
      recipientOfficerId,
    });
    completeGuidance("route", {
      kind: "report-recipient",
      reportId,
      recipientOfficerId,
    });
    return snapshot().phase === result.phase ? snapshot() : result;
  };

  const authorizeOfficer = (officerId: string): GameSnapshot =>
    intervene({ kind: "authorize-officer", officerId });

  const prioritizeVerification = (reportId: string): GameSnapshot =>
    intervene({ kind: "prioritize-verification", reportId });

  const clearAttemptState = (): void => {
    simulation = null;
    paused = false;
    playerSpeed = 1;
    fractionalOperationMs = 0;
    selectedOfficerId = null;
    completedGuidanceSteps = 0;
    lastIntervention = null;
    debrief = null;
  };

  const continueCampaign = (): GameSnapshot => {
    requirePhase("debrief", "Continuing the campaign");
    const completedOperation = simulation?.snapshot();
    if (!completedOperation?.outcomeId) {
      throw new Error("Debrief phase requires a completed operation.");
    }
    const previousSceneId = scene.identity.id;
    progress.recordOutcome(completedOperation.outcomeId);
    scene = progress.currentScene();
    const isRetry = scene.identity.id === previousSceneId;
    attemptNumber = isRetry ? attemptNumber + 1 : 1;
    if (!isRetry) harness = clone(BALANCED_HARNESS);
    clearAttemptState();
    phase = scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
    assertAffordable(harness, scene);
    return snapshot();
  };

  const reset = (): GameSnapshot => {
    progress.reset();
    scene = progress.currentScene();
    phase = scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
    attemptNumber = 1;
    harness = clone(BALANCED_HARNESS);
    clearAttemptState();
    assertAffordable(harness, scene);
    return snapshot();
  };

  return {
    snapshot,
    configureHarness,
    setHarness,
    startAttempt,
    tick,
    setPlayerSpeed,
    pause,
    resume,
    inspectOfficer,
    routeReport,
    authorizeOfficer,
    prioritizeVerification,
    continueCampaign,
    reset,
  };
}
