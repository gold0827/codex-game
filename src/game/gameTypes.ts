import type {
  CampaignGuidanceStep,
  OfficerLesson,
  OfficerLessonMemory,
  CampaignObjective,
  CampaignProgressSnapshot,
  CampaignScene,
  CampaignSceneCopy,
  CampaignScenePresentation,
  CampaignTilePosition,
} from "../campaign";
import type { RandomSeed } from "../simulation/seededRandom";
import type {
  HarnessConfiguration,
  OperationEvent,
  OperationIntervention,
  OperationReplayEntry,
  OperationSnapshot,
  OperationStatus,
  SpatialSignalKind,
  SpatialSignalStrength,
} from "../simulation/simulationTypes";

export type GamePhase = "briefing" | "operation" | "debrief" | "epilogue";
export type PlayerSpeed = 0.5 | 1 | 2;
export type HarnessAxis = keyof HarnessConfiguration;

export type HarnessBudgetSnapshot = Readonly<{
  available: number;
  spent: number;
  remaining: number;
  axisCosts: Readonly<Record<HarnessAxis, number>>;
}>;

export type GameBriefingSnapshot = Readonly<{
  copy: CampaignSceneCopy;
  presentation: CampaignScenePresentation;
  objectives: readonly CampaignObjective[];
  harnessBudget: HarnessBudgetSnapshot;
}>;

export type TutorialGuidanceSnapshot = Readonly<{
  active: boolean;
  currentStepIndex: number;
  currentStep: CampaignGuidanceStep | null;
  completedStepIds: readonly string[];
}>;

export type GameDebriefSnapshot = Readonly<{
  status: Exclude<OperationStatus, "running">;
  outcomeId: string;
  copy: string;
  lessonChoices: readonly OfficerLesson[];
}>;

export type InterventionResultSnapshot = Readonly<{
  command: OperationIntervention;
  autonomyCost: number;
  logisticsCost: number;
  interventionCount: number;
}>;

export type GameSnapshot = Readonly<{
  phase: GamePhase;
  scene: CampaignScene;
  progress: CampaignProgressSnapshot;
  officerMemory: readonly OfficerLessonMemory[];
  attemptNumber: number;
  attemptSeed: RandomSeed;
  harness: HarnessConfiguration;
  harnessBudget: HarnessBudgetSnapshot;
  briefing: GameBriefingSnapshot | null;
  operation: OperationSnapshot | null;
  operationEvents: readonly OperationEvent[];
  replay: readonly OperationReplayEntry[];
  paused: boolean;
  playerSpeed: PlayerSpeed;
  selectedOfficerId: string | null;
  tutorial: TutorialGuidanceSnapshot;
  lastIntervention: InterventionResultSnapshot | null;
  debrief: GameDebriefSnapshot | null;
}>;

export type GameController = Readonly<{
  snapshot: () => GameSnapshot;
  configureHarness: (axis: HarnessAxis, value: number) => GameSnapshot;
  setHarness: (harness: HarnessConfiguration) => GameSnapshot;
  startAttempt: () => GameSnapshot;
  tick: (realElapsedMs: number) => GameSnapshot;
  setPlayerSpeed: (speed: PlayerSpeed) => GameSnapshot;
  pause: () => GameSnapshot;
  resume: () => GameSnapshot;
  inspectOfficer: (officerId: string) => GameSnapshot;
  issueSpatialSignal: (
    signal: SpatialSignalKind,
    strength: SpatialSignalStrength,
    position: CampaignTilePosition,
  ) => GameSnapshot;
  routeReport: (reportId: string, recipientOfficerId: string) => GameSnapshot;
  authorizeOfficer: (officerId: string) => GameSnapshot;
  prioritizeVerification: (reportId: string) => GameSnapshot;
  continueCampaign: () => GameSnapshot;
  chooseLesson: (lessonId: string) => GameSnapshot;
  reset: () => GameSnapshot;
}>;

export type GameControllerErrorCode =
  | "invalid-phase"
  | "invalid-harness"
  | "harness-over-budget"
  | "invalid-speed"
  | "invalid-time"
  | "invalid-target";

export class GameControllerError extends Error {
  readonly code: GameControllerErrorCode;

  constructor(code: GameControllerErrorCode, message: string) {
    super(message);
    this.name = "GameControllerError";
    this.code = code;
  }
}
