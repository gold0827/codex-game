import {
  createCampaignRun,
  type CampaignDefinition,
  type CampaignGuidanceStep,
  type CampaignRun,
  type CampaignRunSnapshot,
  type CampaignScene,
  type CampaignTilePosition,
} from "../campaign";
import {
  createCampaignOperation,
  type CampaignOperation,
} from "../application/campaign-operation";
import { hashSeed, type RandomSeed } from "../simulation/seededRandom";
import {
  BALANCED_HARNESS,
  type HarnessConfiguration,
  type OperationIntervention,
  type OperationSimulation,
  type SpatialSignalKind,
  type SpatialSignalStrength,
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
  const definition = clone(suppliedDefinition);
  let run: CampaignRun = createCampaignRun(definition, baseSeed);
  const sceneFromRun = (state: CampaignRunSnapshot): CampaignScene => {
    if (state.launch) return state.launch.scene;
    const current = definition.scenes.find(
      ({ identity }) => identity.id === state.progress.currentSceneId,
    );
    if (!current) throw new Error("Campaign run references a missing scene.");
    return clone(current);
  };
  let scene = sceneFromRun(run.read());
  let phase: GamePhase =
    scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
  let harness: HarnessConfiguration = clone(BALANCED_HARNESS);
  let simulation: OperationSimulation | null = null;
  let campaignOperation: CampaignOperation | null = null;
  let paused = false;
  let playerSpeed: PlayerSpeed = 1;
  let fractionalOperationMs = 0;
  let selectedOfficerId: string | null = null;
  let completedGuidanceSteps = 0;
  let lastIntervention: InterventionResultSnapshot | null = null;
  let debrief: GameDebriefSnapshot | null = null;

  assertAffordable(harness, scene);

  const attemptSeed = (): RandomSeed => {
    const launch = run.read().launch;
    if (!launch) return JSON.stringify([definition.id, scene.identity.id, typeof baseSeed, baseSeed]);
    return launch.seed;
  };

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
    const campaign = run.read();
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
      progress: campaign.progress,
      officerMemory: campaign.memory,
      attemptNumber: campaign.attemptNumber,
      attemptSeed: attemptSeed(),
      harness,
      harnessBudget: budget,
      briefing,
      operation,
      operationEvents: simulation?.events() ?? [],
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

    const launch = run.read().launch;
    if (!launch) throw new Error("Briefing phase requires an active campaign launch.");
    campaignOperation = createCampaignOperation(launch, harness);
    simulation = campaignOperation.simulation;
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
      lessonChoices: campaignOperation?.result().lessonChoices ?? [],
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

  const issueSpatialSignal = (
    signal: SpatialSignalKind,
    strength: SpatialSignalStrength,
    position: CampaignTilePosition,
  ): GameSnapshot => intervene({
    kind: "issue-spatial-signal",
    signal,
    strength,
    position,
  });

  const authorizeOfficer = (officerId: string): GameSnapshot =>
    intervene({ kind: "authorize-officer", officerId });

  const prioritizeVerification = (reportId: string): GameSnapshot =>
    intervene({ kind: "prioritize-verification", reportId });

  const clearAttemptState = (): void => {
    simulation = null;
    campaignOperation = null;
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
    const completedOperation = campaignOperation?.result();
    if (!completedOperation) {
      throw new Error("Debrief phase requires a completed operation.");
    }
    if (completedOperation.status === "success") {
      throw new GameControllerError(
        "invalid-phase",
        "A successful operation requires a lesson choice before continuing.",
      );
    }
    const campaign = run.resolve(completedOperation);
    scene = sceneFromRun(campaign);
    clearAttemptState();
    phase = "briefing";
    assertAffordable(harness, scene);
    return snapshot();
  };

  const chooseLesson = (lessonId: string): GameSnapshot => {
    requirePhase("debrief", "Choosing a lesson");
    const completedOperation = campaignOperation?.result();
    if (!completedOperation || completedOperation.status !== "success") {
      throw new GameControllerError(
        "invalid-phase",
        "A lesson can only be chosen after a successful operation.",
      );
    }
    if (!completedOperation.lessonChoices.some(({ id }) => id === lessonId)) {
      throw new GameControllerError(
        "invalid-target",
        `Lesson choice "${lessonId}" was not offered.`,
      );
    }
    run.resolve(completedOperation);
    const campaign = run.decide({ lessonId });
    scene = sceneFromRun(campaign);
    harness = clone(BALANCED_HARNESS);
    clearAttemptState();
    phase = campaign.status === "complete" ? "epilogue" : "briefing";
    assertAffordable(harness, scene);
    return snapshot();
  };

  const reset = (): GameSnapshot => {
    run = createCampaignRun(definition, baseSeed);
    scene = sceneFromRun(run.read());
    phase = scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
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
    issueSpatialSignal,
    routeReport,
    authorizeOfficer,
    prioritizeVerification,
    continueCampaign,
    chooseLesson,
    reset,
  };
}
