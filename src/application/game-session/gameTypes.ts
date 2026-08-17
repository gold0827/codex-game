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
} from "../../campaign";
import type { RandomSeed } from "../../simulation/seededRandom";
import type {
  HarnessConfiguration,
  OperationEvent,
  OperationIntervention,
  OperationReplayEntry,
  OperationSnapshot,
  OperationStatus,
  SpatialSignalKind,
  SpatialSignalStrength,
} from "../../simulation/simulationTypes";

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

export type GameCommand =
  | Readonly<{ type: "configure-harness"; axis: HarnessAxis; value: number }>
  | Readonly<{ type: "set-harness"; harness: HarnessConfiguration }>
  | Readonly<{ type: "start-attempt" }>
  | Readonly<{ type: "set-player-speed"; speed: PlayerSpeed }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "resume" }>
  | Readonly<{ type: "inspect-officer"; officerId: string }>
  | Readonly<{
      type: "issue-spatial-signal";
      signal: SpatialSignalKind;
      strength: SpatialSignalStrength;
      position: CampaignTilePosition;
    }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{
      type: "route-report";
      reportId: string;
      recipientOfficerId: string;
    }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{ type: "authorize-officer"; officerId: string }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{ type: "prioritize-verification"; reportId: string }>
  | Readonly<{ type: "continue-campaign" }>
  | Readonly<{ type: "choose-lesson"; lessonId: string }>
  | Readonly<{ type: "reset" }>;

export type GameSession = Readonly<{
  read: () => GameSnapshot;
  dispatch: (command: GameCommand) => GameSnapshot;
  advance: (realElapsedMs: number) => GameSnapshot;
}>;

export type GameSessionErrorCode =
  | "invalid-phase"
  | "invalid-harness"
  | "harness-over-budget"
  | "invalid-speed"
  | "invalid-time"
  | "invalid-target";

export class GameSessionError extends Error {
  readonly code: GameSessionErrorCode;

  constructor(code: GameSessionErrorCode, message: string) {
    super(message);
    this.name = "GameSessionError";
    this.code = code;
  }
}
