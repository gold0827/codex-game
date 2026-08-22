export type SceneKind = "tutorial" | "operation" | "epilogue";

export interface CampaignOfficer {
  readonly id: string;
  readonly name: string;
  readonly rank: string;
  readonly role: string;
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
  readonly backdropId: string;
  readonly soundtrackId: string;
  readonly accentColor: string;
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
