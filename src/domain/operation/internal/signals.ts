import type { CampaignOfficer, CampaignOfficerReport } from "../../../campaign/types";
import type {
  HarnessConfiguration,
  HarnessConsequence,
  OfficerBeliefSnapshot,
  VerificationState,
} from "../../../simulation/simulationTypes";
import type {
  AppendReplay,
  MutableMessage,
  MutableMetrics,
  MutableOfficer,
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

type SignalContext = {
  roster: readonly CampaignOfficer[];
  harness: HarnessConfiguration;
  consequences: readonly HarnessConsequence[];
  durationMs: number;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  messages: MutableMessage[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  selectAlternative: SelectAlternative;
};

export function createSignals(context: SignalContext) {
  const { roster, harness, consequences, durationMs, state, officers, messages, metrics, appendReplay, selectAlternative } = context;

  const updateBacklog = (): void => {
    metrics.signalBacklog = messages.filter(
      (message) => message.deliveryState === "queued" || message.verificationState === "pending",
    ).length;
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

  const updateBeliefVerification = (message: MutableMessage): void => {
    officers.forEach((officer) => {
      const belief = perceive({
        observation: { observedAtMs: state.elapsedMs, facts: [] },
        receivedReports: [],
        profile: officer.profile,
        memory: officer.memory,
        nowMs: state.elapsedMs,
      }).beliefs.find(({ subjectId }) => subjectId === message.authoredReportId);
      if (belief) addBelief(officer, { ...belief, verificationState: message.verificationState, reliability: message.reliability });
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
              assertion: message.text,
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

  return { addBelief, recipientIdsFor, queueReport, updateBeliefVerification, processMessages, updateBacklog };
}
