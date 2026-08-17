import type {
  CampaignEncounterBeat,
  CampaignOfficer,
  CampaignOfficerReport,
  CampaignScene,
  CampaignThreat,
  OfficerDisposition,
  ThreatLane,
} from "../campaign/types";
import { createSeededRandom, type RandomSeed } from "./seededRandom";
import {
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type HarnessConsequence,
  type OfficerBeliefSnapshot,
  type OfficerIntent,
  type OfficerSimulationSnapshot,
  type OperationIntervention,
  type OperationMessageSnapshot,
  type OperationMetricsSnapshot,
  type OperationObjectiveSnapshot,
  type OperationReplayEntry,
  type OperationReplayKind,
  type OperationSimulation,
  type OperationSnapshot,
  type OperationStatus,
  type OperationThreatSnapshot,
  type OperationUnitSnapshot,
  type ReplayDataValue,
  type VerificationState,
} from "./simulationTypes";
import { projectOperationReplay, type OperationEvent } from "../domain/operation/operationEvent";
import { confidenceFor as engineConfidenceFor, intentAlternatives as engineIntentAlternatives } from "../domain/operation/internal/decisions";
import { orderBeats, dueBeats } from "../domain/operation/internal/timeline";
import { deliveryDelay as signalDeliveryDelay, verificationDelay as signalVerificationDelay, reportReliability } from "../domain/operation/internal/signals";
import { isThreatBlocked, threatDamage } from "../domain/operation/internal/threats";
import { operationSucceeded } from "../domain/operation/internal/outcome";

type MutableOfficer = {
  id: string;
  disposition: OfficerDisposition;
  intent: OfficerIntent;
  confidence: number;
  beliefs: OfficerBeliefSnapshot[];
  pendingDecision: {
    intent: OfficerIntent;
    reason: string;
    dueAtMs: number;
  } | null;
  authorized: boolean;
};

type MutableMessage = {
  id: string;
  authoredReportId: string;
  sourceOfficerId: string;
  recipientOfficerIds: string[];
  createdAtMs: number;
  deliveryAtMs: number;
  verificationDueAtMs: number | null;
  reliability: number;
  verificationState: VerificationState;
  deliveryState: "queued" | "delivered";
  text: string;
  prioritized: boolean;
};

type MutableThreat = Omit<OperationThreatSnapshot, "state" | "result"> & {
  state: "telegraphed" | "resolved";
  result: "blocked" | "damaged-objective" | null;
};

type MutableObjective = {
  id: string;
  required: boolean;
  progress: number;
  completed: boolean;
};

type MutableUnit = {
  officerId: string;
  lane: ThreatLane;
  position: number;
  route: ThreatLane[];
  intent: OfficerIntent;
  health: number;
  objectiveId: string | null;
};

type MutableMetrics = {
  objectiveProgress: number;
  civilianSafety: number;
  logistics: number;
  organizationTrust: number;
  signalBacklog: number;
  interventionCount: number;
  autonomyScore: number;
};

const lanes: readonly ThreatLane[] = ["north", "center", "south", "command"];
function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function assertHarness(harness: HarnessConfiguration): void {
  const fields = [
    "informationReach",
    "authorityClarity",
    "verificationDepth",
    "feedbackCompression",
  ] as const;

  fields.forEach((field) => {
    const value = harness[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`Harness ${field} must be between zero and one.`);
    }
  });
}

function assertSceneAndRoster(
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
): void {
  if (scene.identity.kind === "epilogue") {
    throw new RangeError("Operation simulation requires a playable scene.");
  }
  if (
    !Number.isSafeInteger(scene.encounterParameters.durationMs) ||
    scene.encounterParameters.durationMs <= 0
  ) {
    throw new RangeError("A playable scene must have a positive safe duration.");
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    throw new RangeError("Operation simulation requires at least one officer.");
  }

  const officerIds = new Set<string>();
  roster.forEach((officer) => {
    if (officerIds.has(officer.id)) {
      throw new RangeError(`Duplicate officer identifier "${officer.id}".`);
    }
    officerIds.add(officer.id);
  });

  scene.beats.forEach((beat) => {
    if (
      !Number.isSafeInteger(beat.timeMs) ||
      beat.timeMs < 0 ||
      beat.timeMs > scene.encounterParameters.durationMs
    ) {
      throw new RangeError(`Beat "${beat.id}" has an invalid activation time.`);
    }
    beat.reports.forEach((report) => {
      if (!officerIds.has(report.officerId)) {
        throw new RangeError(
          `Report "${report.id}" references an officer outside the roster.`,
        );
      }
    });
    beat.threats.forEach((threat) => {
      if (
        !Number.isSafeInteger(threat.telegraphDurationMs) ||
        threat.telegraphDurationMs <= 0 ||
        threat.telegraphDurationMs >
          scene.encounterParameters.durationMs - beat.timeMs
      ) {
        throw new RangeError(
          `Threat "${threat.id}" cannot complete its telegraph before the operation ends.`,
        );
      }
    });
  });

  const retry = scene.transitions.some(({ outcomeId }) => outcomeId === "retry");
  const success = scene.transitions.some(({ outcomeId }) => outcomeId !== "retry");
  if (!retry || !success) {
    throw new RangeError(
      "A playable scene must declare retry and non-retry outcomes.",
    );
  }
}

function detectConsequences(
  harness: HarnessConfiguration,
): HarnessConsequence[] {
  const consequences: HarnessConsequence[] = [];
  if (harness.informationReach > 0.82) {
    consequences.push("information-saturation");
  }
  if (harness.authorityClarity < 0.35) {
    consequences.push("ambiguous-authority");
  }
  if (harness.verificationDepth > 0.82) {
    consequences.push("verification-congestion");
  }
  if (harness.feedbackCompression < 0.35) {
    consequences.push("noisy-feedback");
  }
  if (harness.authorityClarity > 0.88) {
    consequences.push("over-centralization");
  }
  return consequences;
}

function harnessReadiness(
  harness: HarnessConfiguration,
  consequences: readonly HarnessConsequence[],
): number {
  const capacityUsed =
    harness.informationReach +
    harness.authorityClarity +
    harness.verificationDepth +
    harness.feedbackCompression;
  const overloadPenalty = Math.max(0, capacityUsed - 3) * 0.12;
  const consequencePenalty = consequences.reduce((penalty, consequence) => {
    if (consequence === "ambiguous-authority") return penalty + 0.12;
    if (consequence === "information-saturation") return penalty + 0.08;
    if (consequence === "verification-congestion") return penalty + 0.1;
    if (consequence === "noisy-feedback") return penalty + 0.1;
    return penalty + 0.08;
  }, 0);

  return clamp(
    harness.informationReach * 0.25 +
      harness.authorityClarity * 0.25 +
      harness.verificationDepth * 0.25 +
      harness.feedbackCompression * 0.18 -
      overloadPenalty -
      consequencePenalty,
  );
}

export function createOperationSimulation(
  suppliedScene: CampaignScene,
  suppliedRoster: readonly CampaignOfficer[],
  runSeed: RandomSeed,
  suppliedHarness: HarnessConfiguration,
): OperationSimulation {
  assertHarness(suppliedHarness);
  assertSceneAndRoster(suppliedScene, suppliedRoster);

  const scene = clone(suppliedScene);
  const roster = clone(suppliedRoster);
  const harness = clone(suppliedHarness);
  createSeededRandom(runSeed);
  const random = createSeededRandom(`${scene.identity.id}:${String(runSeed)}`);
  const durationMs = scene.encounterParameters.durationMs;
  const consequences = detectConsequences(harness);
  const readiness = harnessReadiness(harness, consequences);
  const orderedBeats = orderBeats(scene.beats);
  const compoundReplanRequired =
    new Set(scene.beats.flatMap((beat) => beat.threats.map(({ kind }) => kind)))
      .size >= 3 &&
    scene.beats.some((beat) =>
      beat.threats.some(({ kind }) => kind === "misinformation"),
    );

  let elapsedMs = 0;
  let accumulatedMs = 0;
  let status: OperationStatus = "running";
  let outcomeId: string | null = null;
  let nextBeatIndex = 0;
  let messageSequence = 0;
  let replaySequence = 0;
  let crossChecked = false;
  let authorityReassigned = false;
  let autonomousReplan = false;

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
    intent: engineIntentAlternatives(officer.disposition)[0],
    confidence: engineConfidenceFor(officer.disposition, harness),
    beliefs: [],
    pendingDecision: null,
    authorized:
      !compoundReplanRequired &&
      officer.disposition === "action" &&
      harness.authorityClarity >= 0.45 &&
      harness.authorityClarity <= 0.88,
  }));
  const units: MutableUnit[] = roster.map((officer, index) => ({
    officerId: officer.id,
    lane: lanes[index % lanes.length] as ThreatLane,
    position: 0,
    route: [lanes[index % lanes.length] as ThreatLane],
    intent: engineIntentAlternatives(officer.disposition)[0],
    health: 100,
    objectiveId: objectives[index % Math.max(1, objectives.length)]?.id ?? null,
  }));
  const metrics: MutableMetrics = {
    objectiveProgress: 0,
    civilianSafety: 100,
    logistics: 100,
    organizationTrust: 100,
    signalBacklog: 0,
    interventionCount: 0,
    autonomyScore: 100,
  };

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
    const { description: _legacyDescription, ...projectedEvent } = projected;
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
    reason: string,
    alternatives: readonly Value[],
    timeMs: number,
  ): Value => {
    const selected = alternatives[random.integer(alternatives.length)] as Value;
    appendReplay("random-choice", timeMs, `Random choice for ${reason}: ${selected}.`, {
      reason,
      selected,
      alternatives,
    });
    return selected;
  };

  const updateBacklog = (): void => {
    metrics.signalBacklog = messages.filter(
      (message) =>
        message.deliveryState === "queued" ||
        message.verificationState === "pending",
    ).length;
  };

  const addBelief = (officer: MutableOfficer, belief: OfficerBeliefSnapshot): void => {
    const existingIndex = officer.beliefs.findIndex(
      ({ subjectId }) => subjectId === belief.subjectId,
    );
    if (existingIndex >= 0) {
      officer.beliefs[existingIndex] = clone(belief);
    } else {
      officer.beliefs.push(clone(belief));
    }
  };

  const refreshDecisions = (reason: string, timeMs: number): void => {
    officers.forEach((officer) => {
      const alternatives = engineIntentAlternatives(officer.disposition);
      let intent = selectAlternative(
        `${officer.id} ${officer.disposition} disposition`,
        alternatives,
        timeMs,
      );

      if (
        officer.disposition === "action" &&
        harness.authorityClarity < 0.35 &&
        intent !== "secure-objective"
      ) {
        intent = "secure-objective";
      }
      if (
        officer.disposition === "verification" &&
        harness.verificationDepth >= 0.55 &&
        messages.some(({ verificationState }) => verificationState === "pending")
      ) {
        intent = "cross-check-report";
      }
      if (
        officer.disposition === "communication" &&
        metrics.signalBacklog > roster.length
      ) {
        intent = "compress-feedback";
      }

      officer.intent = intent;
      officer.pendingDecision = {
        intent,
        reason,
        dueAtMs: Math.min(durationMs, timeMs + 2_000),
      };
      const unit = units.find(({ officerId }) => officerId === officer.id);
      if (unit) unit.intent = intent;
      appendReplay("decision", timeMs, `${officer.id} chose ${intent}: ${reason}.`, {
        officerId: officer.id,
        disposition: officer.disposition,
        intent,
        confidence: officer.confidence,
      });
    });
  };

  const recipientIdsFor = (sourceOfficerId: string, timeMs: number): string[] => {
    const available = roster
      .map(({ id }) => id)
      .filter((id) => id !== sourceOfficerId)
      .sort();
    const recipientCount =
      harness.informationReach < 0.2
        ? 0
        : Math.min(
            available.length,
            Math.max(1, Math.round(available.length * harness.informationReach)),
          );
    const selected: string[] = [];

    while (selected.length < recipientCount && available.length > 0) {
      const recipient = selectAlternative(
        `recipient fan-out from ${sourceOfficerId}`,
        available,
        timeMs,
      );
      selected.push(recipient);
      available.splice(available.indexOf(recipient), 1);
    }
    return selected;
  };

  const queueReport = (report: CampaignOfficerReport, timeMs: number): void => {
    const recipients = recipientIdsFor(report.officerId, timeMs);
    const queuedBefore = messages.filter(
      ({ deliveryState }) => deliveryState === "queued",
    ).length;
    const deliveryDelayMs = signalDeliveryDelay(harness, queuedBefore);
    const reliability = reportReliability(
      harness,
      officers.find(({ id }) => id === report.officerId)?.disposition === "verification",
      consequences.includes("information-saturation"),
    );
    const verificationState: VerificationState =
      harness.verificationDepth >= 0.35 ? "pending" : "unverified";
    const deliveryAtMs = Math.min(durationMs, timeMs + deliveryDelayMs);
    const verificationDelayMs = signalVerificationDelay(
      harness,
      queuedBefore,
      consequences.includes("verification-congestion"),
    );
    const message: MutableMessage = {
      id: report.id,
      authoredReportId: report.id,
      sourceOfficerId: report.officerId,
      recipientOfficerIds: recipients,
      createdAtMs: timeMs,
      deliveryAtMs,
      verificationDueAtMs:
        verificationState === "pending"
          ? Math.min(durationMs, deliveryAtMs + verificationDelayMs)
          : null,
      reliability,
      verificationState,
      deliveryState: "queued",
      text: report.text,
      prioritized: false,
    };
    messages.push(message);

    const source = officers.find(({ id }) => id === report.officerId);
    if (source) {
      addBelief(source, {
        subjectId: report.id,
        category: "report",
        assertion: report.text,
        sourceOfficerId: report.officerId,
        receivedAtMs: timeMs,
        reliability,
        verificationState,
      });
    }

    appendReplay("report-queued", timeMs, `Authored report ${report.id} entered the message queue.`, {
      reportId: report.id,
      sourceOfficerId: report.officerId,
      recipientOfficerIds: recipients,
      createdAtMs: timeMs,
      deliveryAtMs,
      reliability,
      verificationState,
    });
    updateBacklog();
  };

  const telegraphThreat = (threat: CampaignThreat, timeMs: number): void => {
    const objective = objectives[threats.length % Math.max(1, objectives.length)];
    const telegraphEndsAtMs = timeMs + threat.telegraphDurationMs;
    threats.push({
      id: threat.id,
      kind: threat.kind,
      lane: threat.lane,
      severity: threat.severity,
      target: objective?.id ?? threat.lane,
      telegraphedAtMs: timeMs,
      telegraphEndsAtMs,
      resolutionTimeMs: telegraphEndsAtMs,
      state: "telegraphed",
      result: null,
    });

    officers.forEach((officer) => {
      const unit = units.find(({ officerId }) => officerId === officer.id);
      const locallyVisible =
        unit?.lane === threat.lane ||
        (threat.lane === "command" && officer.disposition === "communication");
      if (locallyVisible) {
        addBelief(officer, {
          subjectId: threat.id,
          category: "threat",
          assertion: `${threat.kind} telegraphed in ${threat.lane}`,
          sourceOfficerId: null,
          receivedAtMs: timeMs,
          reliability: 1,
          verificationState: "verified",
        });
      }
    });

    appendReplay("threat-telegraphed", timeMs, `Threat ${threat.id} telegraphed before resolution.`, {
      threatId: threat.id,
      kind: threat.kind,
      lane: threat.lane,
      severity: threat.severity,
      target: objective?.id ?? threat.lane,
      telegraphEndsAtMs,
    });
  };

  const activateBeat = (beat: CampaignEncounterBeat): void => {
    appendReplay("beat-activated", beat.timeMs, `Authored beat ${beat.id} activated.`, {
      beatId: beat.id,
      authoredTimeMs: beat.timeMs,
    });
    beat.reports.forEach((report) => queueReport(report, beat.timeMs));
    beat.threats.forEach((threat) => telegraphThreat(threat, beat.timeMs));
    refreshDecisions(`beat ${beat.id} changed locally available information`, beat.timeMs);
  };

  const activateDueBeats = (): void => {
    const due = dueBeats(orderedBeats, nextBeatIndex, elapsedMs);
    due.beats.forEach(activateBeat);
    nextBeatIndex = due.nextIndex;
  };

  const updateBeliefVerification = (message: MutableMessage): void => {
    officers.forEach((officer) => {
      const belief = officer.beliefs.find(
        ({ subjectId }) => subjectId === message.authoredReportId,
      );
      if (belief) {
        addBelief(officer, {
          ...belief,
          verificationState: message.verificationState,
          reliability: message.reliability,
        });
      }
    });
  };

  const processMessages = (): void => {
    messages.forEach((message) => {
      if (
        message.deliveryState === "queued" &&
        message.deliveryAtMs <= elapsedMs
      ) {
        message.deliveryState = "delivered";
        message.recipientOfficerIds.forEach((recipientId) => {
          const recipient = officers.find(({ id }) => id === recipientId);
          if (recipient) {
            addBelief(recipient, {
              subjectId: message.authoredReportId,
              category: "report",
              assertion: message.text,
              sourceOfficerId: message.sourceOfficerId,
              receivedAtMs: message.deliveryAtMs,
              reliability: message.reliability,
              verificationState: message.verificationState,
            });
            recipient.confidence = rounded(
              clamp(
                recipient.confidence +
                  harness.feedbackCompression * 0.03 -
                  (1 - harness.feedbackCompression) * 0.02,
              ),
            );
          }
        });
        appendReplay(
          "report-delivered",
          message.deliveryAtMs,
          `Report ${message.authoredReportId} delivered without rewriting authored copy.`,
          {
            reportId: message.authoredReportId,
            sourceOfficerId: message.sourceOfficerId,
            recipientOfficerIds: message.recipientOfficerIds,
          },
        );
      }

      if (
        message.deliveryState === "delivered" &&
        message.verificationState === "pending" &&
        message.verificationDueAtMs !== null &&
        message.verificationDueAtMs <= elapsedMs
      ) {
        message.verificationState =
          message.reliability >= 0.6 ? "verified" : "contradicted";
        updateBeliefVerification(message);
        appendReplay(
          "report-verified",
          message.verificationDueAtMs,
          `Report ${message.authoredReportId} was ${message.verificationState}.`,
          {
            reportId: message.authoredReportId,
            verificationState: message.verificationState,
            reliability: message.reliability,
            prioritized: message.prioritized,
          },
        );
      }
    });
    updateBacklog();
  };

  const processCrossCheckAndReplan = (): void => {
    const misinformationExists = threats.some(
      ({ kind }) => kind === "misinformation",
    );
    const verifiedMessages = messages.filter(
      ({ verificationState }) => verificationState === "verified",
    );
    const verifiedSources = new Set(
      verifiedMessages.map(({ sourceOfficerId }) => sourceOfficerId),
    );

    if (
      !crossChecked &&
      misinformationExists &&
      verifiedSources.size >= 2 &&
      harness.informationReach >= 0.5 &&
      harness.verificationDepth >= 0.5
    ) {
      crossChecked = true;
      const sources = [...verifiedSources].sort();
      const reportIds = verifiedMessages
        .map(({ authoredReportId }) => authoredReportId)
        .sort();
      appendReplay(
        "cross-check",
        elapsedMs,
        `Contradictory sources cross-checked: ${sources.join(", ")}.`,
        { sourceOfficerIds: sources, reportIds },
      );
    }

    if (
      crossChecked &&
      !authorityReassigned &&
      harness.authorityClarity >= 0.45 &&
      harness.authorityClarity <= 0.88
    ) {
      const actionOfficer = officers.find(
        ({ disposition }) => disposition === "action",
      );
      if (actionOfficer && !actionOfficer.authorized) {
        const previousAuthorized = actionOfficer.authorized;
        authorityReassigned = true;
        actionOfficer.authorized = true;
        appendReplay(
          "authority-reassigned",
          elapsedMs,
          `Authority reassigned to ${actionOfficer.id} for the verified local threat.`,
          {
            officerId: actionOfficer.id,
            previousAuthorized,
            newAuthorized: actionOfficer.authorized,
          },
        );
      }
    }

    if (
      compoundReplanRequired &&
      crossChecked &&
      authorityReassigned &&
      !autonomousReplan &&
      metrics.interventionCount === 0 &&
      harness.feedbackCompression >= 0.5
    ) {
      autonomousReplan = true;
      appendReplay(
        "autonomous-replan",
        elapsedMs,
        "Officers autonomously replanned from cross-checked evidence and reassigned authority.",
        {
          interventionCount: metrics.interventionCount,
          crossChecked,
          authorityReassigned,
        },
      );
    }
  };

  const resolveThreat = (threat: MutableThreat): void => {
    const dispositionSupport = officers.some(
      ({ disposition, authorized }) => disposition === "action" && authorized,
    )
      ? 0.07
      : 0;
    const crossCheckSupport =
      threat.kind === "misinformation" && crossChecked ? 0.22 : 0;
    const replanSupport = autonomousReplan ? 0.12 : 0;
    const defense = readiness + dispositionSupport + crossCheckSupport + replanSupport;
    const blocked = isThreatBlocked(defense, threat.severity);

    threat.state = "resolved";
    threat.result = blocked ? "blocked" : "damaged-objective";
    if (blocked) {
      const objective = objectives.find(({ id }) => id === threat.target);
      if (objective) objective.progress = clamp(objective.progress + 0.12);
      metrics.organizationTrust = clamp(metrics.organizationTrust + 1, 0, 100);
    } else {
      const damage = threatDamage(threat.severity);
      const objective = objectives.find(({ id }) => id === threat.target);
      if (objective) objective.progress = clamp(objective.progress - 0.18);
      metrics.civilianSafety = clamp(metrics.civilianSafety - damage, 0, 100);
      metrics.logistics = clamp(metrics.logistics - Math.ceil(damage * 0.7), 0, 100);
      metrics.organizationTrust = clamp(
        metrics.organizationTrust - Math.ceil(damage * 0.6),
        0,
        100,
      );
      const unit = units.find(({ lane }) => lane === threat.lane);
      if (unit) unit.health = clamp(unit.health - damage, 0, 100);
    }

    appendReplay(
      "threat-resolved",
      threat.resolutionTimeMs,
      `Threat ${threat.id} ${blocked ? "was blocked" : "damaged its objective"} after its telegraph ended.`,
      {
        threatId: threat.id,
        result: threat.result,
        target: threat.target,
        telegraphEndsAtMs: threat.telegraphEndsAtMs,
        resolutionTimeMs: threat.resolutionTimeMs,
        defense: rounded(defense),
      },
    );
  };

  const processThreats = (): void => {
    threats.forEach((threat) => {
      if (
        threat.state === "telegraphed" &&
        threat.resolutionTimeMs <= elapsedMs
      ) {
        resolveThreat(threat);
      }
    });
  };

  const updateProgress = (stepMs: number): void => {
    const progressIncrement = (stepMs / durationMs) * readiness * 1.25;
    objectives.forEach((objective) => {
      objective.progress = clamp(objective.progress + progressIncrement);
    });
    units.forEach((unit) => {
      const officer = officers.find(({ id }) => id === unit.officerId);
      const movementFactor = officer?.disposition === "action" ? 1.2 : 0.75;
      unit.position = rounded(
        clamp(unit.position + (stepMs / durationMs) * movementFactor),
      );
    });
    metrics.objectiveProgress = rounded(
      objectives.reduce((total, objective) => total + objective.progress, 0) /
        Math.max(1, objectives.length),
    );
  };

  const finishOperation = (): void => {
    const blockedThreats = threats.filter(({ result }) => result === "blocked").length;
    const blockedRatio = blockedThreats / Math.max(1, threats.length);
    const requiredReplanSatisfied =
      !compoundReplanRequired ||
      (autonomousReplan && metrics.interventionCount === 0);
    const succeeded = operationSucceeded(
      readiness,
      blockedRatio,
      metrics.civilianSafety,
      metrics.logistics,
      requiredReplanSatisfied,
    );

    const transition = succeeded
      ? scene.transitions.find(({ outcomeId }) => outcomeId !== "retry")
      : scene.transitions.find(({ outcomeId }) => outcomeId === "retry");
    if (!transition) {
      throw new Error("The authored scene does not declare the computed outcome.");
    }

    status = succeeded ? "success" : "retry";
    outcomeId = transition.outcomeId;
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
      objectives.reduce((total, objective) => total + objective.progress, 0) /
        Math.max(1, objectives.length),
    );
    appendReplay("outcome", durationMs, `Operation ended with declared outcome ${outcomeId}.`, {
      outcomeId,
      status,
      blockedThreats,
      threatCount: threats.length,
      readiness: rounded(readiness),
      autonomousReplan,
      interventionCount: metrics.interventionCount,
    });
  };

  const step = (stepMs: number): void => {
    elapsedMs += stepMs;
    activateDueBeats();
    processMessages();
    processCrossCheckAndReplan();
    processThreats();
    updateProgress(stepMs);
    if (elapsedMs === durationMs) finishOperation();
  };

  const officerSnapshots = (): OfficerSimulationSnapshot[] =>
    officers.map((officer) => ({
      id: officer.id,
      disposition: officer.disposition,
      intent: officer.intent,
      confidence: officer.confidence,
      currentBelief: officer.beliefs.at(-1) ?? null,
      beliefs: officer.beliefs,
      pendingDecision: status === "running" ? officer.pendingDecision : null,
      authorized: officer.authorized,
    }));

  const messageSnapshots = (): OperationMessageSnapshot[] =>
    messages.map(({ verificationDueAtMs: _verificationDueAtMs, ...message }) =>
      clone(message),
    );

  const objectiveSnapshots = (): OperationObjectiveSnapshot[] =>
    objectives.map((objective) => ({ ...objective }));

  const unitSnapshots = (): OperationUnitSnapshot[] =>
    units.map((unit) => ({ ...unit, route: [...unit.route] }));

  const metricsSnapshot = (): OperationMetricsSnapshot => ({ ...metrics });

  const snapshot = (): OperationSnapshot =>
    clone({
      sceneId: scene.identity.id,
      elapsedMs,
      durationMs,
      fixedStepMs: OPERATION_FIXED_STEP_MS,
      status,
      outcomeId,
      harness,
      officers: officerSnapshots(),
      messages: messageSnapshots(),
      threats,
      units: unitSnapshots(),
      objectives: objectiveSnapshots(),
      metrics: metricsSnapshot(),
      consequences,
    });

  const replay = (): readonly OperationReplayEntry[] => clone(replayEntries);
  const events = (): readonly OperationEvent[] => clone(operationEvents);

  const advance = (advanceMs: number): OperationSnapshot => {
    if (!Number.isSafeInteger(advanceMs) || advanceMs < 0) {
      throw new RangeError(
        "Operation advances must be non-negative safe integer milliseconds.",
      );
    }
    if (status !== "running") return snapshot();
    if (!Number.isSafeInteger(accumulatedMs + advanceMs)) {
      throw new RangeError("Operation accumulated time must remain a safe integer.");
    }

    accumulatedMs += advanceMs;
    while (status === "running") {
      const remainingDuration = durationMs - elapsedMs;
      const nextStepMs = Math.min(OPERATION_FIXED_STEP_MS, remainingDuration);
      if (accumulatedMs < nextStepMs) break;
      accumulatedMs -= nextStepMs;
      step(nextStepMs);
    }
    return snapshot();
  };

  const recordInterventionCost = (
    command: OperationIntervention,
    description: string,
  ): void => {
    metrics.interventionCount += 1;
    metrics.autonomyScore = clamp(metrics.autonomyScore - 15, 0, 100);
    metrics.logistics = clamp(metrics.logistics - 2, 0, 100);
    appendReplay("intervention", elapsedMs, description, {
      command: command.kind,
      autonomyCost: 15,
      logisticsCost: 2,
      interventionCount: metrics.interventionCount,
    });
  };

  const intervene = (suppliedCommand: OperationIntervention): OperationSnapshot => {
    if (status !== "running") return snapshot();
    if (metrics.interventionCount >= scene.gameplayTuning.interventionBudget) {
      throw new RangeError("The authored intervention budget is exhausted.");
    }
    const command = clone(suppliedCommand);

    if (command.kind === "route-report") {
      const source = messages.find(
        ({ id, authoredReportId }) =>
          id === command.reportId || authoredReportId === command.reportId,
      );
      if (!source) throw new RangeError(`Unknown report "${command.reportId}".`);
      if (!officers.some(({ id }) => id === command.recipientOfficerId)) {
        throw new RangeError(`Unknown officer "${command.recipientOfficerId}".`);
      }
      messageSequence += 1;
      messages.push({
        ...clone(source),
        id: `intervention-route-${source.authoredReportId}-${messageSequence}`,
        recipientOfficerIds: [command.recipientOfficerId],
        createdAtMs: elapsedMs,
        deliveryAtMs: Math.min(durationMs, elapsedMs + 300),
        verificationDueAtMs:
          source.verificationState === "pending"
            ? Math.min(durationMs, elapsedMs + 600)
            : null,
        deliveryState: "queued",
      });
      recordInterventionCost(
        command,
        `Player routed report ${source.authoredReportId} to ${command.recipientOfficerId}.`,
      );
    } else if (command.kind === "authorize-officer") {
      const officer = officers.find(({ id }) => id === command.officerId);
      if (!officer) throw new RangeError(`Unknown officer "${command.officerId}".`);
      officer.authorized = true;
      recordInterventionCost(command, `Player authorized officer ${command.officerId}.`);
    } else {
      const message = messages.find(
        ({ id, authoredReportId }) =>
          id === command.reportId || authoredReportId === command.reportId,
      );
      if (!message) throw new RangeError(`Unknown report "${command.reportId}".`);
      message.prioritized = true;
      if (message.verificationState === "pending") {
        message.verificationDueAtMs = Math.min(durationMs, elapsedMs + 100);
      }
      recordInterventionCost(
        command,
        `Player prioritized verification for report ${message.authoredReportId}.`,
      );
    }

    updateBacklog();
    return snapshot();
  };

  appendReplay("operation-started", 0, `Operation ${scene.identity.id} started.`, {
    sceneId: scene.identity.id,
    durationMs,
    fixedStepMs: OPERATION_FIXED_STEP_MS,
    readiness: rounded(readiness),
  });
  consequences.forEach((consequence) => {
    appendReplay(
      "harness-consequence",
      0,
      `Harness consequence detected: ${consequence}.`,
      { consequence },
    );
  });
  activateDueBeats();
  if (nextBeatIndex === 0 || orderedBeats[0]?.timeMs !== 0) {
    refreshDecisions("operation start", 0);
  }

  return { snapshot, replay, events, advance, intervene };
}
