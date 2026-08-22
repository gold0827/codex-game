import type {
  CampaignObjective,
  CampaignProgressSnapshot,
  CampaignScene,
  CampaignSceneCopy,
  CampaignScenePresentation,
  RoleLesson,
  RoleLessonMemory,
} from "../../campaign";
import type {
  AutonomousBattleHarnessPolicies,
  AutonomousBattleInterventionReceipt,
  AutonomousBattleSnapshot,
} from "../../domain/operation/operationEngine";
import type { RandomSeed } from "../../simulation/seededRandom";

export type GamePhase = "briefing" | "operation" | "debrief" | "epilogue";
export type PlayerSpeed = 0.5 | 1 | 2;
export type HarnessAxis = keyof AutonomousBattleHarnessPolicies;
export type GameOperationSnapshot = AutonomousBattleSnapshot;

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

export type GameDebriefSnapshot = Readonly<{
  status: "success" | "retry";
  outcomeId: string;
  copy: string;
  lessonChoices: readonly RoleLesson[];
  objectives: GameOperationSnapshot["objectives"];
}>;

type GameSnapshotBase = Readonly<{
  scene: CampaignScene;
  progress: CampaignProgressSnapshot;
  roleMemory: readonly RoleLessonMemory[];
  attemptNumber: number;
  attemptSeed: RandomSeed;
  harness: AutonomousBattleHarnessPolicies;
  harnessBudget: HarnessBudgetSnapshot;
  playerSpeed: PlayerSpeed;
}>;

type GameBriefingPhaseSnapshot = GameSnapshotBase & Readonly<{
  phase: "briefing";
  briefing: GameBriefingSnapshot;
  operation: null;
  paused: false;
  lastIntervention: null;
  debrief: null;
}>;

type GameOperationPhaseSnapshot = GameSnapshotBase & Readonly<{
  phase: "operation";
  briefing: null;
  operation: GameOperationSnapshot;
  paused: boolean;
  lastIntervention: AutonomousBattleInterventionReceipt | null;
  debrief: null;
}>;

type GameDebriefPhaseSnapshot = GameSnapshotBase & Readonly<{
  phase: "debrief";
  briefing: null;
  operation: null;
  paused: false;
  lastIntervention: null;
  debrief: GameDebriefSnapshot;
}>;

type GameEpiloguePhaseSnapshot = GameSnapshotBase & Readonly<{
  phase: "epilogue";
  briefing: null;
  operation: null;
  paused: false;
  lastIntervention: null;
  debrief: null;
}>;

export type GameSnapshot =
  | GameBriefingPhaseSnapshot
  | GameOperationPhaseSnapshot
  | GameDebriefPhaseSnapshot
  | GameEpiloguePhaseSnapshot;

export type GameSessionResume = Readonly<{
  progress: CampaignProgressSnapshot;
  roleMemory: readonly RoleLessonMemory[];
}>;

export type GameCommand =
  | Readonly<{ type: "configure-harness"; axis: HarnessAxis; value: number }>
  | Readonly<{ type: "set-harness"; harness: AutonomousBattleHarnessPolicies }>
  | Readonly<{ type: "start-attempt" }>
  | Readonly<{ type: "set-player-speed"; speed: PlayerSpeed }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "resume" }>
  | Readonly<{
      type: "set-formation-intent";
      formationId: string;
      intentId: string;
    }>
  | Readonly<{
      type: "issue-guidance";
      guidanceId: string;
      recipientFormationIds: readonly string[];
    }>
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
