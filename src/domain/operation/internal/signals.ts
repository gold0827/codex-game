import type { CampaignOfficer, CampaignOfficerReport, CampaignTilePosition } from "../../../campaign/types";
import type {
  HarnessConfiguration,
  HarnessConsequence,
  OfficerBeliefSnapshot,
  SpatialSignalKind,
  SpatialSignalStrength,
  VerificationState,
} from "../../../simulation/simulationTypes";
import type {
  AppendReplay,
  MutableMessage,
  MutableMetrics,
  MutableOfficer,
  MutableSpatialSignal,
  OperationRuntimeState,
  SelectAlternative,
} from "./operationTypes";
import { clamp, rounded } from "./operationTypes";
import { perceive } from "./agent/perception";

export function deliveryDelay(harness: HarnessConfiguration, queuedBefore: number): number {
  return Math.round(600 + harness.informationReach * 1_000 + (1 - harness.feedbackCompression) * 1_200 + queuedBefore * 120);
}
export function verificationDelay(harness: HarnessConfiguration, queuedBefore: number, congested: boolean): number {
  return Math.round(700 + harness.verificationDepth * 1_500 + (congested ? 3_000 : 0) + queuedBefore * 80);
}
export function reportReliability(harness: HarnessConfiguration, verificationOfficer: boolean, saturated: boolean): number {
  return Math.round(Math.min(1, Math.max(0, 0.52 + harness.feedbackCompression * 0.28 + (verificationOfficer ? 0.1 : 0) - (saturated ? 0.08 : 0))) * 10_000) / 10_000;
}

export function distortReport(text: string, reliability: number): string {
  return reliability < 0.6 ? `[불확실한 송신] ${text}` : text;
}

export function signalResponseScore(
  officer: Pick<MutableOfficer, "profile">,
  strength: SpatialSignalStrength,
): number {
  return rounded(
    strength / 3 * 0.65 + officer.profile.discipline * 0.2 + officer.profile.cooperation * 0.15,
  );
}

type SignalContext = {
  roster: readonly CampaignOfficer[];
  harness: HarnessConfiguration;
  consequences: readonly HarnessConsequence[];
  durationMs: number;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  messages: MutableMessage[];
  spatialSignals: MutableSpatialSignal[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  selectAlternative: SelectAlternative;
};

export function createSignals(context: SignalContext) {
  const {
    roster, harness, consequences, durationMs, state, officers, messages, spatialSignals,
    metrics, appendReplay, selectAlternative,
  } = context;
  const autonomousBroadcasts = new Set<string>();

  const updateBacklog = (): void => {
    const reportBacklog = messages.filter(
      (message) => message.deliveryState === "queued" || message.verificationState === "pending",
    ).length;
    const spatialBacklog = spatialSignals.filter((signal) =>
      signal.recipients.some(({ response }) => response === "in-transit" || response === "delayed")
    ).length;
    metrics.signalBacklog = reportBacklog + spatialBacklog;
  };

  const addBelief = (officer: MutableOfficer, belief: OfficerBeliefSnapshot): void => {
    const perception = perceive({
      observation: {
        observedAtMs: belief.receivedAtMs,
        facts: belief.origin === "direct"
          ? [{
              subjectId: belief.subjectId,
              category: belief.category,
              assertion: belief.assertion,
              confidence: belief.reliability,
              sourceOfficerId: belief.sourceOfficerId,
              verificationState: belief.verificationState,
              threatKind: belief.threatKind,
              threatSeverity: belief.threatSeverity,
            }]
          : [],
      },
      receivedReports: belief.origin === "received"
        ? [{
            reportId: belief.subjectId,
            subjectId: belief.subjectId,
            category: belief.category,
            assertion: belief.assertion,
            sourceOfficerId: belief.sourceOfficerId ?? officer.id,
            receivedAtMs: belief.receivedAtMs,
            reliability: belief.reliability,
            verificationState: belief.verificationState,
            threatKind: belief.threatKind,
            threatSeverity: belief.threatSeverity,
          }]
        : [],
      profile: officer.profile,
      memory: officer.memory,
      nowMs: state.elapsedMs,
    });
    officer.memory = perception.memory;
  };

  const recipientIdsFor = (sourceOfficerId: string, timeMs: number): string[] => {
    const available = roster.map(({ id }) => id).filter((id) => id !== sourceOfficerId).sort();
    const recipientCount = harness.informationReach < 0.2
      ? 0
      : Math.min(available.length, Math.max(1, Math.round(available.length * harness.informationReach)));
    const selected: string[] = [];
    while (selected.length < recipientCount && available.length > 0) {
      const recipient = selectAlternative(`recipient fan-out from ${sourceOfficerId}`, available, timeMs);
      selected.push(recipient);
      available.splice(available.indexOf(recipient), 1);
    }
    return selected;
  };

  const queueReport = (report: CampaignOfficerReport, timeMs: number): void => {
    const recipients = recipientIdsFor(report.officerId, timeMs);
    const queuedBefore = messages.filter(({ deliveryState }) => deliveryState === "queued").length;
    const deliveryDelayMs = deliveryDelay(harness, queuedBefore);
    const reliability = reportReliability(
      harness,
      officers.find(({ id }) => id === report.officerId)?.disposition === "verification",
      consequences.includes("information-saturation"),
    );
    const verificationState: VerificationState = harness.verificationDepth >= 0.35 ? "pending" : "unverified";
    const deliveryAtMs = Math.min(durationMs, timeMs + deliveryDelayMs);
    const verificationDelayMs = verificationDelay(
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
      verificationDueAtMs: verificationState === "pending" ? Math.min(durationMs, deliveryAtMs + verificationDelayMs) : null,
      reliability,
      verificationState,
      deliveryState: "queued",
      text: report.text,
      receivedText: distortReport(report.text, reliability),
      prioritized: false,
    };
    messages.push(message);
    const source = officers.find(({ id }) => id === report.officerId);
    if (source) {
      addBelief(source, {
        subjectId: report.id,
        category: "report",
        assertion: report.text,
        origin: "direct",
        sourceOfficerId: report.officerId,
        receivedAtMs: timeMs,
        reliability,
        confidence: reliability,
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

  const broadcastBelief = (sourceOfficerId: string, subjectId: string, timeMs: number): void => {
    const source = officers.find(({ id }) => id === sourceOfficerId);
    const belief = source?.memory.entries.find((entry) => entry.subjectId === subjectId);
    if (!source || !belief) return;
    const recipients = recipientIdsFor(sourceOfficerId, timeMs);
    const reached: string[] = [];
    recipients.forEach((recipientId) => {
      const broadcastId = `${sourceOfficerId}:${subjectId}:${recipientId}`;
      if (autonomousBroadcasts.has(broadcastId)) return;
      const recipient = officers.find(({ id }) => id === recipientId);
      if (!recipient) return;
      autonomousBroadcasts.add(broadcastId);
      reached.push(recipientId);
      const reliability = rounded(clamp(
        belief.reliability *
          (0.55 + harness.feedbackCompression * 0.3 + source.profile.cooperation * 0.15),
      ));
      addBelief(recipient, {
        subjectId: belief.subjectId,
        category: belief.category,
        assertion: belief.assertion,
        origin: "received",
        sourceOfficerId,
        receivedAtMs: timeMs,
        reliability,
        confidence: reliability,
        verificationState: belief.verificationState,
        threatKind: belief.threatKind,
        threatSeverity: belief.threatSeverity,
      });
    });
    if (reached.length > 0) {
      appendReplay("report-delivered", timeMs, `${sourceOfficerId} autonomously broadcast ${subjectId}.`, {
        reportId: subjectId,
        sourceOfficerId,
        recipientOfficerIds: reached,
        autonomous: true,
      });
    }
  };

  const updateSourceTrust = (officer: MutableOfficer, sourceOfficerId: string, verified: boolean): void => {
    const current = officer.profile.sourceTrust.find(({ officerId }) => officerId === sourceOfficerId)?.trust ??
      clamp(0.45 + officer.profile.cooperation * 0.35 - officer.profile.caution * 0.15);
    const trust = rounded(clamp(current + (verified ? 0.08 : -0.18)));
    officer.profile = {
      ...officer.profile,
      sourceTrust: [
        ...officer.profile.sourceTrust.filter(({ officerId }) => officerId !== sourceOfficerId),
        { officerId: sourceOfficerId, trust },
      ].sort((left, right) => left.officerId.localeCompare(right.officerId)),
    };
  };

  const updateBeliefVerification = (message: MutableMessage): void => {
    officers.forEach((officer) => {
      const belief = perceive({
        observation: { observedAtMs: state.elapsedMs, facts: [] },
        receivedReports: [],
        profile: officer.profile,
        memory: officer.memory,
        nowMs: state.elapsedMs,
      }).beliefs.find(({ subjectId }) => subjectId === message.authoredReportId);
      if (!belief) return;
      const verified = message.verificationState === "verified";
      if (belief.origin === "received") updateSourceTrust(officer, message.sourceOfficerId, verified);
      addBelief(officer, {
        ...belief,
        assertion: verified ? message.text : message.receivedText,
        verificationState: message.verificationState,
        reliability: verified ? message.reliability : Math.min(message.reliability, 0.25),
      });
    });
  };

  const processMessages = (): void => {
    messages.forEach((message) => {
      if (message.deliveryState === "queued" && message.deliveryAtMs <= state.elapsedMs) {
        message.deliveryState = "delivered";
        message.recipientOfficerIds.forEach((recipientId) => {
          const recipient = officers.find(({ id }) => id === recipientId);
          if (recipient) {
            addBelief(recipient, {
              subjectId: message.authoredReportId,
              category: "report",
              assertion: message.receivedText,
              origin: "received",
              sourceOfficerId: message.sourceOfficerId,
              receivedAtMs: message.deliveryAtMs,
              reliability: message.reliability,
              confidence: message.reliability,
              verificationState: message.verificationState,
            });
            recipient.confidence = rounded(clamp(
              recipient.confidence + harness.feedbackCompression * 0.03 - (1 - harness.feedbackCompression) * 0.02,
            ));
          }
        });
        appendReplay("report-delivered", message.deliveryAtMs, `Report ${message.authoredReportId} delivered without rewriting authored copy.`, {
          reportId: message.authoredReportId,
          sourceOfficerId: message.sourceOfficerId,
          recipientOfficerIds: message.recipientOfficerIds,
        });
      }
      if (
        message.deliveryState === "delivered" && message.verificationState === "pending" &&
        message.verificationDueAtMs !== null && message.verificationDueAtMs <= state.elapsedMs
      ) {
        message.verificationState = message.reliability >= 0.6 ? "verified" : "contradicted";
        updateBeliefVerification(message);
        appendReplay("report-verified", message.verificationDueAtMs, `Report ${message.authoredReportId} was ${message.verificationState}.`, {
          reportId: message.authoredReportId,
          verificationState: message.verificationState,
          reliability: message.reliability,
          prioritized: message.prioritized,
        });
      }
    });
    updateBacklog();
  };

  const issueSpatialSignal = (
    signal: SpatialSignalKind,
    strength: SpatialSignalStrength,
    position: CampaignTilePosition,
    actorPositions: ReadonlyMap<string, CampaignTilePosition>,
  ): MutableSpatialSignal => {
    state.signalSequence += 1;
    const issuedAtMs = state.elapsedMs;
    const recipients = officers.map((officer) => {
      const actorPosition = actorPositions.get(officer.id);
      if (!actorPosition) throw new Error(`Missing spatial actor "${officer.id}".`);
      const distance = Math.abs(actorPosition.x - position.x) + Math.abs(actorPosition.y - position.y);
      const deliveryAtMs = Math.min(
        durationMs,
        issuedAtMs + 200 + distance * 100 + Math.round((1 - harness.informationReach) * 400),
      );
      const score = signalResponseScore(officer, strength);
      const reactionAtMs = score < 0.45
        ? deliveryAtMs
        : Math.min(durationMs, deliveryAtMs + (score < 0.7 ? Math.round(500 + (1 - officer.profile.initiative) * 1_500) : 0));
      return { officerId: officer.id, deliveryAtMs, reactionAtMs, response: "in-transit" as const };
    });
    const created: MutableSpatialSignal = {
      id: `player-signal-${state.signalSequence}`,
      kind: signal,
      strength,
      position: { ...position },
      issuedAtMs,
      recipients,
    };
    spatialSignals.push(created);
    updateBacklog();
    return created;
  };

  const receiveSpatialSignal = (
    signal: MutableSpatialSignal,
    recipient: MutableSpatialSignal["recipients"][number],
  ): void => {
    const officer = officers.find(({ id }) => id === recipient.officerId);
    if (!officer) return;
    addBelief(officer, {
      subjectId: signal.id,
      category: "signal",
      assertion: `${signal.kind}@${signal.position.x},${signal.position.y}`,
      origin: "received",
      sourceOfficerId: "player-command",
      receivedAtMs: recipient.reactionAtMs,
      reliability: signal.strength / 3,
      confidence: signal.strength / 3,
      verificationState: "verified",
    });
    appendReplay("decision", recipient.reactionAtMs, `${officer.id} reacted to ${signal.id}.`, {
      event: "signal-reacted",
      signalId: signal.id,
      officerId: officer.id,
      signal: signal.kind,
      strength: signal.strength,
    });
  };

  const processSpatialSignals = (): void => {
    spatialSignals.forEach((signal) => {
      signal.recipients.forEach((recipient) => {
        if (recipient.response === "in-transit" && recipient.deliveryAtMs <= state.elapsedMs) {
          const officer = officers.find(({ id }) => id === recipient.officerId);
          if (!officer) return;
          const score = signalResponseScore(officer, signal.strength);
          recipient.response = score < 0.45 ? "ignored" : score < 0.7 ? "delayed" : "accepted";
          appendReplay("decision", recipient.deliveryAtMs, `${officer.id} ${recipient.response} ${signal.id}.`, {
            event: "signal-delivered",
            signalId: signal.id,
            officerId: officer.id,
            response: recipient.response,
            reactionAtMs: recipient.reactionAtMs,
          });
          if (recipient.response === "accepted") receiveSpatialSignal(signal, recipient);
        }
        if (recipient.response === "delayed" && recipient.reactionAtMs <= state.elapsedMs) {
          recipient.response = "accepted";
          receiveSpatialSignal(signal, recipient);
        }
      });
    });
    updateBacklog();
  };

  return {
    addBelief, recipientIdsFor, queueReport, broadcastBelief, updateBeliefVerification, processMessages,
    issueSpatialSignal, processSpatialSignals, updateBacklog,
  };
}
