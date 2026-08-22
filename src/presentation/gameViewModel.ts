import type {
  GameSnapshot,
  HarnessAxis,
  PlayerSpeed,
} from "../application/game-session";
import { projectAutonomousOperation } from "./operation/autonomousOperationProjector";

export type PresentationCampaign = Readonly<{
  title: string;
  sceneCount: number;
  roles: readonly Readonly<{ id: string; rank: string; name: string; role: string }>[];
}>;

export type GameViewModel = ReturnType<typeof projectGameViewModel>;

const harnessLabels: Readonly<
  Record<HarnessAxis, Readonly<{ name: string; low: string; high: string }>>
> = {
  informationReach: { name: "정보 공유", low: "국지 정보", high: "광역 공유" },
  authorityClarity: { name: "권한 명료도", low: "승인 대기", high: "현장 자율" },
  verificationDepth: { name: "교차 검증", low: "속도 우선", high: "정밀 검증" },
  feedbackCompression: { name: "피드백 압축", low: "원문 유지", high: "핵심 요약" },
};
const harnessAxes = Object.keys(harnessLabels) as HarnessAxis[];
const playerSpeeds = [0.5, 1, 2] as const satisfies readonly PlayerSpeed[];

function backdrop(backdropId: string) {
  return {
    id: backdropId,
    style: "default" as const,
  };
}

export function projectGameViewModel(
  snapshot: GameSnapshot,
  campaign: PresentationCampaign,
  selectedActorId: string | null = null,
) {
  const roster = new Map(campaign.roles.map((role) => [role.id, role]));
  const operation = snapshot.operation === null
    ? null
    : {
        ...projectAutonomousOperation(snapshot.operation, selectedActorId),
        paused: snapshot.paused,
        speed: snapshot.playerSpeed,
        speeds: playerSpeeds,
        lastIntervention: snapshot.lastIntervention,
      };
  const debrief = snapshot.debrief;

  return {
    phase: snapshot.phase,
    accentColor: snapshot.scene.presentation.accentColor,
    backdrop: backdrop(snapshot.scene.presentation.backdropId),
    header: {
      campaignTitle: campaign.title,
      title: snapshot.scene.copy.title,
      subtitle: snapshot.scene.copy.subtitle,
      stats: [
        ["국면", `${Math.min(campaign.sceneCount, snapshot.progress.completedSceneIds.length + 1)}/${campaign.sceneCount}`],
        ["시도", String(snapshot.attemptNumber)],
        ["속도", `${snapshot.playerSpeed}배`],
      ] as const,
    },
    harness: harnessAxes.map((axis) => ({
      axis,
      ...harnessLabels[axis],
      value: snapshot.harness[axis],
      displayedValue: `${Math.round(snapshot.harness[axis] * 100)}%`,
      cost: snapshot.harnessBudget.axisCosts[axis],
      disabled: snapshot.phase !== "briefing",
    })),
    budget: snapshot.harnessBudget,
    briefing: snapshot.briefing === null ? null : {
      round: snapshot.attemptNumber,
      briefing: snapshot.briefing.copy.briefing,
      lesson: snapshot.briefing.copy.lesson,
      objectives: snapshot.briefing.objectives.map((objective) => ({
        id: objective.id,
        label: objective.description,
        required: objective.required,
      })),
      roleLessons: snapshot.roleMemory
        .filter(({ lessons }) => lessons.length > 0)
        .map(({ roleId, lessons }) => ({
          role: roster.has(roleId)
            ? `${roster.get(roleId)?.rank} ${roster.get(roleId)?.name}`
            : roleId,
          lessons: lessons.map(({ summary }) => summary),
        })),
    },
    operation,
    debrief: debrief === null ? null : {
      success: debrief.status === "success",
      copy: debrief.copy,
      lesson: snapshot.scene.copy.lesson,
      objectives: debrief.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        passed: objective.state === "achieved",
      })),
      failures: debrief.objectives
        .filter(({ state }) => state !== "achieved")
        .map((objective) => ({
          reason: objective.evidence.find(({ satisfied }) => !satisfied)?.label
            ?? `${objective.label} 미달성`,
          objective: objective.label,
          role: null,
        })),
      lessonChoices: debrief.lessonChoices.map((lesson) => ({
        id: lesson.id,
        role: roster.has(lesson.roleId)
          ? `${roster.get(lesson.roleId)?.rank} ${roster.get(lesson.roleId)?.name}`
          : lesson.roleId,
        summary: lesson.summary,
      })),
    },
    epilogue: {
      title: snapshot.scene.copy.title,
      subtitle: snapshot.scene.copy.subtitle,
      briefing: snapshot.scene.copy.briefing,
      success: snapshot.scene.copy.success,
    },
  } as const;
}
