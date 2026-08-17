import type { CampaignScene } from "../../../campaign/types";
import {
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type HarnessConsequence,
  type OfficerSimulationSnapshot,
  type OperationMessageSnapshot,
  type OperationMetricsSnapshot,
  type OperationFailureCause,
  type OperationFailureCauseCode,
  type OperationObjectiveSnapshot,
  type OperationObjectiveFact,
  type OperationReplayEntry,
  type OperationResult,
  type OperationSnapshot,
  type OperationSpatialSignalSnapshot,
  type OperationThreatSnapshot,
  type OperationUnitSnapshot,
} from "../../../simulation/simulationTypes";
import type { OperationEvent } from "../operationEvent";
import type { SpatialWorld } from "./spatial";
import type { EncounterSimulation } from "./encounterTypes";
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

type OutcomeContext = {
  scene: CampaignScene;
  harness: HarnessConfiguration;
  consequences: readonly HarnessConsequence[];
  durationMs: number;
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
  encounter: EncounterSimulation;
  threatActorId: (threatId: string) => string;
};

export function createOutcome(context: OutcomeContext) {
  const {
    scene, harness, consequences, durationMs, state,
    officers, messages, spatialSignals, threats, units, objectives, metrics, replayEntries, operationEvents, appendReplay,
    spatialWorld, encounter, threatActorId,
  } = context;

  let operationResult: OperationResult | null = null;

  const latestDecision = (actorId: string, atMs = durationMs): OperationEvent | undefined => {
    for (let index = operationEvents.length - 1; index >= 0; index -= 1) {
      const event = operationEvents[index];
      if (event?.kind === "decision" && event.timeMs <= atMs &&
          event.data.officerId === actorId && typeof event.data.action === "string") {
        return event;
      }
    }
    return undefined;
  };

  const fact = (
    id: string,
    objectiveId: string | null,
    kind: OperationObjectiveFact["kind"],
    passed: boolean,
    actorId: string | null,
    targetId: string,
    observed: OperationObjectiveFact["observed"],
    required: OperationObjectiveFact["required"],
    atMs = durationMs,
  ): OperationObjectiveFact => ({
    id,
    objectiveId,
    kind,
    passed,
    actorId,
    targetId,
    decisionId: actorId ? latestDecision(actorId, atMs)?.id ?? null : null,
    observed,
    required,
  });

  const objectiveFacts = (): OperationObjectiveFact[] => {
    const spatial = spatialWorld.snapshot();
    const facts: OperationObjectiveFact[] = units.map((unit, index) => {
      const actor = spatial.actors.find(({ actorId }) => actorId === unit.officerId);
      const destination = spatial.topology.destinations[index];
      if (!actor || !destination) {
        throw new Error(`Missing authored destination for unit "${unit.officerId}".`);
      }
      const arrived = actor.position.x === destination.position.x &&
        actor.position.y === destination.position.y;
      return fact(
        `vehicle-arrival:${unit.officerId}`,
        unit.objectiveId,
        "vehicle-arrival",
        arrived && unit.health > 0,
        unit.officerId,
        destination.id,
        arrived ? unit.health : `${actor.position.x},${actor.position.y}`,
        destination.id,
      );
    });

    objectives.forEach((objective) => {
      const targetedThreats = threats.filter(({ target }) => target === objective.id);
      const damagingThreat = targetedThreats.find(({ kind, result }) =>
        kind !== "misinformation" && kind !== "communications" && result === "damaged-objective"
      );
      const resolutionEvent = damagingThreat
        ? operationEvents.find((event) =>
            event.kind === "threat-resolved" && event.data.threatId === damagingThreat.id)
        : undefined;
      const engagingOfficerId = typeof resolutionEvent?.data.engagingOfficerId === "string" &&
        resolutionEvent.data.engagingOfficerId.length > 0
        ? resolutionEvent.data.engagingOfficerId
        : null;
      facts.push(fact(
        `point-preservation:${objective.id}`,
        objective.id,
        "point-preservation",
        damagingThreat === undefined,
        engagingOfficerId,
        objective.id,
        damagingThreat?.id ?? "preserved",
        "preserved",
        resolutionEvent?.timeMs,
      ));
    });

    threats.forEach((threat) => {
      const resolutionEvent = operationEvents.find((event) =>
        event.kind === "threat-resolved" && event.data.threatId === threat.id);
      const actorId = typeof resolutionEvent?.data.engagingOfficerId === "string" &&
        resolutionEvent.data.engagingOfficerId.length > 0
        ? resolutionEvent.data.engagingOfficerId
        : `threat:${threat.id}`;
      facts.push(fact(
        `threat-neutralization:${threat.id}`,
        threat.target,
        "threat-neutralization",
        threat.result === "blocked",
        actorId,
        `threat:${threat.id}`,
        threat.result ?? "unresolved",
        "blocked",
        threat.resolutionTimeMs,
      ));
    });

    const damagingThreat = threats.find(({ result }) => result === "damaged-objective");
    facts.push(fact(
      "civilian-survival:operation",
      scene.objectives.find(({ id }) => id.startsWith("protect-"))?.id ?? null,
      "civilian-survival",
      metrics.civilianSafety >= 65,
      damagingThreat ? `threat:${damagingThreat.id}` : null,
      "civilian-population",
      metrics.civilianSafety,
      65,
      damagingThreat?.resolutionTimeMs,
    ));

    const actionOfficer = officers.find(({ disposition }) => disposition === "action");
    scene.objectives.forEach((objective) => {
      if (objective.id.startsWith("route-")) {
        const routed = actionOfficer
          ? messages.find((message) =>
              message.deliveryState === "delivered" &&
              message.sourceOfficerId !== actionOfficer.id &&
              message.recipientOfficerIds.includes(actionOfficer.id))
          : undefined;
        facts.push(fact(
          `report-routing:${objective.id}`,
          objective.id,
          "report-routing",
          routed !== undefined,
          actionOfficer?.id ?? null,
          routed?.authoredReportId ?? objective.id,
          routed?.authoredReportId ?? false,
          "delivered-to-action-officer",
          routed?.deliveryAtMs,
        ));
      }
      if (objective.id.startsWith("verify-")) {
        const firstThreatAt = threats.length === 0
          ? durationMs
          : Math.min(...threats.map(({ resolutionTimeMs }) => resolutionTimeMs));
        const verified = messages.find((message) =>
          message.verificationState === "verified" &&
          (message.verificationDueAtMs ?? durationMs) <= firstThreatAt);
        facts.push(fact(
          `report-verification:${objective.id}`,
          objective.id,
          "report-verification",
          verified !== undefined,
          verified?.sourceOfficerId ?? null,
          verified?.authoredReportId ?? objective.id,
          verified?.verificationDueAtMs ?? false,
          `before:${firstThreatAt}`,
          verified?.verificationDueAtMs ?? firstThreatAt,
        ));
      }
      if (objective.id.startsWith("align-")) {
        const alignedReport = messages.find((message) => {
          const informed = officers.filter((officer) =>
            officer.memory.entries.some((entry) =>
              entry.subjectId === message.authoredReportId &&
              entry.verificationState === "verified"));
          return informed.length === officers.length;
        });
        facts.push(fact(
          `shared-belief:${objective.id}`,
          objective.id,
          "shared-belief",
          alignedReport !== undefined,
          alignedReport?.sourceOfficerId ?? null,
          alignedReport?.authoredReportId ?? objective.id,
          alignedReport?.authoredReportId ?? false,
          "all-officers-verified",
        ));
      }
      if (objective.id.startsWith("keep-")) {
        facts.push(fact(
          `command-channel:${objective.id}`,
          objective.id,
          "command-channel",
          metrics.signalBacklog === 0,
          null,
          "command-channel",
          metrics.signalBacklog,
          0,
        ));
      }
      if (objective.id.startsWith("enable-autonomous-replan")) {
        const replanEvent = operationEvents.find(({ kind }) => kind === "autonomous-replan");
        facts.push(fact(
          `autonomous-replan:${objective.id}`,
          objective.id,
          "autonomous-replan",
          state.autonomousReplan && metrics.interventionCount === 0,
          typeof replanEvent?.data.officerId === "string" ? replanEvent.data.officerId : null,
          objective.id,
          state.autonomousReplan,
          true,
          replanEvent?.timeMs,
        ));
      }
    });

    return facts;
  };

  const FAILURE_CODE_BY_FACT = {
    "vehicle-arrival": "vehicle-not-arrived",
    "point-preservation": "point-not-preserved",
    "civilian-survival": "civilian-survival-failed",
    "threat-neutralization": "threat-not-neutralized",
    "report-routing": "report-not-routed",
    "report-verification": "report-not-verified",
    "shared-belief": "shared-belief-not-aligned",
    "command-channel": "command-channel-congested",
    "autonomous-replan": "autonomous-replan-not-achieved",
  } as const satisfies Record<OperationObjectiveFact["kind"], OperationFailureCauseCode>;
  const failureCodeFor = (kind: OperationObjectiveFact["kind"]): OperationFailureCauseCode =>
    FAILURE_CODE_BY_FACT[kind];

  const finishOperation = (): void => {
    const facts = objectiveFacts();
    const requiredObjectiveIds = new Set(
      scene.objectives.filter(({ required }) => required).map(({ id }) => id),
    );
    const requiredFacts = facts.filter(({ objectiveId }) =>
      objectiveId === null || requiredObjectiveIds.has(objectiveId));
    const failureCauses: OperationFailureCause[] = requiredFacts
      .filter(({ passed }) => !passed)
      .map((failedFact) => ({
        code: failureCodeFor(failedFact.kind),
        factId: failedFact.id,
        objectiveId: failedFact.objectiveId,
        actorId: failedFact.actorId,
        targetId: failedFact.targetId,
        decisionId: failedFact.decisionId,
      }));
    const succeeded = failureCauses.length === 0;
    const transition = succeeded
      ? scene.transitions.find(({ outcomeId }) => outcomeId !== "retry")
      : scene.transitions.find(({ outcomeId }) => outcomeId === "retry");
    if (!transition) throw new Error("The authored scene does not declare the computed outcome.");
    state.status = succeeded ? "success" : "retry";
    state.outcomeId = transition.outcomeId;
    objectives.forEach((objective) => {
      const factsForObjective = facts.filter(({ objectiveId }) => objectiveId === objective.id);
      const passedFacts = factsForObjective.filter(({ passed }) => passed).length;
      objective.progress = factsForObjective.length === 0 ? 0 : passedFacts / factsForObjective.length;
      objective.completed = factsForObjective.length > 0 && passedFacts === factsForObjective.length;
    });
    metrics.objectiveProgress = rounded(
      objectives.reduce((total, objective) => total + objective.progress, 0) / Math.max(1, objectives.length),
    );
    operationResult = {
      status: state.status,
      outcomeId: state.outcomeId,
      objectiveFacts: facts,
      failureCauses,
    };
    appendReplay("outcome", durationMs, `Operation ended with declared outcome ${state.outcomeId}.`, {
      outcomeId: state.outcomeId,
      status: state.status,
      objectiveFactIds: facts.map(({ id }) => id),
      failedObjectiveFactIds: failureCauses.map(({ factId }) => factId),
      failureCauses: failureCauses.map(({ code }) => code),
      causalActorIds: [...new Set(facts.flatMap(({ actorId }) => actorId ? [actorId] : []))],
      causalTargetIds: [...new Set(facts.map(({ targetId }) => targetId))],
      causalDecisionIds: [...new Set(facts.flatMap(({ decisionId }) => decisionId ? [decisionId] : []))],
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
      experienceLevel: officer.experienceLevel,
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
  const threatSnapshots = (): OperationThreatSnapshot[] => {
    const encounterActors = encounter.snapshot().actors;
    return threats.map((threat) => {
      const actorId = threatActorId(threat.id);
      const actor = encounterActors.find(({ id }) => id === actorId);
      if (!actor) throw new Error(`Missing hostile encounter actor "${actorId}".`);
      return {
        ...threat,
        tile: actor.position,
        health: actor.health,
        suppression: actor.suppression,
        panicReaction: actor.panicReaction,
      };
    });
  };
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
    result: operationResult,
    harness,
    officers: officerSnapshots(),
    messages: messageSnapshots(),
    signals: signalSnapshots(),
    threats: threatSnapshots(),
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
