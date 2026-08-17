import type {
  AgentProfile,
  CampaignMapTopology,
  CampaignOfficer,
  CampaignScene,
  CampaignTilePosition,
  ThreatLane,
} from "../../../campaign/types";
import { deriveRandomStreamSeed, type RandomSeed } from "../../../simulation/seededRandom";
import type {
  HarnessConfiguration,
  HarnessConsequence,
  OperationOfficerExperience,
  OperationReplayEntry,
  OperationReplayKind,
  OperationSimulation,
  OperationWorldEventKind,
  ReplayDataValue,
} from "../../../simulation/simulationTypes";
import { OPERATION_FIXED_STEP_MS } from "../../../simulation/simulationTypes";
import {
  projectOperationReplay,
  type OperationEvent,
  type OperationReplayEvent,
} from "../operationEvent";
import { confidenceFor, createDecisions } from "./decisions";
import { createOutcome } from "./outcome";
import { createSignals } from "./signals";
import { createThreats } from "./threats";
import { assertPlayableScene, createTimeline, orderBeats } from "./timeline";
import type {
  MutableMessage,
  MutableMetrics,
  MutableObjective,
  MutableOfficer,
  MutableSpatialSignal,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
} from "./operationTypes";
import { LANES, SEVERITY_DAMAGE, clamp, clone, rounded } from "./operationTypes";
import {
  createOperationRandomStreams,
  operationRandomStreamKey,
} from "./randomStreams";
import { createSpatialWorld } from "./spatial";
import { createBoundedMemory } from "./agent/memory";
import { defaultAgentProfile } from "./agent/perception";
import { DEFAULT_INTENT_BY_DISPOSITION } from "./agent/actions";
import { createEncounterSimulation } from "./encounters";
import type { EncounterActorDefinition } from "./encounterTypes";

const threatActorId = (threatId: string): string => `threat:${threatId}`;

function allocateThreatPositions(
  topology: CampaignMapTopology,
  lanes: readonly ThreatLane[],
): CampaignTilePosition[] {
  const reserved = new Set([
    ...topology.blocked,
    ...topology.spawns.map(({ position }) => position),
    ...topology.destinations.map(({ position }) => position),
    ...topology.terrain.map(({ position }) => position),
  ].map(({ x, y }) => `${x},${y}`));
  const laneY: Record<ThreatLane, number> = {
    north: Math.round((topology.height - 1) * 0.15),
    center: Math.round((topology.height - 1) * 0.5),
    south: Math.round((topology.height - 1) * 0.8),
    command: Math.round((topology.height - 1) * 0.5),
  };
  return lanes.map((lane) => {
    const candidates = Array.from({ length: topology.width * topology.height }, (_, index) => ({
      x: index % topology.width,
      y: Math.floor(index / topology.width),
    })).sort((left, right) =>
      Math.abs(left.y - laneY[lane]) - Math.abs(right.y - laneY[lane]) ||
      right.x - left.x || left.y - right.y
    );
    const position = candidates.find((candidate) => !reserved.has(`${candidate.x},${candidate.y}`));
    if (!position) throw new RangeError("Operation map has no traversable tile for an authored threat.");
    reserved.add(`${position.x},${position.y}`);
    return position;
  });
}

function assertHarness(harness: HarnessConfiguration): void {
  const fields = ["informationReach", "authorityClarity", "verificationDepth", "feedbackCompression"] as const;
  fields.forEach((field) => {
    const value = harness[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`Harness ${field} must be between zero and one.`);
    }
  });
}

const MAX_OFFICER_EXPERIENCE = 2;

function experienceByOfficer(
  roster: readonly CampaignOfficer[],
  supplied: readonly OperationOfficerExperience[],
): ReadonlyMap<string, number> {
  const rosterIds = new Set(roster.map(({ id }) => id));
  const result = new Map<string, number>();
  supplied.forEach(({ officerId, level }) => {
    if (!rosterIds.has(officerId)) {
      throw new RangeError(`Operation experience references unknown officer "${officerId}".`);
    }
    if (result.has(officerId)) {
      throw new RangeError(`Operation experience repeats officer "${officerId}".`);
    }
    if (!Number.isSafeInteger(level) || level < 0 || level > MAX_OFFICER_EXPERIENCE) {
      throw new RangeError(
        `Operation experience for "${officerId}" must be between zero and ${MAX_OFFICER_EXPERIENCE}.`,
      );
    }
    result.set(officerId, level);
  });
  return result;
}

function applyExperience(profile: AgentProfile, level: number): AgentProfile {
  return {
    ...profile,
    initiative: clamp(profile.initiative + level * 0.02),
    discipline: clamp(profile.discipline + level * 0.04),
    cooperation: clamp(profile.cooperation + level * 0.03),
    stressTolerance: clamp(profile.stressTolerance + level * 0.05),
    memoryCapacity: profile.memoryCapacity + level,
  };
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
  suppliedExperience: readonly OperationOfficerExperience[] = [],
): OperationSimulation {
  assertHarness(suppliedHarness);
  assertPlayableScene(suppliedScene, suppliedRoster);

  const scene = clone(suppliedScene);
  const roster = clone(suppliedRoster);
  const harness = clone(suppliedHarness);
  const experience = experienceByOfficer(roster, clone(suppliedExperience));
  const mapTopology = scene.mapTopology;
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
    signalSequence: 0,
    crossChecked: false,
    authorityReassigned: false,
    autonomousReplan: false,
  };
  const replayEntries: OperationReplayEntry[] = [];
  const operationEvents: OperationEvent[] = [];
  const messages: MutableMessage[] = [];
  const spatialSignals: MutableSpatialSignal[] = [];
  const threats: MutableThreat[] = [];
  const objectives: MutableObjective[] = scene.objectives.map((objective) => ({
    id: objective.id,
    required: objective.required,
    progress: 0,
    completed: false,
  }));
  const officers: MutableOfficer[] = roster.map((officer) => {
    const experienceLevel = experience.get(officer.id) ?? 0;
    const profile = applyExperience(
      officer.profile ?? defaultAgentProfile(officer.disposition),
      experienceLevel,
    );
    return {
      id: officer.id,
      experienceLevel,
      disposition: officer.disposition,
      intent: DEFAULT_INTENT_BY_DISPOSITION[officer.disposition],
      confidence: confidenceFor(officer.disposition, harness),
      profile,
      memory: createBoundedMemory(profile.memoryCapacity),
      decisionCadenceMs: 0,
      committedAction: null,
      authorized: !compoundReplanRequired && officer.disposition === "action" &&
        harness.authorityClarity >= 0.45 && harness.authorityClarity <= 0.88,
    };
  });
  const units: MutableUnit[] = roster.map((officer, index) => ({
    officerId: officer.id,
    lane: LANES[index % LANES.length] as ThreatLane,
    intent: DEFAULT_INTENT_BY_DISPOSITION[officer.disposition],
    health: 100,
    suppression: 0,
    panicReaction: null,
    objectiveId: objectives[index % Math.max(1, objectives.length)]?.id ?? null,
  }));
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
  const authoredThreats = orderedBeats.flatMap(({ threats }) => threats);
  const threatPositions = allocateThreatPositions(
    mapTopology,
    authoredThreats.map(({ lane }) => lane),
  );
  const encounterRange = Math.max(2, Math.ceil(Math.hypot(mapTopology.width, mapTopology.height) * 0.5));
  const officerActors: EncounterActorDefinition[] = roster.map((officer, index) => {
    const runtimeOfficer = officers[index] as MutableOfficer;
    return {
      id: officer.id,
      team: "officer",
      position: mapTopology.spawns[index]!.position,
      disposition: officer.disposition,
      profile: runtimeOfficer.profile,
      weapon: {
        range: encounterRange,
        accuracy: clamp(0.32 + readiness * 0.55, 0.2, 0.82),
        damage: 55,
        suppression: 0.4,
      },
    };
  });
  const hostileActors: EncounterActorDefinition[] = authoredThreats.map((threat, index) => ({
    id: threatActorId(threat.id),
    team: "hostile",
    position: threatPositions[index]!,
    disposition: "action",
    profile: {
      initiative: 0.7,
      caution: 0.25,
      discipline: 0.55,
      cooperation: 0.2,
      stressTolerance: 0.7,
      memoryCapacity: 1,
      sourceTrust: [],
    },
    health: ({ low: 35, medium: 55, high: 90, critical: 110 } as const)[threat.severity],
    weapon: {
      range: Math.hypot(mapTopology.width, mapTopology.height),
      accuracy: ({ low: 0.55, medium: 0.65, high: 0.75, critical: 0.85 } as const)[threat.severity],
      damage: SEVERITY_DAMAGE[threat.severity],
      suppression: ({ low: 0.45, medium: 0.6, high: 0.75, critical: 0.9 } as const)[threat.severity],
    },
  }));
  const encounter = createEncounterSimulation({
    id: scene.identity.id,
    topology: mapTopology,
    cover: mapTopology.terrain.filter(({ movementCost }) => movementCost > 1).map(({ position }) => position),
    actors: [...officerActors, ...hostileActors],
  }, deriveRandomStreamSeed(runSeed, operationRandomStreamKey.encounter(scene.identity.id)));
  const metrics: MutableMetrics = {
    objectiveProgress: 0,
    civilianSafety: 100,
    logistics: 100,
    organizationTrust: 100,
    signalBacklog: 0,
    interventionCount: 0,
    attentionSpent: 0,
    autonomyScore: 100,
  };

  let eventSequence = 0;
  const appendReplay = (
    kind: OperationReplayKind,
    timeMs: number,
    description: string,
    data: Readonly<Record<string, ReplayDataValue>> = {},
  ): void => {
    const event: OperationReplayEvent = {
      id: `${scene.identity.id}:event-${eventSequence}`,
      sequence: eventSequence,
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
    eventSequence += 1;
  };
  const appendWorldEvent = (
    kind: OperationWorldEventKind,
    timeMs: number,
    data: Readonly<Record<string, ReplayDataValue>> = {},
  ): void => {
    operationEvents.push({
      id: `${scene.identity.id}:event-${eventSequence}`,
      sequence: eventSequence,
      timeMs,
      kind,
      data: clone(data),
    });
    eventSequence += 1;
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
    roster, harness, consequences, durationMs, state, officers, messages, spatialSignals, metrics, appendReplay,
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
    durationMs, state, officers, threats, objectives, units, metrics, appendReplay,
    appendWorldEvent,
    addBelief: signals.addBelief,
    spatialWorld,
    encounter,
    threatActorId,
    noticeThreat: (officer, threat) => {
      const severity = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 } as const;
      const probability = clamp(
        0.3 + officer.profile.discipline * 0.24 + officer.profile.caution * 0.16 +
          severity[threat.severity] * 0.16,
      );
      return randomStreams.stream(
        operationRandomStreamKey.threatAwareness(officer.id, threat.id),
      ).next() < probability;
    },
    resolutionRandom: (threatId) => randomStreams.stream(
      operationRandomStreamKey.threatResolution(threatId),
    ),
  });
  const outcome = createOutcome({
    scene, harness, consequences, durationMs, state,
    officers, messages, spatialSignals, threats, units, objectives, metrics, replayEntries, operationEvents, appendReplay,
    spatialWorld,
    encounter,
    threatActorId,
  });
  const decisions = createDecisions({
    scene, roster, harness, durationMs, compoundReplanRequired, state, officers, messages, spatialSignals, threats, units,
    objectives, metrics, appendReplay, spatialWorld,
    decisionRandom: (officerId) => randomStreams.stream(operationRandomStreamKey.officerDecision(officerId)),
    updateBacklog: signals.updateBacklog, snapshot: outcome.snapshot,
    issueSpatialSignal: signals.issueSpatialSignal,
    broadcastBelief: signals.broadcastBelief,
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
    processSpatialSignals: signals.processSpatialSignals,
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
