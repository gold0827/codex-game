import {
  assertValidCampaignDefinition,
  type CampaignDefinition,
  type CampaignMapTopology,
  type CampaignOfficer,
  type CampaignScene,
} from "../campaign";
import { chuncheonAutonomousBattle } from "./chuncheonAutonomousBattle";

const chuncheonOperationMap = {
  width: 24,
  height: 16,
  blocked: [
    { x: 3, y: 9 },
    { x: 4, y: 9 },
    { x: 5, y: 9 },
    { x: 6, y: 9 },
    { x: 7, y: 9 },
    { x: 9, y: 9 },
    { x: 10, y: 9 },
    { x: 11, y: 9 },
    { x: 13, y: 9 },
    { x: 14, y: 9 },
    { x: 15, y: 9 },
    { x: 16, y: 9 },
    { x: 18, y: 9 },
    { x: 19, y: 9 },
    { x: 20, y: 9 },
  ],
  terrain: [
    { position: { x: 4, y: 3 }, movementCost: 3 },
    { position: { x: 5, y: 4 }, movementCost: 3 },
    { position: { x: 18, y: 4 }, movementCost: 2 },
    { position: { x: 19, y: 5 }, movementCost: 2 },
    { position: { x: 14, y: 12 }, movementCost: 3 },
    { position: { x: 15, y: 13 }, movementCost: 3 },
  ],
  spawns: [
    { id: "north-chuncheon-axis", position: { x: 11, y: 1 } },
    { id: "north-reinforcement-route", position: { x: 6, y: 1 } },
    { id: "oksanpo-approach", position: { x: 8, y: 4 } },
    { id: "soyang-north-bank", position: { x: 11, y: 7 } },
    { id: "soyang-crossing-approach", position: { x: 15, y: 7 } },
    { id: "east-chuncheon-route", position: { x: 21, y: 5 } },
    { id: "wonchang-pass", position: { x: 15, y: 14 } },
  ],
  destinations: [
    { id: "chuncheon-defense-area", position: { x: 11, y: 10 } },
    { id: "follow-on-defense-line", position: { x: 8, y: 14 } },
    { id: "southern-withdrawal-route", position: { x: 20, y: 14 } },
  ],
} as const satisfies CampaignMapTopology;

const chuncheonRoster = [
  {
    id: "forward-delay-command",
    name: "전방 지연대 지휘 역할",
    rank: "익명",
    role: "초기 접촉 확인과 단계적 지연",
    disposition: "action",
  },
  {
    id: "operations-verification",
    name: "작전 검증 역할",
    rank: "익명",
    role: "보고 대조와 철수 조건 확인",
    disposition: "verification",
  },
  {
    id: "rearward-coordination",
    name: "후속 방어선 연락 역할",
    rank: "익명",
    role: "후속 방어 준비와 부대 인계",
    disposition: "communication",
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
    mapId: "chuncheon-soyang-1950",
    backdropId: "chuncheon-ridge-june-dawn",
    soundtrackId: "six-signals-over-water",
    accentColor: "#7f9b72",
  },
  mapTopology: chuncheonOperationMap,
  guidance: [],
  beats: [],
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
    mapId: "chuncheon-soyang-1950",
    backdropId: "chuncheon-ridge-june-morning",
    soundtrackId: "quiet-water-after-action",
    accentColor: "#879c7c",
  },
  guidance: [],
  beats: [],
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
