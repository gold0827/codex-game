import {
  createCampaignRun,
  type CampaignDefinition,
  type CampaignRun,
  type CampaignRunSnapshot,
  type CampaignScene,
} from "../../campaign";
import type {
  AutonomousBattleHarnessPolicies,
  AutonomousBattleInterventionReceipt,
} from "../../domain/operation/operationEngine";
import { hashSeed, type RandomSeed } from "../../simulation/seededRandom";
import {
  DEFAULT_HARNESS,
  type CampaignOperation,
  type CampaignOperationFactory,
} from "../campaign-operation";
import {
  GameSessionError,
  type GameCommand,
  type GameDebriefSnapshot,
  type GamePhase,
  type GameSession,
  type GameSessionResume,
  type GameSnapshot,
  type HarnessAxis,
  type HarnessBudgetSnapshot,
  type PlayerSpeed,
} from "./gameTypes";

export type GameSessionOptions = Readonly<{
  operationFactory: CampaignOperationFactory;
}>;

const HARNESS_AXES = [
  "informationReach",
  "authorityClarity",
  "verificationDepth",
  "feedbackCompression",
] as const satisfies readonly HarnessAxis[];
const PLAYER_SPEEDS = [0.5, 1, 2] as const satisfies readonly PlayerSpeed[];

const clone = <Value>(value: Value): Value => structuredClone(value);

function harnessBudget(
  harness: AutonomousBattleHarnessPolicies,
  startingResources: number,
): HarnessBudgetSnapshot {
  const available = Math.max(0, Math.trunc(startingResources));
  const axisCosts = Object.fromEntries(HARNESS_AXES.map((axis) => [
    axis,
    Math.ceil((available * harness[axis]) / 3),
  ])) as unknown as Record<HarnessAxis, number>;
  const spent = HARNESS_AXES.reduce((total, axis) => total + axisCosts[axis], 0);
  return { available, spent, remaining: available - spent, axisCosts };
}

function assertHarness(harness: AutonomousBattleHarnessPolicies): void {
  const keys = Object.keys(harness).sort();
  const expected = [...HARNESS_AXES].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new GameSessionError(
      "invalid-harness",
      "A harness must contain exactly the four canonical policies.",
    );
  }
  HARNESS_AXES.forEach((axis) => {
    const value = harness[axis];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new GameSessionError(
        "invalid-harness",
        `Harness ${axis} must be between zero and one.`,
      );
    }
  });
}

function assertAffordable(
  harness: AutonomousBattleHarnessPolicies,
  scene: CampaignScene,
): HarnessBudgetSnapshot {
  const budget = harnessBudget(harness, scene.gameplayTuning.startingResources);
  if (budget.spent > budget.available) {
    throw new GameSessionError(
      "harness-over-budget",
      `Harness costs ${budget.spent} resources but only ${budget.available} are available.`,
    );
  }
  return budget;
}

export function createGameSession(
  suppliedDefinition: CampaignDefinition,
  baseSeed: RandomSeed,
  restored: GameSessionResume | undefined,
  options: GameSessionOptions,
): GameSession {
  hashSeed(baseSeed);
  const definition = clone(suppliedDefinition);
  let run: CampaignRun = createCampaignRun(
    definition,
    baseSeed,
    restored?.roleMemory,
    restored?.progress,
  );
  const sceneFromRun = (state: CampaignRunSnapshot): CampaignScene => {
    if (state.launch) return state.launch.scene;
    const current = definition.scenes.find(
      ({ identity }) => identity.id === state.progress.currentSceneId,
    );
    if (!current) throw new Error("Campaign run references a missing scene.");
    return clone(current);
  };
  let scene = sceneFromRun(run.read());
  let phase: GamePhase = scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
  let harness = clone(DEFAULT_HARNESS);
  let operation: CampaignOperation | null = null;
  let paused = false;
  let playerSpeed: PlayerSpeed = 1;
  let fractionalOperationMs = 0;
  let lastIntervention: AutonomousBattleInterventionReceipt | null = null;
  let debrief: GameDebriefSnapshot | null = null;

  assertAffordable(harness, scene);

  const attemptSeed = (): RandomSeed => run.read().launch?.seed
    ?? JSON.stringify([definition.id, scene.identity.id, typeof baseSeed, baseSeed]);

  const snapshot = (): GameSnapshot => {
    const campaign = run.read();
    const budget = harnessBudget(harness, scene.gameplayTuning.startingResources);
    const common = {
      scene,
      progress: campaign.progress,
      roleMemory: campaign.roleMemory,
      attemptNumber: campaign.attemptNumber,
      attemptSeed: attemptSeed(),
      harness,
      harnessBudget: budget,
      playerSpeed,
    };
    switch (phase) {
      case "briefing":
        return clone({
          ...common,
          phase,
          briefing: {
            copy: scene.copy,
            presentation: scene.presentation,
            objectives: scene.objectives,
            harnessBudget: budget,
          },
          operation: null,
          paused: false,
          lastIntervention: null,
          debrief: null,
        });
      case "operation":
        if (!operation) throw new Error("Operation phase requires an operation.");
        return clone({
          ...common,
          phase,
          briefing: null,
          operation: operation.read(),
          paused,
          lastIntervention,
          debrief: null,
        });
      case "debrief":
        if (!debrief) throw new Error("Debrief phase requires terminal details.");
        return clone({
          ...common,
          phase,
          briefing: null,
          operation: null,
          paused: false,
          lastIntervention: null,
          debrief,
        });
      case "epilogue":
        return clone({
          ...common,
          phase,
          briefing: null,
          operation: null,
          paused: false,
          lastIntervention: null,
          debrief: null,
        });
    }
  };

  const requirePhase = (required: GamePhase, action: string): void => {
    if (phase !== required) {
      throw new GameSessionError(
        "invalid-phase",
        `${action} requires the ${required} phase; current phase is ${phase}.`,
      );
    }
  };

  const clearAttempt = (): void => {
    operation = null;
    paused = false;
    playerSpeed = 1;
    fractionalOperationMs = 0;
    lastIntervention = null;
    debrief = null;
  };

  const finishIfTerminal = (): void => {
    const battle = operation?.read();
    if (!battle || battle.resolution.state === "running") return;
    const result = operation?.result();
    if (!result) throw new Error("A terminal operation must expose a campaign result.");
    phase = "debrief";
    paused = false;
    fractionalOperationMs = 0;
    debrief = {
      status: result.status,
      outcomeId: result.outcomeId,
      copy: result.status === "success" ? scene.copy.success : scene.copy.failure,
      lessonChoices: result.lessonChoices,
      objectives: battle.objectives,
    };
  };

  const setHarness = (candidate: AutonomousBattleHarnessPolicies): GameSnapshot => {
    requirePhase("briefing", "Harness configuration");
    const next = clone(candidate);
    assertHarness(next);
    assertAffordable(next, scene);
    harness = next;
    return snapshot();
  };

  const startAttempt = (): GameSnapshot => {
    requirePhase("briefing", "Starting an attempt");
    if (scene.identity.kind === "epilogue") {
      throw new GameSessionError("invalid-phase", "An epilogue cannot start an operation.");
    }
    if (!Number.isFinite(scene.gameplayTuning.simulationSpeed) ||
        scene.gameplayTuning.simulationSpeed <= 0) {
      throw new GameSessionError("invalid-time", "Simulation speed must be positive and finite.");
    }
    const launch = run.read().launch;
    if (!launch) throw new Error("Briefing phase requires an active campaign launch.");
    operation = options.operationFactory(clone(launch), clone(harness));
    phase = "operation";
    paused = false;
    playerSpeed = 1;
    fractionalOperationMs = 0;
    lastIntervention = null;
    debrief = null;
    return snapshot();
  };

  const advance = (realElapsedMs: number): GameSnapshot => {
    if (!Number.isFinite(realElapsedMs) || realElapsedMs < 0) {
      throw new GameSessionError("invalid-time", "Elapsed time must be non-negative and finite.");
    }
    if (phase === "debrief" || phase === "epilogue") return snapshot();
    requirePhase("operation", "Ticking");
    if (paused || realElapsedMs === 0) return snapshot();
    const scaled = realElapsedMs * scene.gameplayTuning.simulationSpeed * playerSpeed;
    if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER - fractionalOperationMs) {
      throw new GameSessionError("invalid-time", "Scaled operation time must remain finite and safe.");
    }
    const total = fractionalOperationMs + scaled;
    operation?.advance(Math.floor(total));
    fractionalOperationMs = total - Math.floor(total);
    finishIfTerminal();
    return snapshot();
  };

  const intervene = (
    command: Extract<GameCommand, { type: "set-formation-intent" | "issue-guidance" }>,
  ): GameSnapshot => {
    requirePhase("operation", "Intervening");
    if (!operation) throw new Error("Operation phase requires an operation.");
    const result = command.type === "set-formation-intent"
      ? operation.intervene({
          kind: "set-formation-intent",
          formationId: command.formationId,
          intentId: command.intentId,
        })
      : operation.intervene({
          kind: "issue-guidance",
          guidanceId: command.guidanceId,
          recipientFormationIds: command.recipientFormationIds,
        });
    lastIntervention = result.receipt;
    return snapshot();
  };

  const continueCampaign = (): GameSnapshot => {
    requirePhase("debrief", "Continuing the campaign");
    const result = operation?.result();
    if (!result) throw new Error("Debrief requires a completed operation.");
    if (result.status === "success") {
      throw new GameSessionError(
        "invalid-phase",
        "A successful operation requires a lesson choice.",
      );
    }
    const campaign = run.resolve(result);
    scene = sceneFromRun(campaign);
    clearAttempt();
    phase = "briefing";
    assertAffordable(harness, scene);
    return snapshot();
  };

  const chooseLesson = (lessonId: string): GameSnapshot => {
    requirePhase("debrief", "Choosing a lesson");
    const result = operation?.result();
    if (!result || result.status !== "success") {
      throw new GameSessionError("invalid-phase", "A lesson requires a successful operation.");
    }
    if (!result.lessonChoices.some(({ id }) => id === lessonId)) {
      throw new GameSessionError("invalid-target", `Unknown lesson "${lessonId}".`);
    }
    run.resolve(result);
    const campaign = run.decide({ lessonId });
    scene = sceneFromRun(campaign);
    harness = clone(DEFAULT_HARNESS);
    clearAttempt();
    phase = campaign.status === "complete" ? "epilogue" : "briefing";
    assertAffordable(harness, scene);
    return snapshot();
  };

  const reset = (): GameSnapshot => {
    run = createCampaignRun(definition, baseSeed);
    scene = sceneFromRun(run.read());
    phase = scene.identity.kind === "epilogue" ? "epilogue" : "briefing";
    harness = clone(DEFAULT_HARNESS);
    clearAttempt();
    assertAffordable(harness, scene);
    return snapshot();
  };

  const dispatch = (command: GameCommand): GameSnapshot => {
    switch (command.type) {
      case "configure-harness":
        if (!HARNESS_AXES.includes(command.axis)) {
          throw new GameSessionError("invalid-harness", `Unknown harness axis "${command.axis}".`);
        }
        return setHarness({ ...harness, [command.axis]: command.value });
      case "set-harness": return setHarness(command.harness);
      case "start-attempt": return startAttempt();
      case "set-player-speed":
        requirePhase("operation", "Changing player speed");
        if (!PLAYER_SPEEDS.includes(command.speed)) {
          throw new GameSessionError("invalid-speed", "Speed must be 0.5, 1, or 2.");
        }
        playerSpeed = command.speed;
        return snapshot();
      case "pause":
        requirePhase("operation", "Pausing");
        paused = true;
        return snapshot();
      case "resume":
        requirePhase("operation", "Resuming");
        paused = false;
        return snapshot();
      case "set-formation-intent":
      case "issue-guidance": return intervene(command);
      case "continue-campaign": return continueCampaign();
      case "choose-lesson": return chooseLesson(command.lessonId);
      case "reset": return reset();
    }
  };

  return { read: snapshot, dispatch, advance };
}
