import type { CampaignScene } from "../../../campaign/types";
import {
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type HarnessConsequence,
  type OfficerSimulationSnapshot,
  type OperationMessageSnapshot,
  type OperationMetricsSnapshot,
  type OperationObjectiveSnapshot,
  type OperationReplayEntry,
  type OperationSnapshot,
  type OperationSpatialSignalSnapshot,
  type OperationUnitSnapshot,
} from "../../../simulation/simulationTypes";
import type { OperationEvent } from "../operationEvent";
import type { SpatialWorld } from "./spatial";
import type {
  AppendReplay,
  MutableMessage,
  MutableMetrics,
  MutableObjective,
  MutableOfficer,
  MutableSpatialSignal,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
} from "./operationTypes";
import { clone, rounded } from "./operationTypes";
import { perceive } from "./agent/perception";

export function operationSucceeded(readiness: number, blockedRatio: number, civilianSafety: number, logistics: number, requiredReplanSatisfied: boolean): boolean {
  return readiness >= 0.52 && blockedRatio >= 0.6 && civilianSafety >= 65 && logistics >= 65 && requiredReplanSatisfied;
}

type OutcomeContext = {
  scene: CampaignScene;
  harness: HarnessConfiguration;
  consequences: readonly HarnessConsequence[];
  durationMs: number;
  readiness: number;
  compoundReplanRequired: boolean;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  messages: MutableMessage[];
  spatialSignals: MutableSpatialSignal[];
  threats: MutableThreat[];
  units: MutableUnit[];
  objectives: MutableObjective[];
  metrics: MutableMetrics;
  replayEntries: OperationReplayEntry[];
  operationEvents: OperationEvent[];
  appendReplay: AppendReplay;
  spatialWorld: SpatialWorld;
};

export function createOutcome(context: OutcomeContext) {
  const {
    scene, harness, consequences, durationMs, readiness, compoundReplanRequired, state,
    officers, messages, spatialSignals, threats, units, objectives, metrics, replayEntries, operationEvents, appendReplay,
    spatialWorld,
  } = context;

  const finishOperation = (): void => {
    const blockedThreats = threats.filter(({ result }) => result === "blocked").length;
    const blockedRatio = blockedThreats / Math.max(1, threats.length);
    const requiredReplanSatisfied = !compoundReplanRequired || (state.autonomousReplan && metrics.interventionCount === 0);
    const succeeded = operationSucceeded(readiness, blockedRatio, metrics.civilianSafety, metrics.logistics, requiredReplanSatisfied);
    const transition = succeeded
      ? scene.transitions.find(({ outcomeId }) => outcomeId !== "retry")
      : scene.transitions.find(({ outcomeId }) => outcomeId === "retry");
    if (!transition) throw new Error("The authored scene does not declare the computed outcome.");
    state.status = succeeded ? "success" : "retry";
    state.outcomeId = transition.outcomeId;
    objectives.forEach((objective, index) => {
      if (succeeded) {
        objective.progress = 1;
        objective.completed = true;
      } else {
        objective.progress = Math.min(objective.progress, index === 0 ? 0.75 : 0.9);
        objective.completed = !objective.required && objective.progress >= 0.8;
      }
    });
    metrics.objectiveProgress = rounded(
      objectives.reduce((total, objective) => total + objective.progress, 0) / Math.max(1, objectives.length),
    );
    appendReplay("outcome", durationMs, `Operation ended with declared outcome ${state.outcomeId}.`, {
      outcomeId: state.outcomeId,
      status: state.status,
      blockedThreats,
      threatCount: threats.length,
      readiness: rounded(readiness),
      autonomousReplan: state.autonomousReplan,
      interventionCount: metrics.interventionCount,
    });
  };

  const officerSnapshots = (): OfficerSimulationSnapshot[] => officers.map((officer) => {
    const perception = perceive({
      observation: { observedAtMs: state.elapsedMs, facts: [] },
      receivedReports: [],
      profile: officer.profile,
      memory: officer.memory,
      nowMs: state.elapsedMs,
    });
    return {
      id: officer.id,
      profile: officer.profile,
      memorySize: perception.memory.entries.length,
      disposition: officer.disposition,
      intent: officer.intent,
      confidence: officer.confidence,
      currentBelief: perception.beliefs.at(-1) ?? null,
      beliefs: perception.beliefs,
      decisionCadenceMs: officer.decisionCadenceMs,
      committedAction: state.status === "running" ? officer.committedAction : null,
      authorized: officer.authorized,
    };
  });
  const messageSnapshots = (): OperationMessageSnapshot[] =>
    messages.map(({ verificationDueAtMs: _verificationDueAtMs, ...message }) => clone(message));
  const signalSnapshots = (): OperationSpatialSignalSnapshot[] =>
    spatialSignals.map((signal) => clone(signal));
  const objectiveSnapshots = (): OperationObjectiveSnapshot[] => objectives.map((objective) => ({ ...objective }));
  const unitSnapshots = (): OperationUnitSnapshot[] => {
    const spatial = spatialWorld.snapshot();
    return units.map((unit) => {
      const actor = spatial.actors.find(({ actorId }) => actorId === unit.officerId);
      if (!actor) throw new Error(`Missing spatial actor "${unit.officerId}".`);
      return {
        ...unit,
        tile: actor.position,
        path: actor.path,
        lane: unit.lane,
        position: actor.position.x / Math.max(1, spatial.topology.width - 1),
        route: [unit.lane],
      };
    });
  };
  const metricsSnapshot = (): OperationMetricsSnapshot => ({ ...metrics });

  const snapshot = (): OperationSnapshot => clone({
    sceneId: scene.identity.id,
    elapsedMs: state.elapsedMs,
    durationMs,
    fixedStepMs: OPERATION_FIXED_STEP_MS,
    status: state.status,
    outcomeId: state.outcomeId,
    harness,
    officers: officerSnapshots(),
    messages: messageSnapshots(),
    signals: signalSnapshots(),
    threats,
    units: unitSnapshots(),
    spatial: spatialWorld.snapshot(),
    objectives: objectiveSnapshots(),
    metrics: metricsSnapshot(),
    consequences,
  });
  const replay = (): readonly OperationReplayEntry[] => clone(replayEntries);
  const events = (): readonly OperationEvent[] => clone(operationEvents);

  return { finishOperation, snapshot, replay, events };
}
