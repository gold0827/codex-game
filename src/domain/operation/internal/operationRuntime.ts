import type { CampaignOfficer, CampaignScene, ThreatLane } from "../../../campaign/types";
import { deriveRandomStreamSeed, type RandomSeed } from "../../../simulation/seededRandom";
import type {
  HarnessConfiguration,
  HarnessConsequence,
  OperationReplayEntry,
  OperationReplayKind,
  OperationSimulation,
  ReplayDataValue,
} from "../../../simulation/simulationTypes";
import { OPERATION_FIXED_STEP_MS } from "../../../simulation/simulationTypes";
import { projectOperationReplay, type OperationEvent } from "../operationEvent";
import { confidenceFor, createDecisions, intentAlternatives } from "./decisions";
import { createOutcome } from "./outcome";
import { createSignals } from "./signals";
import { createThreats } from "./threats";
import { assertPlayableScene, createTimeline, orderBeats } from "./timeline";
import type {
  MutableMessage,
  MutableMetrics,
  MutableObjective,
  MutableOfficer,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
} from "./operationTypes";
import { LANES, clamp, clone, rounded } from "./operationTypes";
import {
  createOperationRandomStreams,
  operationRandomStreamKey,
} from "./randomStreams";
import { createSpatialWorld } from "./spatial";

function assertHarness(harness: HarnessConfiguration): void {
  const fields = ["informationReach", "authorityClarity", "verificationDepth", "feedbackCompression"] as const;
  fields.forEach((field) => {
    const value = harness[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`Harness ${field} must be between zero and one.`);
    }
  });
}

function detectConsequences(harness: HarnessConfiguration): HarnessConsequence[] {
  const consequences: HarnessConsequence[] = [];
  if (harness.informationReach > 0.82) consequences.push("information-saturation");
  if (harness.authorityClarity < 0.35) consequences.push("ambiguous-authority");
  if (harness.verificationDepth > 0.82) consequences.push("verification-congestion");
  if (harness.feedbackCompression < 0.35) consequences.push("noisy-feedback");
  if (harness.authorityClarity > 0.88) consequences.push("over-centralization");
  return consequences;
}

function harnessReadiness(harness: HarnessConfiguration, consequences: readonly HarnessConsequence[]): number {
  const capacityUsed = harness.informationReach + harness.authorityClarity + harness.verificationDepth + harness.feedbackCompression;
  const overloadPenalty = Math.max(0, capacityUsed - 3) * 0.12;
  const consequencePenalty = consequences.reduce((penalty, consequence) => {
    if (consequence === "ambiguous-authority") return penalty + 0.12;
    if (consequence === "information-saturation") return penalty + 0.08;
    if (consequence === "verification-congestion") return penalty + 0.1;
    if (consequence === "noisy-feedback") return penalty + 0.1;
    return penalty + 0.08;
  }, 0);
  return clamp(
    harness.informationReach * 0.25 + harness.authorityClarity * 0.25 + harness.verificationDepth * 0.25 +
    harness.feedbackCompression * 0.18 - overloadPenalty - consequencePenalty,
  );
}

export function createOperationSimulation(
  suppliedScene: CampaignScene,
  suppliedRoster: readonly CampaignOfficer[],
  runSeed: RandomSeed,
  suppliedHarness: HarnessConfiguration,
): OperationSimulation {
  assertHarness(suppliedHarness);
  assertPlayableScene(suppliedScene, suppliedRoster);

  const scene = clone(suppliedScene);
  const roster = clone(suppliedRoster);
  const harness = clone(suppliedHarness);
  const mapTopology = scene.mapTopology;
  if (!mapTopology) {
    throw new RangeError("Operation simulation requires authored map topology.");
  }
  const randomStreams = createOperationRandomStreams(
    deriveRandomStreamSeed(
      runSeed,
      operationRandomStreamKey.encounter(scene.identity.id),
    ),
  );
  const durationMs = scene.encounterParameters.durationMs;
  const consequences = detectConsequences(harness);
  const readiness = harnessReadiness(harness, consequences);
  const orderedBeats = orderBeats(scene.beats);
  const compoundReplanRequired =
    new Set(scene.beats.flatMap((beat) => beat.threats.map(({ kind }) => kind))).size >= 3 &&
    scene.beats.some((beat) => beat.threats.some(({ kind }) => kind === "misinformation"));

  const state: OperationRuntimeState = {
    elapsedMs: 0,
    accumulatedMs: 0,
    status: "running",
    outcomeId: null,
    nextBeatIndex: 0,
    messageSequence: 0,
    crossChecked: false,
    authorityReassigned: false,
    autonomousReplan: false,
  };
  const replayEntries: OperationReplayEntry[] = [];
  const operationEvents: OperationEvent[] = [];
  const messages: MutableMessage[] = [];
  const threats: MutableThreat[] = [];
  const objectives: MutableObjective[] = scene.objectives.map((objective) => ({
    id: objective.id,
    required: objective.required,
    progress: 0,
    completed: false,
  }));
  const officers: MutableOfficer[] = roster.map((officer) => ({
    id: officer.id,
    disposition: officer.disposition,
    intent: intentAlternatives(officer.disposition)[0],
    confidence: confidenceFor(officer.disposition, harness),
    beliefs: [],
    pendingDecision: null,
    authorized: !compoundReplanRequired && officer.disposition === "action" &&
      harness.authorityClarity >= 0.45 && harness.authorityClarity <= 0.88,
  }));
  const units: MutableUnit[] = roster.map((officer, index) => ({
    officerId: officer.id,
    lane: LANES[index % LANES.length] as ThreatLane,
    intent: intentAlternatives(officer.disposition)[0],
    health: 100,
    objectiveId: objectives[index % Math.max(1, objectives.length)]?.id ?? null,
  }));
  if (mapTopology.spawns.length < roster.length ||
      mapTopology.destinations.length < roster.length) {
    throw new RangeError("Operation map requires one unique spawn and destination per officer.");
  }
  const spatialWorld = createSpatialWorld(
    mapTopology,
    roster.map((officer, index) => ({
      actorId: officer.id,
      position: mapTopology.spawns[index]!.position,
    })),
  );
  roster.forEach((officer, index) => {
    spatialWorld.execute({
      actorId: officer.id,
      destination: mapTopology.destinations[index]!.position,
    });
  });
  const metrics: MutableMetrics = {
    objectiveProgress: 0,
    civilianSafety: 100,
    logistics: 100,
    organizationTrust: 100,
    signalBacklog: 0,
    interventionCount: 0,
    autonomyScore: 100,
  };

  let replaySequence = 0;
  const appendReplay = (
    kind: OperationReplayKind,
    timeMs: number,
    description: string,
    data: Readonly<Record<string, ReplayDataValue>> = {},
  ): void => {
    const event: OperationEvent = {
      id: `${scene.identity.id}:event-${replaySequence}`,
      sequence: replaySequence,
      timeMs,
      kind,
      data: clone(data),
    };
    operationEvents.push(event);
    const projected = projectOperationReplay({ ...event, data: { ...event.data, description } });
    const projectedDescription = projected.description;
    const { description: _projectedDescription, ...projectedEvent } = projected;
    replayEntries.push({
      sequence: projectedEvent.sequence,
      timeMs: projectedEvent.timeMs,
      kind: projectedEvent.kind,
      description: projectedDescription,
      data: Object.fromEntries(Object.entries(projectedEvent.data).filter(([key]) => key !== "description")),
    });
    replaySequence += 1;
  };
  const selectAlternative = <Value extends string>(
    stableKey: string,
    reason: string,
    alternatives: readonly Value[],
    timeMs: number,
  ): Value => {
    const selected = alternatives[
      randomStreams.stream(stableKey).integer(alternatives.length)
    ] as Value;
    appendReplay("random-choice", timeMs, `Random choice for ${reason}: ${selected}.`, { reason, selected, alternatives });
    return selected;
  };
  const selectDecisionAlternative = <Value extends string>(
    reason: string,
    alternatives: readonly Value[],
    timeMs: number,
  ): Value => {
    const officerId = roster.find(({ id }) => reason.startsWith(`${id} `))?.id;
    return selectAlternative(
      operationRandomStreamKey.officerDecision(officerId ?? reason),
      reason,
      alternatives,
      timeMs,
    );
  };
  let activeSignalId: string | null = null;
  const selectSignalAlternative = <Value extends string>(
    reason: string,
    alternatives: readonly Value[],
    timeMs: number,
  ): Value => {
    const sourceOfficerId = roster.find(({ id }) => reason.endsWith(id))?.id;
    return selectAlternative(
      operationRandomStreamKey.signal(activeSignalId ?? sourceOfficerId ?? reason),
      reason,
      alternatives,
      timeMs,
    );
  };

  const signals = createSignals({
    roster, harness, consequences, durationMs, state, officers, messages, metrics, appendReplay,
    selectAlternative: selectSignalAlternative,
  });
  const queueReport: typeof signals.queueReport = (report, timeMs) => {
    const previousSignalId = activeSignalId;
    activeSignalId = report.id;
    try {
      signals.queueReport(report, timeMs);
    } finally {
      activeSignalId = previousSignalId;
    }
  };
  const threatRuntime = createThreats({
    harness, durationMs, readiness, state, officers, threats, objectives, units, metrics, appendReplay,
    addBelief: signals.addBelief,
    advanceSpatial: spatialWorld.advance,
  });
  const outcome = createOutcome({
    scene, harness, consequences, durationMs, readiness, compoundReplanRequired, state,
    officers, messages, threats, units, objectives, metrics, replayEntries, operationEvents, appendReplay,
    spatialWorld,
  });
  const decisions = createDecisions({
    scene, roster, harness, durationMs, compoundReplanRequired, state, officers, messages, threats, units,
    metrics, appendReplay, selectAlternative: selectDecisionAlternative,
    updateBacklog: signals.updateBacklog, snapshot: outcome.snapshot,
  });
  const timeline = createTimeline({
    sceneId: scene.identity.id,
    durationMs,
    orderedBeats,
    state,
    appendReplay,
    queueReport,
    telegraphThreat: threatRuntime.telegraphThreat,
    refreshDecisions: decisions.refreshDecisions,
    processMessages: signals.processMessages,
    processCrossCheckAndReplan: decisions.processCrossCheckAndReplan,
    processThreats: threatRuntime.processThreats,
    updateProgress: threatRuntime.updateProgress,
    finishOperation: outcome.finishOperation,
    snapshot: outcome.snapshot,
  });

  appendReplay("operation-started", 0, `Operation ${scene.identity.id} started.`, {
    sceneId: scene.identity.id,
    durationMs,
    fixedStepMs: OPERATION_FIXED_STEP_MS,
    readiness: rounded(readiness),
  });
  consequences.forEach((consequence) => {
    appendReplay("harness-consequence", 0, `Harness consequence detected: ${consequence}.`, { consequence });
  });
  timeline.activateDueBeats();
  if (state.nextBeatIndex === 0 || orderedBeats[0]?.timeMs !== 0) decisions.refreshDecisions("operation start", 0);

  return {
    snapshot: outcome.snapshot,
    replay: outcome.replay,
    events: outcome.events,
    advance: timeline.advance,
    intervene: decisions.intervene,
  };
}

export const createOperationEngine = createOperationSimulation;
