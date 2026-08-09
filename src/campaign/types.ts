export type SceneKind = "tutorial" | "operation" | "epilogue";
export type OfficerDisposition = "action" | "verification" | "communication";
export type OfficerReportTone =
  | "confident"
  | "cautious"
  | "urgent"
  | "relieved"
  | "deadpan";
export type ThreatKind =
  | "communications"
  | "flood"
  | "artillery"
  | "ambush"
  | "misinformation"
  | "obstruction";
export type ThreatLane = "north" | "center" | "south" | "command";
export type ThreatSeverity = "low" | "medium" | "high" | "critical";

export interface CampaignOfficer {
  readonly id: string;
  readonly name: string;
  readonly rank: string;
  readonly role: string;
  readonly disposition: OfficerDisposition;
}

export interface CampaignSceneIdentity {
  readonly id: string;
  readonly kind: SceneKind;
}

export interface CampaignSceneCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly briefing: string;
  readonly lesson: string;
  readonly success: string;
  readonly failure: string;
}

export interface CampaignScenePresentation {
  readonly mapId: string;
  readonly backdropId: string;
  readonly soundtrackId: string;
  readonly accentColor: string;
}

export type CampaignGuidanceStep =
  | Readonly<{
      id: string;
      instruction: string;
      action: "pause";
      target: Readonly<{ kind: "operation-clock" }>;
      completionEvent: "operation-paused";
    }>
  | Readonly<{
      id: string;
      instruction: string;
      action: "inspect";
      target: Readonly<{ kind: "officer"; officerId: string }>;
      completionEvent: "officer-inspected";
    }>
  | Readonly<{
      id: string;
      instruction: string;
      action: "route";
      target: Readonly<{
        kind: "report-recipient";
        reportId: string;
        recipientOfficerId: string;
      }>;
      completionEvent: "report-routed";
    }>
  | Readonly<{
      id: string;
      instruction: string;
      action: "resume";
      target: Readonly<{ kind: "operation-clock" }>;
      completionEvent: "operation-resumed";
    }>;

export interface CampaignOfficerReport {
  readonly id: string;
  readonly officerId: string;
  readonly tone: OfficerReportTone;
  readonly text: string;
}

export interface CampaignThreat {
  readonly id: string;
  readonly kind: ThreatKind;
  readonly lane: ThreatLane;
  readonly severity: ThreatSeverity;
  readonly telegraphDurationMs: number;
}

export interface CampaignEncounterBeat {
  readonly id: string;
  readonly timeMs: number;
  readonly headline: string;
  readonly description: string;
  readonly reports: readonly CampaignOfficerReport[];
  readonly threats: readonly CampaignThreat[];
}

export interface CampaignObjective {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
}

export interface CampaignTransition {
  readonly outcomeId: string;
  readonly targetSceneId: string;
}

export interface CampaignEncounterParameters {
  readonly durationMs: number;
  readonly threatBudget: number;
  readonly reinforcementIntervalMs: number;
}

export interface CampaignGameplayTuning {
  readonly startingResources: number;
  readonly interventionBudget: number;
  readonly simulationSpeed: number;
}

export interface CampaignScene {
  readonly identity: CampaignSceneIdentity;
  readonly copy: CampaignSceneCopy;
  readonly presentation: CampaignScenePresentation;
  readonly guidance: readonly CampaignGuidanceStep[];
  readonly beats: readonly CampaignEncounterBeat[];
  readonly objectives: readonly CampaignObjective[];
  readonly transitions: readonly CampaignTransition[];
  readonly encounterParameters: CampaignEncounterParameters;
  readonly gameplayTuning: CampaignGameplayTuning;
}

export interface CampaignDefinition {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly startSceneId: string;
  readonly officers: readonly CampaignOfficer[];
  readonly scenes: readonly CampaignScene[];
}
