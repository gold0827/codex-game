import type {
  GameSnapshot,
  HarnessAxis,
  PlayerSpeed,
} from "../application/game-session";

export type PresentationCampaign = Readonly<{
  title: string;
  sceneCount: number;
  officers: readonly Readonly<{ id: string; rank: string; name: string }>[];
}>;

export type ThreatImpactViewModel = Readonly<{
  label: string;
  before: number;
  after: number;
}>;

export type GameViewModel = ReturnType<typeof projectGameViewModel>;

const harnessLabels: Readonly<
  Record<HarnessAxis, Readonly<{ name: string; low: string; high: string }>>
> = {
  informationReach: { name: "정보 공유", low: "직무 격리", high: "광역 공유" },
  authorityClarity: { name: "권한 명료도", low: "승인 대기", high: "현장 자율" },
  verificationDepth: { name: "교차 검증", low: "속도 우선", high: "전건 확인" },
  feedbackCompression: { name: "피드백 압축", low: "전문 공유", high: "핵심 요약" },
};

const dispositionLabels = {
  action: "행동 우선",
  verification: "증거 우선",
  communication: "전달 우선",
} as const;

const intentLabels = {
  "advance-locally": "현장 전진",
  "engage-threat": "위협 대응",
  "secure-objective": "목표 확보",
  "cross-check-report": "보고 대조",
  "inspect-source": "출처 확인",
  "hold-for-evidence": "근거 대기",
  "route-report": "보고 전달",
  "broadcast-update": "상황 전파",
  "compress-feedback": "피드백 압축",
} as const;

const verificationLabels = {
  unverified: "미검증",
  pending: "검증 대기",
  verified: "검증 완료",
  contradicted: "모순 확인",
} as const;

const phaseLabels = {
  briefing: "브리핑",
  operation: "작전 중",
  debrief: "결과 보고",
  epilogue: "졸업",
} as const;

const laneLabels = { north: "북쪽", center: "중앙", south: "남쪽", command: "지휘" } as const;
const severityLabels = { low: "낮음", medium: "보통", high: "높음", critical: "치명" } as const;
const threatKindLabels = {
  communications: "통신",
  flood: "침수",
  artillery: "포격",
  ambush: "매복",
  misinformation: "거짓 정보",
  obstruction: "장애물",
} as const;
const threatResultLabels = { blocked: "차단", "damaged-objective": "목표 피해" } as const;

export function formatGameTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function replayLabel(
  replay: GameSnapshot["replay"][number],
  roster: ReadonlyMap<string, Readonly<{ id: string; rank: string; name: string }>>,
): string {
  const value = (key: string): string => String(replay.data[key] ?? "");
  const officer = (id: string): string => roster.get(id)?.name ?? id;
  const labels = {
    "operation-started": "작전이 시작됐다.",
    "beat-activated": "새 작전 상황이 발생했다.",
    "random-choice": "현장 변수가 새로운 경로를 만들었다.",
    "report-queued": "새 보고가 통신망에 들어왔다.",
    "report-delivered": "보고가 수신 장교에게 전달됐다.",
    "report-verified": "보고 검증 결과가 갱신됐다.",
    "threat-telegraphed": "전장에 위협 예고가 포착됐다.",
    "threat-resolved": value("result") === "blocked" ? "위협을 차단했다." : "위협이 목표에 피해를 입혔다.",
    decision: `${officer(value("officerId"))} 장교가 다음 행동을 결정했다.`,
    "harness-consequence": "지휘 조건의 영향이 작전에 나타났다.",
    "cross-check": "서로 다른 보고를 교차 검증했다.",
    "authority-reassigned": `${officer(value("officerId"))} 장교에게 현장 권한이 재배정됐다.`,
    "autonomous-replan": "장교들이 스스로 계획과 권한을 재조정했다.",
    intervention: "지휘관이 직접 개입했다.",
    outcome: "작전 결과가 확정됐다.",
  } satisfies Record<GameSnapshot["replay"][number]["kind"], string>;
  return labels[replay.kind];
}

function guidanceTargetLabel(step: NonNullable<GameSnapshot["tutorial"]["currentStep"]>): string {
  if (step.action === "pause") return "작전 일시정지";
  if (step.action === "resume") return "작전 재개";
  if (step.action === "inspect") return `장교 ${step.target.officerId}`;
  return `보고 ${step.target.reportId} → ${step.target.recipientOfficerId}`;
}

export function projectGameViewModel(
  snapshot: GameSnapshot,
  campaign: PresentationCampaign,
) {
  const roster = new Map(campaign.officers.map((officer) => [officer.id, officer]));
  const operation = snapshot.operation;
  const guidance = snapshot.tutorial.active ? snapshot.tutorial.currentStep : null;
  const remainingInterventions = Math.max(
    0,
    snapshot.scene.gameplayTuning.interventionBudget - (operation?.metrics.interventionCount ?? 0),
  );
  const isGuidanceTarget = (action: "pause" | "resume" | "inspect" | "route", targetId?: string) => {
    if (!guidance || guidance.action !== action) return false;
    if (guidance.action === "inspect") return guidance.target.officerId === targetId;
    if (guidance.action === "route") return guidance.target.reportId === targetId;
    return true;
  };

  return {
    phase: snapshot.phase,
    accentColor: snapshot.scene.presentation.accentColor,
    header: {
      campaignTitle: campaign.title,
      title: snapshot.scene.copy.title,
      subtitle: snapshot.scene.copy.subtitle,
      stats: [
        ["장면", `${snapshot.progress.completedSceneIds.length + 1}/${campaign.sceneCount}`],
        ["시도", `${snapshot.attemptNumber}`],
        ["경과", formatGameTime(operation?.elapsedMs ?? 0)],
        ["속도", `${snapshot.playerSpeed}×`],
        ["상태", phaseLabels[snapshot.phase]],
      ] as const,
    },
    harness: (Object.keys(harnessLabels) as HarnessAxis[]).map((axis) => ({
      axis,
      ...harnessLabels[axis],
      value: snapshot.harness[axis],
      displayedValue: percentage(snapshot.harness[axis]),
      cost: snapshot.harnessBudget.axisCosts[axis],
      disabled: snapshot.phase !== "briefing",
    })),
    budget: snapshot.harnessBudget,
    briefing: snapshot.briefing
      ? {
          round: snapshot.progress.completedSceneIds.length + 1,
          briefing: snapshot.briefing.copy.briefing,
          lesson: snapshot.briefing.copy.lesson,
          objectives: snapshot.briefing.objectives.map((objective) => ({
            ...objective,
            label: `${objective.required ? "필수" : "선택"} · ${objective.description}`,
          })),
        }
      : null,
    tutorial: guidance
      ? {
          action: guidance.action,
          position: `${snapshot.tutorial.currentStepIndex + 1}/${snapshot.scene.guidance.length}`,
          instruction: guidance.instruction,
          target: guidanceTargetLabel(guidance),
        }
      : null,
    operation: operation
      ? {
          elapsed: formatGameTime(operation.elapsedMs),
          paused: snapshot.paused,
          speed: snapshot.playerSpeed,
          speeds: [0.5, 1, 2] as readonly PlayerSpeed[],
          pauseGuided: isGuidanceTarget(snapshot.paused ? "resume" : "pause"),
          remainingInterventions,
          metrics: [
            ["목표 진척", operation.metrics.objectiveProgress],
            ["민간 안전", operation.metrics.civilianSafety],
            ["보급", operation.metrics.logistics],
            ["조직 신뢰", operation.metrics.organizationTrust],
            ["자율도", operation.metrics.autonomyScore],
          ] as const,
          backlog: `신호 적체 ${operation.metrics.signalBacklog} · 직접 개입 ${operation.metrics.interventionCount}`,
          objectives: operation.objectives.map((objective) => ({
            ...objective,
            description: snapshot.scene.objectives.find(({ id }) => id === objective.id)?.description ?? objective.id,
            progressLabel: `${Math.round(objective.progress)}%`,
          })),
          officers: operation.officers.map((officer) => {
            const authored = roster.get(officer.id);
            const unit = operation.units.find(({ officerId }) => officerId === officer.id);
            return {
              id: officer.id,
              name: `${authored?.rank ?? ""} ${authored?.name ?? officer.id}`.trim(),
              selected: snapshot.selectedOfficerId === officer.id,
              guided: isGuidanceTarget("inspect", officer.id),
              authorized: officer.authorized,
              canAuthorize: remainingInterventions > 0 && !officer.authorized,
              facts: [
                ["성향", dispositionLabels[officer.disposition]],
                ["의도", intentLabels[officer.intent]],
                ["확신", percentage(officer.confidence)],
                ["현재 믿음", officer.currentBelief?.assertion ?? "관측 없음"],
                ["검증", officer.currentBelief ? verificationLabels[officer.currentBelief.verificationState] : "해당 없음"],
                ["다음 판단", officer.pendingDecision ? `판단 준비 중 · ${intentLabels[officer.pendingDecision.intent]}` : "대기 중"],
                ["체력", unit ? `${Math.round(unit.health)}%` : "배치 없음"],
                ["권한", officer.authorized ? "예외 승인" : "기본 경계"],
              ] as const,
            };
          }),
          reports: [...operation.messages].reverse().map((report) => ({
            id: report.authoredReportId,
            guided: isGuidanceTarget("route", report.authoredReportId),
            meta: `${formatGameTime(report.createdAtMs)} · ${roster.get(report.sourceOfficerId)?.name ?? report.sourceOfficerId} · ${report.deliveryState === "delivered" ? "전달됨" : "대기"}`,
            text: report.text,
            detail: `수신 ${report.recipientOfficerIds.map((id) => roster.get(id)?.name ?? id).join(", ") || "없음"} · 신뢰 ${percentage(report.reliability)} · ${verificationLabels[report.verificationState]}`,
            recipientId:
              guidance?.action === "route" && guidance.target.reportId === report.authoredReportId
                ? guidance.target.recipientOfficerId
                : campaign.officers[0]?.id ?? "",
            canIntervene: remainingInterventions > 0,
            canVerify: remainingInterventions > 0 && !report.prioritized,
          })),
          events: snapshot.replay.slice(-6).reverse().map((event) => ({
            sequence: event.sequence,
            time: formatGameTime(event.timeMs),
            kind: event.kind,
            label: replayLabel(event, roster),
          })),
          recipients: campaign.officers.map((officer) => ({
            id: officer.id,
            label: `${officer.rank} ${officer.name}`,
          })),
          battlefield: {
            mapId: snapshot.scene.presentation.mapId,
            fixedStepLabel: `고정 스텝 ${operation.fixedStepMs}ms`,
            units: operation.units.map((unit, index) => ({
              sprite: index + 1,
              left: 8 + unit.position * 82,
              lane: unit.lane,
              laneLabel: laneLabels[unit.lane],
              intent: unit.intent,
              intentLabel: intentLabels[unit.intent],
              health: Math.round(unit.health),
              officerName: roster.get(unit.officerId)?.name ?? unit.officerId,
            })),
            threats: operation.threats.map((threat, index) => {
              const duration = Math.max(1, threat.telegraphEndsAtMs - threat.telegraphedAtMs);
              const progress = threat.state === "resolved" ? 100 : Math.max(0, Math.min(100, ((operation.elapsedMs - threat.telegraphedAtMs) / duration) * 100));
              const stateLabel = threat.result ? threatResultLabels[threat.result] : threat.state === "resolved" ? "해결" : "예고 중";
              return {
                id: threat.id,
                index,
                lane: threat.lane,
                laneLabel: laneLabels[threat.lane],
                severity: threat.severity,
                severityLabel: severityLabels[threat.severity],
                kindLabel: threatKindLabels[threat.kind],
                state: threat.state,
                stateLabel,
                progress,
              };
            }),
          },
        }
      : null,
    debrief: snapshot.debrief
      ? {
          success: snapshot.debrief.status === "success",
          copy: snapshot.debrief.copy,
          lesson: snapshot.scene.copy.lesson,
        }
      : null,
    epilogue: {
      title: snapshot.scene.copy.title,
      subtitle: snapshot.scene.copy.subtitle,
      briefing: snapshot.scene.copy.briefing,
      success: snapshot.scene.copy.success,
    },
  } as const;
}
