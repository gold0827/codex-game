import type { CampaignOfficer, CampaignScene, OfficerDisposition } from "../../../campaign/types";
import type {
  HarnessConfiguration,
  OfficerIntent,
  OperationIntervention,
  OperationSnapshot,
} from "../../../simulation/simulationTypes";
import type {
  AppendReplay,
  MutableMessage,
  MutableMetrics,
  MutableOfficer,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
  SelectAlternative,
} from "./operationTypes";
import { clamp, clone } from "./operationTypes";

export function confidenceFor(disposition: OfficerDisposition, harness: HarnessConfiguration): number {
  const raw = disposition === "action"
    ? 0.35 + harness.authorityClarity * 0.55
    : disposition === "verification"
      ? 0.3 + harness.verificationDepth * 0.62
      : 0.25 + harness.informationReach * 0.32 + harness.feedbackCompression * 0.3;
  return Math.round(Math.min(1, Math.max(0, raw)) * 10_000) / 10_000;
}

export function intentAlternatives(disposition: OfficerDisposition): readonly OfficerIntent[] {
  if (disposition === "action") return ["advance-locally", "advance-locally", "engage-threat", "secure-objective"];
  if (disposition === "verification") return ["cross-check-report", "cross-check-report", "inspect-source", "hold-for-evidence"];
  return ["route-report", "route-report", "broadcast-update", "compress-feedback"];
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
  threats: MutableThreat[];
  units: MutableUnit[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  selectAlternative: SelectAlternative;
  updateBacklog: () => void;
  snapshot: () => OperationSnapshot;
};

export function createDecisions(context: DecisionContext) {
  const {
    scene, roster, harness, durationMs, compoundReplanRequired, state, officers, messages,
    threats, units, metrics, appendReplay, selectAlternative, updateBacklog, snapshot,
  } = context;

  const refreshDecisions = (reason: string, timeMs: number): void => {
    officers.forEach((officer) => {
      const alternatives = intentAlternatives(officer.disposition);
      let intent = selectAlternative(`${officer.id} ${officer.disposition} disposition`, alternatives, timeMs);
      if (officer.disposition === "action" && harness.authorityClarity < 0.35 && intent !== "secure-objective") intent = "secure-objective";
      if (
        officer.disposition === "verification" && harness.verificationDepth >= 0.55 &&
        messages.some(({ verificationState }) => verificationState === "pending")
      ) intent = "cross-check-report";
      if (officer.disposition === "communication" && metrics.signalBacklog > roster.length) intent = "compress-feedback";
      officer.intent = intent;
      officer.pendingDecision = { intent, reason, dueAtMs: Math.min(durationMs, timeMs + 2_000) };
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

  const processCrossCheckAndReplan = (): void => {
    const misinformationExists = threats.some(({ kind }) => kind === "misinformation");
    const verifiedMessages = messages.filter(({ verificationState }) => verificationState === "verified");
    const verifiedSources = new Set(verifiedMessages.map(({ sourceOfficerId }) => sourceOfficerId));
    if (
      !state.crossChecked && misinformationExists && verifiedSources.size >= 2 &&
      harness.informationReach >= 0.5 && harness.verificationDepth >= 0.5
    ) {
      state.crossChecked = true;
      const sources = [...verifiedSources].sort();
      const reportIds = verifiedMessages.map(({ authoredReportId }) => authoredReportId).sort();
      appendReplay("cross-check", state.elapsedMs, `Contradictory sources cross-checked: ${sources.join(", ")}.`, {
        sourceOfficerIds: sources,
        reportIds,
      });
    }
    if (state.crossChecked && !state.authorityReassigned && harness.authorityClarity >= 0.45 && harness.authorityClarity <= 0.88) {
      const actionOfficer = officers.find(({ disposition }) => disposition === "action");
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
      autonomyCost: 15,
      logisticsCost: 2,
      interventionCount: metrics.interventionCount,
    });
  };

  const intervene = (suppliedCommand: OperationIntervention): OperationSnapshot => {
    if (state.status !== "running") return snapshot();
    if (metrics.interventionCount >= scene.gameplayTuning.interventionBudget) {
      throw new RangeError("The authored intervention budget is exhausted.");
    }
    const command = clone(suppliedCommand);
    if (command.kind === "route-report") {
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
    updateBacklog();
    return snapshot();
  };

  return { refreshDecisions, processCrossCheckAndReplan, recordInterventionCost, intervene };
}
