import type {
  AutonomousBattleDecisionTrace,
  AutonomousBattleEvent,
  AutonomousBattleHarnessConsequence,
  AutonomousBattleObjectiveEvidence,
  AutonomousBattleSnapshot,
} from "../../domain/operation/autonomousBattle";

export type AutonomousOperationViewModel = ReturnType<
  typeof projectAutonomousOperation
>;

const harnessAxisLabels = {
  informationReach: "정보 도달",
  authorityClarity: "권한 명료도",
  verificationDepth: "검증 깊이",
  feedbackCompression: "피드백 압축",
} as const;

const harnessAxes = [
  "informationReach",
  "authorityClarity",
  "verificationDepth",
  "feedbackCompression",
] as const;

const consequenceLabels = {
  "information-saturation": "정보 포화",
  "ambiguous-authority": "불명확한 권한",
  "verification-congestion": "검증 정체",
  "noisy-feedback": "잡음 섞인 피드백",
  "over-centralization": "과도한 중앙집중",
} as const;

const conditionLabels = {
  effective: "전투 가능",
  suppressed: "제압됨",
  withdrawn: "철수",
  lost: "전투 불능",
} as const;

const objectiveStateLabels = {
  active: "진행 중",
  achieved: "달성",
  failed: "실패",
} as const;

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const short = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours === 0 ? short : `${hours}:${short}`;
}

function consequenceView(consequence: AutonomousBattleHarnessConsequence) {
  return {
    code: consequence.code,
    label: consequenceLabels[consequence.code],
    axis: consequence.axis,
    axisLabel: harnessAxisLabels[consequence.axis],
    severity: consequence.severity,
    severityLabel: percentage(consequence.severity),
  } as const;
}

function observedEvidenceValue(
  evidence: AutonomousBattleObjectiveEvidence,
  value: number | string | boolean,
): string {
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "string") return value;
  if (evidence.kind !== "number") return String(value);
  if (evidence.unit === "ratio") return percentage(value);
  if (evidence.unit === "milliseconds") return formatTime(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function comparatorLabel(evidence: AutonomousBattleObjectiveEvidence): string {
  if (evidence.comparator === "at-least") return "이상";
  if (evidence.comparator === "at-most") return "이하";
  if (evidence.comparator === "not-equal") return "제외";
  return "일치";
}

function traceStages(trace: AutonomousBattleDecisionTrace) {
  return [
    {
      id: "information",
      label: "정보 수신",
      at: formatTime(trace.information.atMs),
      state: trace.information.state === "received" ? "수신" : "미수신",
      detail: trace.information.observationId === null
        ? "수신한 관측 없음"
        : `관측 ${trace.information.observationId}`,
      confidence: percentage(trace.information.confidence),
    },
    {
      id: "verification",
      label: "정보 검증",
      at: formatTime(trace.verification.atMs),
      state: {
        verified: "검증됨",
        contradicted: "모순 확인",
        skipped: "검증 생략",
      }[trace.verification.state],
      detail: trace.verification.observationId === null
        ? "검증 대상 없음"
        : `관측 ${trace.verification.observationId}`,
      confidence: percentage(trace.verification.confidence),
    },
    {
      id: "authority",
      label: "권한 판단",
      at: formatTime(trace.authority.atMs),
      state: {
        clear: "권한 명확",
        ambiguous: "권한 불명확",
        "self-directed": "자율 판단",
      }[trace.authority.state],
      detail: trace.authority.intentId === null
        ? "공유된 의도 없음"
        : `의도 ${trace.authority.intentId}`,
      confidence: percentage(trace.authority.confidence),
    },
    {
      id: "action",
      label: "행동 실행",
      at: formatTime(trace.action.atMs),
      state: {
        executed: "실행",
        failed: "실패",
        deferred: "보류",
      }[trace.action.state],
      detail: trace.action.targetId === null
        ? `행동 ${trace.action.behaviorId}`
        : `행동 ${trace.action.behaviorId} · 대상 ${trace.action.targetId}`,
      confidence: percentage(trace.action.confidence),
    },
    {
      id: "feedback",
      label: "결과 피드백",
      at: formatTime(trace.feedback.atMs),
      state: {
        integrated: "반영",
        missing: "피드백 없음",
        ignored: "미반영",
      }[trace.feedback.state],
      detail: trace.feedback.sourceActionTraceId === null
        ? "이전 행동 결과 없음"
        : trace.feedback.outcomeId === null
          ? "이전 행동 결과 있음"
          : `이전 행동 결과 있음 · ${trace.feedback.outcomeId}`,
      confidence: percentage(trace.feedback.confidence),
    },
  ] as const;
}

function eventSummary(
  event: AutonomousBattleEvent,
  labels: ReadonlyMap<string, string>,
) {
  const label = (id: string): string => labels.get(id) ?? id;
  let summary: string;

  switch (event.kind) {
    case "formation-activated":
      summary = `${label(event.formationId)} 투입`;
      break;
    case "formation-intent-changed":
      summary = `${label(event.formationId)} 의도 변경 · ${event.intentId}`;
      break;
    case "actor-decision":
      summary = `${label(event.actorId)} 판단 완료`;
      break;
    case "actor-condition-changed":
      summary = `${label(event.actorId)} 상태 변화 · ${conditionLabels[event.condition]}`;
      break;
    case "objective-state-changed":
      summary = `${label(event.objectiveId)} ${objectiveStateLabels[event.state]} · ${percentage(event.progress)}`;
      break;
    case "harness-consequence":
      summary = `하네스 영향 · ${consequenceLabels[event.consequence.code]}`;
      break;
    case "intervention-applied":
      summary = `제한 개입 적용 · ${event.affectedFormationIds.map(label).join(", ")}`;
      break;
    case "operation-resolved":
      summary = event.disposition === "success"
        ? `작전 성공 · ${event.outcomeId}`
        : `작전 실패 · ${event.outcomeId}`;
      break;
  }

  return {
    sequence: event.sequence,
    time: formatTime(event.atMs),
    kind: event.kind,
    summary,
  } as const;
}

export function projectAutonomousOperation(
  snapshot: AutonomousBattleSnapshot,
  selectedActorId: string | null,
) {
  const actorLabels = snapshot.formations.flatMap(({ actors }) => actors)
    .map(({ id, label }) => [id, label] as const);
  const labels = new Map<string, string>([
    ...snapshot.formations.map(({ id, label }) => [id, label] as const),
    ...actorLabels,
    ...snapshot.objectives.map(({ id, label }) => [id, label] as const),
  ]);
  const selectedActor = snapshot.formations
    .flatMap(({ actors }) => actors)
    .find(({ id }) => id === selectedActorId) ?? null;

  return {
    id: snapshot.battleId,
    clock: {
      elapsedMs: snapshot.elapsedMs,
      durationMs: snapshot.durationMs,
      elapsed: formatTime(snapshot.elapsedMs),
      duration: formatTime(snapshot.durationMs),
      label: `${formatTime(snapshot.elapsedMs)} / ${formatTime(snapshot.durationMs)}`,
      progress: snapshot.durationMs === 0 ? 0 : snapshot.elapsedMs / snapshot.durationMs,
    },
    resolution: snapshot.resolution.state === "running"
      ? {
          state: "running" as const,
          label: "작전 진행 중",
          outcomeId: null,
          resolvedAt: null,
        }
      : {
          state: snapshot.resolution.disposition,
          label: snapshot.resolution.disposition === "success" ? "작전 성공" : "작전 실패",
          outcomeId: snapshot.resolution.outcomeId,
          resolvedAt: formatTime(snapshot.resolution.resolvedAtMs),
        },
    harness: {
      policies: harnessAxes.map((axis) => ({
        axis,
        label: harnessAxisLabels[axis],
        value: snapshot.harness.policies[axis],
        valueLabel: percentage(snapshot.harness.policies[axis]),
      })),
      consequences: snapshot.harness.consequences.map(consequenceView),
      consequenceSummary: snapshot.harness.consequences.length === 0
        ? "현재 하네스 부작용 없음"
        : `하네스 부작용 ${snapshot.harness.consequences.length}건`,
    },
    interventionBudget: {
      ...snapshot.interventionBudget,
      label: `제한 개입 ${snapshot.interventionBudget.remaining} / ${snapshot.interventionBudget.available}`,
      usage: `사용 ${snapshot.interventionBudget.spent} · ${snapshot.interventionBudget.count}회`,
    },
    formations: snapshot.formations.map((formation) => ({
      id: formation.id,
      label: formation.label,
      sideId: formation.sideId,
      active: formation.active,
      status: formation.active ? "투입" : "대기",
      location: formation.locationId,
      intent: formation.intentId,
      actorCount: formation.actors.length,
      actors: formation.actors.map((actor) => ({
        id: actor.id,
        label: actor.label,
        role: actor.role,
        selected: actor.id === selectedActorId,
        condition: actor.condition,
        conditionLabel: conditionLabels[actor.condition],
        behavior: actor.latestDecision?.action.behaviorId ?? null,
        confidence: actor.latestDecision === null
          ? null
          : percentage(actor.latestDecision.action.confidence),
        traits: [
          ["주도성", percentage(actor.profile.initiative)],
          ["신중함", percentage(actor.profile.caution)],
          ["규율", percentage(actor.profile.discipline)],
          ["협동", percentage(actor.profile.cooperation)],
          ["스트레스 내성", percentage(actor.profile.stressTolerance)],
        ] as const,
        variability: `판단 변동 ${percentage(actor.variability.decisionNoise)} · 실행 변동 ${percentage(actor.variability.executionNoise)}`,
      })),
    })),
    objectives: snapshot.objectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      required: objective.required,
      requirement: objective.required ? "필수" : "선택",
      progress: objective.progress,
      progressLabel: percentage(objective.progress),
      state: objective.state,
      stateLabel: objectiveStateLabels[objective.state],
      evidence: objective.evidence.map((evidence) => ({
        id: evidence.id,
        label: evidence.label,
        satisfied: evidence.satisfied,
        status: evidence.satisfied ? "충족" : "미충족",
        observed: observedEvidenceValue(evidence, evidence.observed),
        required: observedEvidenceValue(evidence, evidence.required),
        comparator: comparatorLabel(evidence),
        summary: `관측 ${observedEvidenceValue(evidence, evidence.observed)} · 기준 ${observedEvidenceValue(evidence, evidence.required)} ${comparatorLabel(evidence)}`,
      })),
    })),
    recentEvents: snapshot.recentEvents.items
      .slice(-6)
      .reverse()
      .map((event) => eventSummary(event, labels)),
    selectedActor: selectedActor === null
      ? null
      : {
          id: selectedActor.id,
          label: selectedActor.label,
          role: selectedActor.role,
          condition: conditionLabels[selectedActor.condition],
          trace: selectedActor.latestDecision === null
            ? null
            : {
                id: selectedActor.latestDecision.id,
                startedAt: formatTime(selectedActor.latestDecision.startedAtMs),
                completedAt: formatTime(selectedActor.latestDecision.completedAtMs),
                stages: traceStages(selectedActor.latestDecision),
              },
        },
  } as const;
}
