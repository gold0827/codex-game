import {
  assertValidCampaignDefinition,
  type CampaignDefinition,
  type CampaignMapTopology,
  type CampaignOfficer,
  type CampaignScene,
  type CampaignTilePosition,
} from "../campaign";

const riverTiles = Array.from({ length: 16 }, (_, y) => ({ x: 11, y }));
const eastEmbankmentTiles = Array.from({ length: 9 }, (_, index) => ({
  x: 15 + index,
  y: 8,
}));

export const bridgeDefenseMap = {
  width: 24,
  height: 16,
  blocked: riverTiles.filter(({ y }) => y !== 3 && y !== 7 && y !== 13),
  terrain: [
    { position: { x: 8, y: 3 }, movementCost: 3 },
    { position: { x: 9, y: 3 }, movementCost: 3 },
    { position: { x: 10, y: 3 }, movementCost: 3 },
    { position: { x: 12, y: 3 }, movementCost: 3 },
    { position: { x: 13, y: 3 }, movementCost: 3 },
    ...eastEmbankmentTiles.map((position) => ({ position, movementCost: 2 })),
  ],
  spawns: [
    { id: "command-post", position: { x: 1, y: 2 } },
    { id: "bridge-guard", position: { x: 1, y: 6 } },
    { id: "civilian-column", position: { x: 1, y: 10 } },
    { id: "runner-post", position: { x: 1, y: 14 } },
  ],
  destinations: [
    { id: "north-observation", position: { x: 22, y: 3 } },
    { id: "haein-bridge", position: { x: 11, y: 7 } },
    { id: "civilian-shelter", position: { x: 22, y: 13 } },
    { id: "south-relay", position: { x: 22, y: 15 } },
  ],
} as const satisfies CampaignMapTopology;

export type BridgeDefenseMapSkin = Readonly<{
  id: string;
  water: readonly CampaignTilePosition[];
  crossings: readonly Readonly<{
    id: string;
    kind: "bridge" | "detour";
    position: CampaignTilePosition;
  }>[];
  landmarks: readonly Readonly<{
    id: string;
    kind: "civilian-shelter" | "command-post";
    position: CampaignTilePosition;
  }>[];
}>;

export const bridgeDefenseMapSkin = {
  id: "haein-river-bridge-dusk",
  water: riverTiles,
  crossings: [
    { id: "north-ford", kind: "detour", position: { x: 11, y: 3 } },
    { id: "haein-bridge", kind: "bridge", position: { x: 11, y: 7 } },
    { id: "south-farm-track", kind: "detour", position: { x: 11, y: 13 } },
  ],
  landmarks: [
    { id: "west-command-post", kind: "command-post", position: { x: 2, y: 2 } },
    { id: "east-civilian-shelter", kind: "civilian-shelter", position: { x: 21, y: 13 } },
  ],
} as const satisfies BridgeDefenseMapSkin;

export const bridgeDefenseOfficers = [
  {
    id: "major-baek",
    name: "백돌격",
    rank: "소령",
    role: "교량 방어 지휘",
    disposition: "action",
  },
  {
    id: "captain-han",
    name: "한확인",
    rank: "대위",
    role: "포격 좌표 검증",
    disposition: "verification",
  },
  {
    id: "lieutenant-kim",
    name: "김중계",
    rank: "중위",
    role: "민간인 대피 연락",
    disposition: "communication",
  },
  {
    id: "warrant-park",
    name: "박전달",
    rank: "준위",
    role: "전령·우회로 전달",
    disposition: "communication",
  },
] as const satisfies readonly CampaignOfficer[];

export const bridgeDefenseOperation = {
  identity: { id: "haein-bridge-defense", kind: "operation" },
  copy: {
    title: "교량 방어 · 강 건너의 여섯 신호",
    subtitle: "해인교 / 포격보다 빠른 오보",
    briefing:
      "해인교를 지키며 동쪽 둔치의 민간인을 대피시킨다. 북쪽 여울과 남쪽 농로가 우회로지만, 실제 포격 좌표와 가짜 관측 보고가 동시에 올라온다.",
    lesson:
      "조사·방어·회피 신호에 여섯 개입 자원을 나눠 장교들이 서로 다른 목표와 경로를 스스로 맡게 한다.",
    success: "해인교와 민간인 대피로가 모두 남았고, 실제 포격만 무력화됐다.",
    failure:
      "오보를 좇는 사이 교량이나 민간인 대피로를 잃었다. 다음 시도에는 해인교 방어를 먼저 확보하고, 북쪽 보고는 조사하며 남쪽 대피로는 별도로 보호한다.",
  },
  presentation: {
    mapId: bridgeDefenseMapSkin.id,
    backdropId: "haein-river-dusk",
    soundtrackId: "six-signals-over-water",
    accentColor: "#73b9a2",
  },
  mapTopology: bridgeDefenseMap,
  guidance: [
    {
      id: "bridge-pause",
      instruction: "포격 관측을 읽기 전에 작전 시간을 멈춘다.",
      action: "pause",
      target: { kind: "operation-clock" },
      completionEvent: "operation-paused",
    },
    {
      id: "bridge-inspect-validator",
      instruction: "한확인 대위가 실제 포격과 오보를 어떻게 구분하는지 살핀다.",
      action: "inspect",
      target: { kind: "officer", officerId: "captain-han" },
      completionEvent: "officer-inspected",
    },
    {
      id: "bridge-defend-signal",
      instruction: "해인교 타일에 강도 2 방어 신호를 보내 실제 포격에 대비한다.",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "defend",
        strength: 2,
        position: { x: 11, y: 7 },
      },
      completionEvent: "spatial-signal-issued",
    },
    {
      id: "bridge-resume",
      instruction: "교량 방어 신호를 확인했으면 작전 시간을 다시 흐르게 한다.",
      action: "resume",
      target: { kind: "operation-clock" },
      completionEvent: "operation-resumed",
    },
  ],
  beats: [
    {
      id: "bridge-routes-open",
      timeMs: 0,
      headline: "교량과 두 우회로 개방",
      description: "교량 수비대, 민간인 연락대, 전령이 각자 다른 강 건넘 지점을 향한다.",
      reports: [
        {
          id: "bridge-runner-route-report",
          officerId: "warrant-park",
          tone: "confident",
          text: "해인교는 열려 있고 북쪽 여울과 남쪽 농로도 통과 가능합니다. 세 길을 모두 뛰겠습니다.",
        },
      ],
      threats: [],
    },
    {
      id: "bridge-real-artillery",
      timeMs: 10_000,
      headline: "동쪽 제방에서 실제 포격 관측",
      description: "섬광과 탄착 시각이 일치한다. 해인교를 겨눈 실제 포격이다.",
      reports: [
        {
          id: "bridge-han-artillery-fix",
          officerId: "captain-han",
          tone: "urgent",
          text: "동쪽 제방 섬광과 탄착이 일치합니다. 중앙 좌표는 실제 포격입니다.",
        },
      ],
      threats: [
        {
          id: "bridge-east-bank-artillery",
          kind: "artillery",
          lane: "center",
          severity: "medium",
          telegraphDurationMs: 8_000,
        },
      ],
    },
    {
      id: "bridge-false-north-report",
      timeMs: 22_000,
      headline: "북쪽 여울에 가짜 탄착 보고",
      description: "출처가 없는 좌표가 실제 포격 보고와 같은 형식으로 전파된다.",
      reports: [
        {
          id: "bridge-park-false-report",
          officerId: "warrant-park",
          tone: "cautious",
          text: "북쪽 여울 탄착 보고는 발신자를 찾지 못했습니다. 제가 직접 확인하겠습니다.",
        },
      ],
      threats: [
        {
          id: "bridge-north-bank-misinformation",
          kind: "misinformation",
          lane: "command",
          severity: "high",
          telegraphDurationMs: 9_000,
        },
      ],
    },
    {
      id: "bridge-civilians-cross",
      timeMs: 36_000,
      headline: "민간인 대피대가 남쪽 농로 진입",
      description: "김중계 중위가 남쪽 농로와 동쪽 대피소 사이 연락을 유지한다.",
      reports: [
        {
          id: "bridge-kim-civilian-column",
          officerId: "lieutenant-kim",
          tone: "relieved",
          text: "민간인 대피대가 남쪽 농로를 건넙니다. 교량 수비 통신과 분리해 유지하겠습니다.",
        },
      ],
      threats: [],
    },
  ],
  objectives: [
    {
      id: "preserve-haein-bridge",
      description: "해인교를 실제 포격으로부터 보존한다.",
      required: true,
    },
    {
      id: "protect-civilian-column",
      description: "민간인 대피대와 동쪽 대피소를 보존한다.",
      required: true,
    },
  ],
  transitions: [
    { outcomeId: "retry", targetSceneId: "haein-bridge-defense" },
    { outcomeId: "success", targetSceneId: "bridge-defense-complete" },
  ],
  encounterParameters: {
    durationMs: 55_000,
    threatBudget: 2,
    reinforcementIntervalMs: 18_000,
  },
  gameplayTuning: {
    startingResources: 72,
    interventionBudget: 6,
    simulationSpeed: 1,
  },
} as const satisfies CampaignScene;

const bridgeDefenseEpilogue = {
  identity: { id: "bridge-defense-complete", kind: "epilogue" },
  copy: {
    title: "해인교 방어 완료",
    subtitle: "한 작전으로 확인한 자율 지휘",
    briefing: "교량과 민간인이 모두 남았다.",
    lesson: "서로 다른 목표와 경로는 하나의 정확한 명령보다 회복력이 높았다.",
    success: "작전 검증을 마쳤다.",
    failure: "작전 검증을 다시 시작한다.",
  },
  presentation: {
    mapId: bridgeDefenseMapSkin.id,
    backdropId: "haein-river-dawn",
    soundtrackId: "quiet-water-after-action",
    accentColor: "#73b9a2",
  },
  guidance: [],
  beats: [],
  objectives: [],
  transitions: [],
  encounterParameters: {
    durationMs: 1,
    threatBudget: 0,
    reinforcementIntervalMs: 1,
  },
  gameplayTuning: {
    startingResources: 0,
    interventionBudget: 0,
    simulationSpeed: 1,
  },
} as const satisfies CampaignScene;

export const bridgeDefenseCampaign = {
  id: "bridge-defense-vertical-slice",
  title: "자율군단 지휘학교 · 해인교",
  version: 1,
  startSceneId: bridgeDefenseOperation.identity.id,
  officers: bridgeDefenseOfficers,
  scenes: [bridgeDefenseOperation, bridgeDefenseEpilogue],
} as const satisfies CampaignDefinition;

assertValidCampaignDefinition(bridgeDefenseCampaign);
