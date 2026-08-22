export {
  parseCampaignJson,
  parseCampaignValue,
  type CampaignParseDiagnostic,
  type CampaignParseDiagnosticKind,
  type CampaignParseResult,
} from "./parsing";
export {
  CampaignProgressError,
  createCampaignProgress,
  type CampaignProgress,
  type CampaignProgressSnapshot,
} from "./progress";
export {
  CampaignRunError,
  createCampaignRun,
  type CampaignLessonChoice,
  type CampaignRun,
  type CampaignRunSnapshot,
  type CampaignRunStatus,
  type RoleLesson,
  type RoleLessonMemory,
  type OperationLaunch,
  type OperationResult,
} from "./campaignRun";
export type {
  CampaignDefinition,
  CampaignEncounterParameters,
  CampaignGameplayTuning,
  CampaignObjective,
  CampaignRole,
  CampaignScene,
  CampaignSceneCopy,
  CampaignSceneIdentity,
  CampaignScenePresentation,
  CampaignTransition,
  SceneKind,
} from "./types";
export {
  CampaignValidationError,
  assertValidCampaignDefinition,
  validateCampaignDefinition,
  type CampaignDiagnostic,
  type CampaignDiagnosticCode,
  type CampaignValidationResult,
} from "./validation";
export {
  createBuiltInCampaignRepository,
  createInMemoryCampaignRepository,
  createLocalStorageCampaignRepository,
  type CampaignKeyValueStore,
  type CampaignRepository,
} from "./repository";
export type {
  AutonomousBattleActorDefinition,
  AutonomousBattleDefinition,
  AutonomousBattleFormationDefinition,
  AutonomousBattleFormationEntry,
  AutonomousBattleObjectiveDefinition,
  AgentProfile,
} from "./autonomousBattleDefinition";
