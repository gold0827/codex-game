import type { CampaignOfficer, CampaignScene, OfficerDisposition } from "../../../campaign/types";
import type { SeededRandom } from "../../../simulation/seededRandom";
import type {
  HarnessConfiguration,
  OperationIntervention,
  OperationSnapshot,
  SpatialSignalKind,
  SpatialSignalStrength,
} from "../../../simulation/simulationTypes";
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
import { clamp, clone } from "./operationTypes";
import type { SpatialWorld } from "./spatial";

const SPATIAL_SIGNAL_DIRECTIVE_DURATION_MS = 20_000;
import { intentForAction } from "./agent/actions";
import { createOfficerMind, type OfficerMindContext } from "./agent/officerMind";
import { perceive } from "./agent/perception";

export function confidenceFor(disposition: OfficerDisposition, harness: HarnessConfiguration): number {
  const raw = disposition === "action"
    ? 0.35 + harness.authorityClarity * 0.55
    : disposition === "verification"
      ? 0.3 + harness.verificationDepth * 0.62
      : 0.25 + harness.informationReach * 0.32 + harness.feedbackCompression * 0.3;
  return Math.round(Math.min(1, Math.max(0, raw)) * 10_000) / 10_000;
}

type DecisionContext = {
  scene: CampaignScene;
  roster: readonly CampaignOfficer[];
  harness: HarnessConfiguration;
  durationMs: number;
  compoundReplanRequired: boolean;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  messages: MutableMessage[];
  spatialSignals: MutableSpatialSignal[];
  threats: MutableThreat[];
  units: MutableUnit[];
  objectives: MutableObjective[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  spatialWorld: SpatialWorld;
  decisionRandom: (officerId: string) => SeededRandom;
  updateBacklog: () => void;
  snapshot: () => OperationSnapshot;
  issueSpatialSignal: (
    signal: SpatialSignalKind,
    strength: SpatialSignalStrength,
    position: Readonly<{ x: number; y: number }>,
    actorPositions: ReadonlyMap<string, Readonly<{ x: number; y: number }>>,
  ) => MutableSpatialSignal;
  broadcastBelief: (sourceOfficerId: string, subjectId: string, timeMs: number) => void;
};

export function createDecisions(context: DecisionContext) {
  const {
    scene, roster, harness, durationMs, compoundReplanRequired, state, officers, messages, spatialSignals,
    threats, units, objectives, metrics, appendReplay, spatialWorld, decisionRandom,
    updateBacklog, snapshot, issueSpatialSignal, broadcastBelief,
  } = context;

  const minds = new Map(officers.map((officer) => {
    const mind = createOfficerMind(
      officer.id,
      officer.profile,
      decisionRandom(officer.id),
    );
    officer.decisionCadenceMs = mind.cadenceMs;
    return [officer.id, mind] as const;
  }));
  const broadcastCounts = new Map<string, number>();

  const severityRisk = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 } as const;

  const mindContextFor = (officer: MutableOfficer): OfficerMindContext => {
    const unit = units.find(({ officerId }) => officerId === officer.id);
    const spatial = spatialWorld.snapshot();
    const actor = spatial.actors.find(({ actorId }) => actorId === officer.id);
    const width = Math.max(1, spatial.topology.width - 1);
    const height = Math.max(1, spatial.topology.height - 1);
    const officerIndex = units.findIndex(({ officerId }) => officerId === officer.id);
    const authoredDestination = spatial.topology.destinations[officerIndex]?.position;
    const desiredPosition = actor?.destination ?? authoredDestination ?? actor?.position;
    const normalizedDistance = actor && desiredPosition
      ? clamp(
          (Math.abs(desiredPosition.x - actor.position.x) +
            Math.abs(desiredPosition.y - actor.position.y)) /
          (width + height),
        )
      : 0;
    const knownThreatIds = new Set(officer.memory.entries
      .filter(({ category }) => category === "threat")
      .map(({ subjectId }) => subjectId));
    const localRisk = threats
      .filter(({ id, state, lane }) =>
        state === "telegraphed" && lane === unit?.lane && knownThreatIds.has(id)
      )
      .reduce((risk, threat) => Math.max(risk, severityRisk[threat.severity]), 0);
    const targetObjective = objectives.find(({ id }) => id === unit?.objectiveId) ?? objectives[0];
    const supportOfficer = officers.find(({ id }) => id !== officer.id) ?? officer;
    const acceptedSignal = [...spatialSignals].reverse().find((signal) =>
      state.elapsedMs - signal.issuedAtMs <= SPATIAL_SIGNAL_DIRECTIVE_DURATION_MS &&
      signal.recipients.some(({ officerId, response }) => officerId === officer.id && response === "accepted")
    );
    const activeThreatIds = new Set(threats
      .filter(({ state }) => state === "telegraphed")
      .map(({ id }) => id));
    const broadcastCandidate = [...officer.memory.entries]
      .filter((entry) => entry.category !== "threat" || activeThreatIds.has(entry.subjectId))
      .sort((left, right) => {
        const leftCount = broadcastCounts.get(`${officer.id}:${left.subjectId}`) ?? 0;
        const rightCount = broadcastCounts.get(`${officer.id}:${right.subjectId}`) ?? 0;
        return leftCount - rightCount ||
          Number(right.category === "threat") - Number(left.category === "threat") ||
          right.rememberedAtMs - left.rememberedAtMs ||
          left.subjectId.localeCompare(right.subjectId);
      })[0];
    return {
      objectiveId: targetObjective?.id ?? "local-objective",
      positionId: desiredPosition
        ? `${desiredPosition.x},${desiredPosition.y}`
        : `${actor?.position.x ?? 0},${actor?.position.y ?? 0}`,
      fallbackAreaId: `fallback-${unit?.lane ?? "command"}`,
      supportOfficerId: supportOfficer.id,
      normalizedDistance,
      risk: localRisk,
      memoryPressure: clamp(officer.memory.entries.length / officer.profile.memoryCapacity),
      signalLoad: clamp(metrics.signalBacklog / Math.max(1, roster.length * 2)),
      signalDirective: acceptedSignal?.kind ?? null,
      signalStrength: acceptedSignal?.strength ?? 0,
      signalPositionId: acceptedSignal ? `${acceptedSignal.position.x},${acceptedSignal.position.y}` : null,
      broadcastBeliefId: broadcastCandidate?.subjectId ?? null,
    };
  };

  const tileFromId = (id: string): Readonly<{ x: number; y: number }> | null => {
    const match = /^(\d+),(\d+)$/.exec(id);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  };

  const executeAction = (officer: MutableOfficer): void => {
    const action = officer.committedAction?.trace.selectedAction;
    if (!action) return;
    const spatial = spatialWorld.snapshot();
    const officerIndex = units.findIndex(({ officerId }) => officerId === officer.id);
    if (action.kind === "move") {
      const destination = tileFromId(action.target.id) ??
        spatial.topology.destinations[officerIndex]?.position;
      if (destination) spatialWorld.execute({ actorId: officer.id, destination });
      return;
    }
    if (action.kind === "investigate" && action.target.kind === "position") {
      const destination = tileFromId(action.target.id);
      if (destination) spatialWorld.execute({ actorId: officer.id, destination });
      return;
    }
    if (action.kind === "retreat") {
      const destination = spatial.topology.spawns[officerIndex]?.position;
      if (destination) spatialWorld.execute({ actorId: officer.id, destination });
      return;
    }
    if (action.kind === "broadcast") {
      broadcastBelief(officer.id, action.target.id, state.elapsedMs);
      const key = `${officer.id}:${action.target.id}`;
      broadcastCounts.set(key, (broadcastCounts.get(key) ?? 0) + 1);
      return;
    }
    if (action.kind === "verify" || action.kind === "investigate") {
      const message = messages.find(({ authoredReportId }) => authoredReportId === action.target.id) ??
        [...messages].reverse().find(({ verificationState }) => verificationState === "pending");
      if (message?.verificationState === "pending") {
        message.prioritized = true;
        const effortMs = action.kind === "verify" ? 300 : 700;
        const completedAtMs = Math.max(
          message.deliveryAtMs + effortMs,
          state.elapsedMs + effortMs,
        );
        message.verificationDueAtMs = Math.min(
          message.verificationDueAtMs ?? durationMs,
          completedAtMs,
        );
      }
      return;
    }
    if (action.kind === "defend") {
      const destination = tileFromId(action.target.id) ??
        spatial.topology.destinations[officerIndex]?.position;
      if (destination) spatialWorld.execute({ actorId: officer.id, destination });
    }
  };

  const refreshDecisions = (reason: string, timeMs: number): void => {
    officers.forEach((officer) => {
      const mind = minds.get(officer.id);
      if (!mind) throw new Error(`Missing OfficerMind for "${officer.id}".`);
      const perception = perceive({
        observation: { observedAtMs: timeMs, facts: [] },
        receivedReports: [],
        profile: officer.profile,
        memory: officer.memory,
        nowMs: timeMs,
      });
      officer.memory = perception.memory;
      const activeThreatIds = new Set(threats
        .filter(({ state }) => state === "telegraphed")
        .map(({ id }) => id));
      const actionablePerception = {
        ...perception,
        beliefs: perception.beliefs.filter((belief) =>
          belief.category !== "threat" || activeThreatIds.has(belief.subjectId)
        ),
      };
      const commitment = mind.consider({
        perception: actionablePerception,
        context: mindContextFor(officer),
        nowMs: timeMs,
        currentCommitment: officer.committedAction,
      });
      if (!commitment) {
        const activeCommitment = officer.committedAction;
        if (activeCommitment && activeCommitment.endsAtMs <= timeMs) {
          officer.committedAction = null;
        }
        return;
      }
      officer.committedAction = commitment;
      const action = commitment.trace.selectedAction;
      executeAction(officer);
      let intent = intentForAction(action.kind);
      if (officer.disposition === "action" && harness.authorityClarity < 0.35) intent = "secure-objective";
      if (officer.disposition === "verification" && harness.verificationDepth >= 0.55 &&
        messages.some(({ verificationState }) => verificationState === "pending")) intent = "cross-check-report";
      if (officer.disposition === "communication" && metrics.signalBacklog > roster.length) intent = "compress-feedback";
      officer.intent = intent;
      const unit = units.find(({ officerId }) => officerId === officer.id);
      if (unit) unit.intent = intent;
      appendReplay("decision", timeMs, `${officer.id} committed to ${action.kind}: ${commitment.trace.topReason}.`, {
        officerId: officer.id,
        disposition: officer.disposition,
        intent,
        action: action.kind,
        target: action.target.id,
        targetKind: action.target.kind,
        topReason: commitment.trace.topReason,
        utility: commitment.trace.utility,
        abandonedAction: commitment.trace.abandonedAlternative.action.kind,
        commitmentEndsAtMs: commitment.endsAtMs,
        cadenceMs: mind.cadenceMs,
        trigger: reason,
        confidence: officer.confidence,
      });
    });
  };

  const processCrossCheckAndReplan = (): void => {
    refreshDecisions("individual cadence elapsed", state.elapsedMs);
    const misinformationExists = threats.some(({ kind }) => kind === "misinformation");
    const verifiedMessages = messages.filter(({ verificationState }) => verificationState === "verified");
    const verifiedSources = new Set(verifiedMessages.map(({ sourceOfficerId }) => sourceOfficerId));
    const verificationOfficers = officers.filter((officer) => {
      const action = officer.committedAction?.trace.selectedAction.kind;
      return action === "verify" || action === "investigate";
    });
    const fieldOfficers = officers.filter((officer) => {
      const action = officer.committedAction?.trace.selectedAction.kind;
      return action === "move" || action === "defend" || action === "support";
    });
    const coordinatingOfficers = officers.filter((officer) => {
      const action = officer.committedAction?.trace.selectedAction.kind;
      return action === "broadcast" || action === "support";
    });
    if (
      !state.crossChecked && misinformationExists && verifiedSources.size >= 2 &&
      verificationOfficers.length > 0 &&
      harness.informationReach >= 0.5 && harness.verificationDepth >= 0.5
    ) {
      state.crossChecked = true;
      const correctedThreatIds = threats
        .filter(({ kind, state: threatState, result }) =>
          kind === "misinformation" && threatState === "resolved" && result === "damaged-objective"
        )
        .map((threat) => {
          threat.result = "blocked";
          return threat.id;
        })
        .sort();
      const sources = [...verifiedSources].sort();
      const reportIds = verifiedMessages.map(({ authoredReportId }) => authoredReportId).sort();
      appendReplay("cross-check", state.elapsedMs, `Contradictory sources cross-checked: ${sources.join(", ")}.`, {
        sourceOfficerIds: sources,
        reportIds,
        officerIds: verificationOfficers.map(({ id }) => id).sort(),
        correctedThreatIds,
      });
    }
    if (state.crossChecked && !state.authorityReassigned && harness.authorityClarity >= 0.45 && harness.authorityClarity <= 0.88) {
      const actionOfficer = fieldOfficers.find(({ disposition }) => disposition === "action");
      if (actionOfficer && !actionOfficer.authorized) {
        const previousAuthorized = actionOfficer.authorized;
        state.authorityReassigned = true;
        actionOfficer.authorized = true;
        appendReplay("authority-reassigned", state.elapsedMs, `Authority reassigned to ${actionOfficer.id} for the verified local threat.`, {
          officerId: actionOfficer.id,
          previousAuthorized,
          newAuthorized: actionOfficer.authorized,
        });
      }
    }
    if (
      compoundReplanRequired && state.crossChecked && state.authorityReassigned && !state.autonomousReplan &&
      verificationOfficers.length > 0 && fieldOfficers.length > 0 && coordinatingOfficers.length > 0 &&
      metrics.interventionCount === 0 && harness.feedbackCompression >= 0.5
    ) {
      state.autonomousReplan = true;
      appendReplay("autonomous-replan", state.elapsedMs, "Officers autonomously replanned from cross-checked evidence and reassigned authority.", {
        interventionCount: metrics.interventionCount,
        crossChecked: state.crossChecked,
        authorityReassigned: state.authorityReassigned,
      });
    }
  };

  const recordInterventionCost = (command: OperationIntervention, description: string): void => {
    metrics.interventionCount += 1;
    metrics.autonomyScore = clamp(metrics.autonomyScore - 15, 0, 100);
    metrics.logistics = clamp(metrics.logistics - 2, 0, 100);
    appendReplay("intervention", state.elapsedMs, description, {
      command: command.kind,
      ...(command.kind === "issue-spatial-signal" ? {
        event: "signal-issued",
        signal: command.signal,
        strength: command.strength,
        x: command.position.x,
        y: command.position.y,
      } : {}),
      autonomyCost: 15,
      logisticsCost: 2,
      interventionCount: metrics.interventionCount,
    });
  };

  const intervene = (suppliedCommand: OperationIntervention): OperationSnapshot => {
    if (state.status !== "running") return snapshot();
    const command = clone(suppliedCommand);
    const attentionCost = command.kind === "issue-spatial-signal" ? command.strength : 1;
    if (metrics.attentionSpent + attentionCost > scene.gameplayTuning.interventionBudget) {
      throw new RangeError("The authored attention budget is exhausted.");
    }
    if (command.kind === "issue-spatial-signal") {
      if (!["investigate", "defend", "avoid"].includes(command.signal)) {
        throw new RangeError(`Unknown spatial signal "${command.signal}".`);
      }
      if (![1, 2, 3].includes(command.strength)) {
        throw new RangeError("Spatial signal strength must be 1, 2, or 3.");
      }
      const topology = spatialWorld.snapshot().topology;
      if (!Number.isSafeInteger(command.position.x) || !Number.isSafeInteger(command.position.y) ||
          command.position.x < 0 || command.position.y < 0 ||
          command.position.x >= topology.width || command.position.y >= topology.height) {
        throw new RangeError("Spatial signal position must be an in-bounds integer tile.");
      }
      const actorPositions = new Map(
        spatialWorld.snapshot().actors.map(({ actorId, position }) => [actorId, position] as const),
      );
      issueSpatialSignal(command.signal, command.strength, command.position, actorPositions);
      recordInterventionCost(command, `Player issued a strength ${command.strength} ${command.signal} signal.`);
    } else if (command.kind === "route-report") {
      const source = messages.find(({ id, authoredReportId }) => id === command.reportId || authoredReportId === command.reportId);
      if (!source) throw new RangeError(`Unknown report "${command.reportId}".`);
      if (!officers.some(({ id }) => id === command.recipientOfficerId)) throw new RangeError(`Unknown officer "${command.recipientOfficerId}".`);
      state.messageSequence += 1;
      messages.push({
        ...clone(source),
        id: `intervention-route-${source.authoredReportId}-${state.messageSequence}`,
        recipientOfficerIds: [command.recipientOfficerId],
        createdAtMs: state.elapsedMs,
        deliveryAtMs: Math.min(durationMs, state.elapsedMs + 300),
        verificationDueAtMs: source.verificationState === "pending" ? Math.min(durationMs, state.elapsedMs + 600) : null,
        deliveryState: "queued",
      });
      recordInterventionCost(command, `Player routed report ${source.authoredReportId} to ${command.recipientOfficerId}.`);
    } else if (command.kind === "authorize-officer") {
      const officer = officers.find(({ id }) => id === command.officerId);
      if (!officer) throw new RangeError(`Unknown officer "${command.officerId}".`);
      officer.authorized = true;
      recordInterventionCost(command, `Player authorized officer ${command.officerId}.`);
    } else {
      const message = messages.find(({ id, authoredReportId }) => id === command.reportId || authoredReportId === command.reportId);
      if (!message) throw new RangeError(`Unknown report "${command.reportId}".`);
      message.prioritized = true;
      if (message.verificationState === "pending") message.verificationDueAtMs = Math.min(durationMs, state.elapsedMs + 100);
      recordInterventionCost(command, `Player prioritized verification for report ${message.authoredReportId}.`);
    }
    metrics.attentionSpent += attentionCost;
    updateBacklog();
    return snapshot();
  };

  return { refreshDecisions, processCrossCheckAndReplan, recordInterventionCost, intervene };
}
