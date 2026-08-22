import {
  assertValidCampaignDefinition,
  type CampaignDefinition,
  type CampaignOfficer,
  type CampaignScene,
} from "../campaign";
import { chuncheonAutonomousBattle } from "./chuncheonAutonomousBattle";

const chuncheonRoster = [
  {
    id: "forward-delay-command",
    name: "전방 지연대 지휘 역할",
    rank: "익명",
    role: "초기 접촉 확인과 단계적 지연",
  },
  {
    id: "operations-verification",
    name: "작전 검증 역할",
    rank: "익명",
    role: "보고 대조와 철수 조건 확인",
  },
  {
    id: "rearward-coordination",
    name: "후속 방어선 연락 역할",
    rank: "익명",
    role: "후속 방어 준비와 부대 인계",
  },
] as const satisfies readonly CampaignOfficer[];

const chuncheonOperation = {
  identity: {
    id: chuncheonAutonomousBattle.id,
    kind: "operation",
  },
  copy: {
    title: "춘천지구 전투 · 남하 지연",
    subtitle: "1950년 6월 25일–28일 / 춘천 북방과 소양강 일대",
    briefing:
      "1950년 6월 25일 북한군의 남하가 시작됐다. 국군 제6사단 방어부대는 춘천 북방과 소양강 일대에서 진격을 늦추고, 후속 방어선이 준비할 시간을 확보한 뒤 전투력을 보존해 다음 지연선으로 철수해야 한다.",
    lesson:
      "정보 수신, 보고 검증, 현장 권한, 행동 결과, 다음 판단의 피드백이 이어지도록 하네스를 구성한다. 예외 개입은 전투 집단의 지휘 의도를 교정할 때만 사용한다.",
    success:
      "적의 남하를 늦추는 동안 후속 방어선이 준비됐고, 방어부대는 전투력을 보존해 다음 지연선으로 이동했다.",
    failure:
      "지연 시간, 후속 방어 준비, 전투력 보존 가운데 필요한 조건을 충족하지 못했다. 같은 국면을 다시 검토해 하네스와 지휘 의도를 조정한다.",
  },
  presentation: {
    backdropId: "chuncheon-ridge-june-dawn",
    soundtrackId: "six-signals-over-water",
    accentColor: "#7f9b72",
  },
  objectives: chuncheonAutonomousBattle.objectives.map(({ id, label, required }) => ({
    id,
    description: label,
    required,
  })),
  transitions: [
    {
      outcomeId: "retry",
      targetSceneId: chuncheonAutonomousBattle.id,
    },
    {
      outcomeId: "objectives-unmet",
      targetSceneId: chuncheonAutonomousBattle.id,
    },
    {
      outcomeId: "objectives-achieved",
      targetSceneId: "chuncheon-delay-complete",
    },
  ],
  encounterParameters: {
    durationMs: chuncheonAutonomousBattle.durationMs,
  },
  gameplayTuning: {
    startingResources: 72,
    interventionBudget: 4,
    simulationSpeed: 60,
  },
} as const satisfies CampaignScene;

const chuncheonEpilogue = {
  identity: {
    id: "chuncheon-delay-complete",
    kind: "epilogue",
  },
  copy: {
    title: "춘천지구 지연전 종료",
    subtitle: "1950년 6월 28일 / 후속 방어선으로 이동",
    briefing:
      "춘천지구에서 확보한 시간과 보존한 전투력이 다음 방어 국면으로 이어진다.",
    lesson:
      "좋은 지휘 체계는 한 번의 정답을 강요하지 않고, 불확실한 행동 주체들이 목적을 잃지 않은 채 판단을 이어가게 한다.",
    success: "춘천지구 전투 국면의 작전 목표를 확인했다.",
    failure: "춘천지구 전투 국면을 다시 검토한다.",
  },
  presentation: {
    backdropId: "chuncheon-ridge-june-morning",
    soundtrackId: "quiet-water-after-action",
    accentColor: "#879c7c",
  },
  objectives: [],
  transitions: [],
  encounterParameters: {
    durationMs: 1,
  },
  gameplayTuning: {
    startingResources: 0,
    interventionBudget: 0,
    simulationSpeed: 1,
  },
} as const satisfies CampaignScene;

export const chuncheonCampaign = {
  id: "chuncheon-district-1950-prototype",
  title: "한국전쟁 자율지휘 · 춘천지구 전투",
  version: 1,
  startSceneId: chuncheonAutonomousBattle.id,
  officers: chuncheonRoster,
  scenes: [chuncheonOperation, chuncheonEpilogue],
} as const satisfies CampaignDefinition;

assertValidCampaignDefinition(chuncheonCampaign);
