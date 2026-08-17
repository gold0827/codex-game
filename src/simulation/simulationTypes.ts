import type {
  CampaignOfficer,
  AgentProfile,
  CampaignMapTopology,
  CampaignScene,
  CampaignTilePosition,
  OfficerDisposition,
  ThreatKind,
  ThreatLane,
  ThreatSeverity,
} from "../campaign/types";
import type { RandomSeed } from "./seededRandom";
import type {
  ActionCommitment,
  OfficerIntent,
} from "../domain/operation/internal/agent/actions";
import type { PanicReaction } from "../domain/operation/internal/encounterTypes";

export type { PanicReaction } from "../domain/operation/internal/encounterTypes";

export type {
  ActionCommitment,
  DecisionAlternative,
  DecisionTrace,
  OfficerAction,
  OfficerActionKind,
  OfficerActionTarget,
  OfficerIntent,
} from "../domain/operation/internal/agent/actions";

export const OPERATION_FIXED_STEP_MS = 100;

export interface HarnessConfiguration {
  readonly informationReach: number;
  readonly authorityClarity: number;
  readonly verificationDepth: number;
  readonly feedbackCompression: number;
}

export interface OperationOfficerExperience {
  readonly officerId: string;
  readonly level: number;
}

export const BALANCED_HARNESS: HarnessConfiguration = Object.freeze({
  informationReach: 0.68,
  authorityClarity: 0.72,
  verificationDepth: 0.68,
  feedbackCompression: 0.7,
});

export type VerificationState =
  | "unverified"
  | "pending"
  | "verified"
  | "contradicted";

export interface OfficerBeliefSnapshot {
  readonly subjectId: string;
  readonly category: "report" | "signal" | "threat" | "outcome";
  readonly assertion: string;
  readonly origin: "direct" | "received";
  readonly sourceOfficerId: string | null;
  readonly receivedAtMs: number;
  readonly reliability: number;
  readonly confidence: number;
  readonly verificationState: VerificationState;
}

export interface OfficerSimulationSnapshot {
  readonly id: string;
  readonly experienceLevel: number;
  readonly profile: AgentProfile;
  readonly memorySize: number;
  readonly disposition: OfficerDisposition;
  readonly intent: OfficerIntent;
  readonly confidence: number;
  readonly currentBelief: OfficerBeliefSnapshot | null;
  readonly beliefs: readonly OfficerBeliefSnapshot[];
  readonly decisionCadenceMs: number;
  readonly committedAction: ActionCommitment | null;
  readonly authorized: boolean;
}

export type MessageDeliveryState = "queued" | "delivered";

export interface OperationMessageSnapshot {
  readonly id: string;
  readonly authoredReportId: string;
  readonly sourceOfficerId: string;
  readonly recipientOfficerIds: readonly string[];
  readonly createdAtMs: number;
  readonly deliveryAtMs: number;
  readonly reliability: number;
  readonly verificationState: VerificationState;
  readonly deliveryState: MessageDeliveryState;
  readonly text: string;
  readonly receivedText: string;
  readonly prioritized: boolean;
}

export type SpatialSignalKind = "investigate" | "defend" | "avoid";
export type SpatialSignalStrength = 1 | 2 | 3;
export type SpatialSignalResponse = "in-transit" | "delayed" | "accepted" | "ignored";

export interface SpatialSignalRecipientSnapshot {
  readonly officerId: string;
  readonly deliveryAtMs: number;
  readonly reactionAtMs: number;
  readonly response: SpatialSignalResponse;
}

export interface OperationSpatialSignalSnapshot {
  readonly id: string;
  readonly kind: SpatialSignalKind;
  readonly strength: SpatialSignalStrength;
  readonly position: CampaignTilePosition;
  readonly issuedAtMs: number;
  readonly recipients: readonly SpatialSignalRecipientSnapshot[];
}

export type ThreatState = "telegraphed" | "resolved";
export type ThreatResult = "blocked" | "damaged-objective" | null;

export interface OperationThreatSnapshot {
  readonly id: string;
  readonly kind: ThreatKind;
  readonly lane: ThreatLane;
  readonly severity: ThreatSeverity;
  readonly target: string;
  readonly telegraphedAtMs: number;
  readonly telegraphEndsAtMs: number;
  readonly resolutionTimeMs: number;
  readonly state: ThreatState;
  readonly result: ThreatResult;
}

export interface OperationUnitSnapshot {
  readonly officerId: string;
  readonly tile: CampaignTilePosition;
  readonly path: readonly CampaignTilePosition[];
  /** Snapshot-boundary compatibility projection; spatial movement is tile-based. */
  readonly lane: ThreatLane;
  /** Snapshot-boundary compatibility projection; spatial movement is tile-based. */
  readonly position: number;
  /** Snapshot-boundary compatibility projection; spatial movement is tile-based. */
  readonly route: readonly ThreatLane[];
  readonly intent: OfficerIntent;
  readonly health: number;
  readonly suppression: number;
  readonly panicReaction: PanicReaction | null;
  readonly objectiveId: string | null;
}

export interface OperationSpatialActorSnapshot {
  readonly actorId: string;
  readonly position: CampaignTilePosition;
  readonly destination: CampaignTilePosition | null;
  readonly path: readonly CampaignTilePosition[];
}

export interface OperationSpatialSnapshot {
  readonly topology: CampaignMapTopology;
  readonly actors: readonly OperationSpatialActorSnapshot[];
}

export interface OperationObjectiveSnapshot {
  readonly id: string;
  readonly required: boolean;
  readonly progress: number;
  readonly completed: boolean;
}

export interface OperationMetricsSnapshot {
  readonly objectiveProgress: number;
  readonly civilianSafety: number;
  readonly logistics: number;
  readonly organizationTrust: number;
  readonly signalBacklog: number;
  readonly interventionCount: number;
  readonly attentionSpent: number;
  readonly autonomyScore: number;
}

export type HarnessConsequence =
  | "information-saturation"
  | "ambiguous-authority"
  | "verification-congestion"
  | "noisy-feedback"
  | "over-centralization";

export type OperationStatus = "running" | "success" | "retry";

export type OperationObjectiveFactKind =
  | "vehicle-arrival"
  | "point-preservation"
  | "civilian-survival"
  | "threat-neutralization"
  | "report-routing"
  | "report-verification"
  | "shared-belief"
  | "command-channel"
  | "autonomous-replan";

export type OperationFailureCauseCode =
  | "vehicle-not-arrived"
  | "point-not-preserved"
  | "civilian-survival-failed"
  | "threat-not-neutralized"
  | "report-not-routed"
  | "report-not-verified"
  | "shared-belief-not-aligned"
  | "command-channel-congested"
  | "autonomous-replan-not-achieved";

export interface OperationObjectiveFact {
  readonly id: string;
  readonly objectiveId: string | null;
  readonly kind: OperationObjectiveFactKind;
  readonly passed: boolean;
  readonly actorId: string | null;
  readonly targetId: string;
  readonly decisionId: string | null;
  readonly observed: string | number | boolean;
  readonly required: string | number | boolean;
}

export interface OperationFailureCause {
  readonly code: OperationFailureCauseCode;
  readonly factId: string;
  readonly objectiveId: string | null;
  readonly actorId: string | null;
  readonly targetId: string;
  readonly decisionId: string | null;
}

export interface OperationResult {
  readonly status: Exclude<OperationStatus, "running">;
  readonly outcomeId: string;
  readonly objectiveFacts: readonly OperationObjectiveFact[];
  readonly failureCauses: readonly OperationFailureCause[];
}

export interface OperationSnapshot {
  readonly sceneId: string;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly fixedStepMs: number;
  readonly status: OperationStatus;
  readonly outcomeId: string | null;
  readonly result: OperationResult | null;
  readonly harness: HarnessConfiguration;
  readonly officers: readonly OfficerSimulationSnapshot[];
  readonly messages: readonly OperationMessageSnapshot[];
  readonly signals: readonly OperationSpatialSignalSnapshot[];
  readonly threats: readonly OperationThreatSnapshot[];
  readonly units: readonly OperationUnitSnapshot[];
  readonly spatial: OperationSpatialSnapshot;
  readonly objectives: readonly OperationObjectiveSnapshot[];
  readonly metrics: OperationMetricsSnapshot;
  readonly consequences: readonly HarnessConsequence[];
}

export type OperationReplayKind =
  | "operation-started"
  | "beat-activated"
  | "random-choice"
  | "report-queued"
  | "report-delivered"
  | "report-verified"
  | "threat-telegraphed"
  | "threat-resolved"
  | "decision"
  | "harness-consequence"
  | "cross-check"
  | "authority-reassigned"
  | "autonomous-replan"
  | "intervention"
  | "outcome";

export type ReplayDataValue = string | number | boolean | readonly string[];

export type OperationWorldEventKind =
  | "attack-blocked"
  | "attack-missed"
  | "unit-hit"
  | "unit-suppressed"
  | "unit-retreated"
  | "target-misidentified"
  | "ally-followed"
  | "unit-froze"
  | "panic-recovered";

export type OperationEventKind = OperationReplayKind | OperationWorldEventKind;

export interface OperationReplayEntry {
  readonly sequence: number;
  readonly timeMs: number;
  readonly kind: OperationReplayKind;
  readonly description: string;
  readonly data: Readonly<Record<string, ReplayDataValue>>;
}

export type OperationEvent = Readonly<{
  readonly id: string;
  readonly sequence: number;
  readonly timeMs: number;
  readonly kind: OperationEventKind;
  readonly data: Readonly<Record<string, ReplayDataValue>>;
}>;

export type OperationIntervention =
  | Readonly<{
      kind: "issue-spatial-signal";
      signal: SpatialSignalKind;
      strength: SpatialSignalStrength;
      position: CampaignTilePosition;
    }>
  /** @deprecated Remove after campaign guidance and presentation dispatch spatial signals. */
  | Readonly<{
      kind: "route-report";
      reportId: string;
      recipientOfficerId: string;
    }>
  /** @deprecated Remove after campaign guidance and presentation dispatch spatial signals. */
  | Readonly<{
      kind: "authorize-officer";
      officerId: string;
    }>
  /** @deprecated Remove after campaign guidance and presentation dispatch spatial signals. */
  | Readonly<{
      kind: "prioritize-verification";
      reportId: string;
    }>;

export type OperationSimulation = Readonly<{
  snapshot: () => OperationSnapshot;
  replay: () => readonly OperationReplayEntry[];
  events: () => readonly OperationEvent[];
  advance: (elapsedMs: number) => OperationSnapshot;
  intervene: (command: OperationIntervention) => OperationSnapshot;
}>;

export type OperationSimulationFactory = (
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
  runSeed: RandomSeed,
  harness: HarnessConfiguration,
) => OperationSimulation;
