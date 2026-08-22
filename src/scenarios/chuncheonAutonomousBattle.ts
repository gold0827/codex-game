import type { AutonomousBattleDefinition } from "../campaign";

const roleActor = (
  id: string,
  label: string,
  role: string,
  profile: Readonly<{
    initiative: number;
    caution: number;
    discipline: number;
    cooperation: number;
    stressTolerance: number;
    memoryCapacity: number;
  }>,
  variability: Readonly<{
    decisionNoise: number;
    executionNoise: number;
  }>,
) => ({
  id,
  label,
  role,
  profile,
  variability,
});

/**
 * 1950년 6월 25~28일 춘천·소양강 지연 방어를 한 작전으로 축소한 시나리오다.
 *
 * actor는 실제 인물이나 실제 병력 수를 재현하지 않는다. 각 항목은 이름 없는
 * 전술 역할 하나를 나타내며, formations 배열만이 이 시나리오의 편성 크기를 정한다.
 */
export const chuncheonAutonomousBattle = {
  id: "chuncheon-delay-1950-06-25",
  durationMs: 54 * 60 * 1_000,
  playerControlledSideId: "rok",
  formations: [
    {
      id: "rok-forward-delay",
      label: "국군 전방 지연대",
      sideId: "rok",
      initialLocationId: "oksanpo-approach",
      initialIntentId: "observe-and-delay",
      entry: { kind: "present" },
      actors: [
        roleActor(
          "rok-forward-observer",
          "전초 관측 역할",
          "forward-observation",
          {
            initiative: 0.68,
            caution: 0.72,
            discipline: 0.76,
            cooperation: 0.64,
            stressTolerance: 0.61,
            memoryCapacity: 4,
          },
          { decisionNoise: 0.24, executionNoise: 0.18 },
        ),
        roleActor(
          "rok-forward-messenger",
          "전령 연락 역할",
          "message-relay",
          {
            initiative: 0.74,
            caution: 0.58,
            discipline: 0.7,
            cooperation: 0.82,
            stressTolerance: 0.67,
            memoryCapacity: 5,
          },
          { decisionNoise: 0.21, executionNoise: 0.27 },
        ),
        roleActor(
          "rok-forward-blocking-team",
          "도로 차단 역할",
          "route-denial",
          {
            initiative: 0.63,
            caution: 0.49,
            discipline: 0.84,
            cooperation: 0.71,
            stressTolerance: 0.73,
            memoryCapacity: 3,
          },
          { decisionNoise: 0.19, executionNoise: 0.22 },
        ),
      ],
    },
    {
      id: "rok-soyang-defense",
      label: "국군 소양강 방어대",
      sideId: "rok",
      initialLocationId: "soyang-north-bank",
      initialIntentId: "hold-crossings",
      entry: { kind: "present" },
      actors: [
        roleActor(
          "rok-soyang-crossing-watch",
          "도하 감시 역할",
          "crossing-watch",
          {
            initiative: 0.57,
            caution: 0.79,
            discipline: 0.81,
            cooperation: 0.69,
            stressTolerance: 0.66,
            memoryCapacity: 5,
          },
          { decisionNoise: 0.16, executionNoise: 0.2 },
        ),
        roleActor(
          "rok-soyang-fire-control",
          "화력 조정 역할",
          "fire-coordination",
          {
            initiative: 0.66,
            caution: 0.68,
            discipline: 0.88,
            cooperation: 0.77,
            stressTolerance: 0.7,
            memoryCapacity: 6,
          },
          { decisionNoise: 0.14, executionNoise: 0.25 },
        ),
        roleActor(
          "rok-soyang-line-anchor",
          "방어선 유지 역할",
          "line-anchor",
          {
            initiative: 0.48,
            caution: 0.73,
            discipline: 0.9,
            cooperation: 0.74,
            stressTolerance: 0.81,
            memoryCapacity: 3,
          },
          { decisionNoise: 0.12, executionNoise: 0.17 },
        ),
        roleActor(
          "rok-soyang-local-reserve",
          "국지 예비 역할",
          "local-countermove",
          {
            initiative: 0.76,
            caution: 0.52,
            discipline: 0.72,
            cooperation: 0.65,
            stressTolerance: 0.75,
            memoryCapacity: 4,
          },
          { decisionNoise: 0.28, executionNoise: 0.23 },
        ),
      ],
    },
    {
      id: "rok-rearward-transition",
      label: "국군 후속선 준비대",
      sideId: "rok",
      initialLocationId: "wonchang-pass",
      initialIntentId: "prepare-and-receive-withdrawal",
      entry: { kind: "elapsed", atMs: 14 * 60 * 1_000 },
      actors: [
        roleActor(
          "rok-rear-route-control",
          "철수로 통제 역할",
          "withdrawal-route-control",
          {
            initiative: 0.59,
            caution: 0.83,
            discipline: 0.86,
            cooperation: 0.8,
            stressTolerance: 0.65,
            memoryCapacity: 6,
          },
          { decisionNoise: 0.15, executionNoise: 0.19 },
        ),
        roleActor(
          "rok-rear-signal-link",
          "후속선 통신 역할",
          "rearward-signal-link",
          {
            initiative: 0.55,
            caution: 0.7,
            discipline: 0.79,
            cooperation: 0.91,
            stressTolerance: 0.58,
            memoryCapacity: 7,
          },
          { decisionNoise: 0.22, executionNoise: 0.16 },
        ),
      ],
    },
    {
      id: "kpa-main-advance",
      label: "북한군 주공 선두대",
      sideId: "kpa",
      initialLocationId: "north-chuncheon-axis",
      initialIntentId: "press-southward",
      entry: { kind: "present" },
      actors: [
        roleActor(
          "kpa-main-recon",
          "선두 정찰 역할",
          "advance-reconnaissance",
          {
            initiative: 0.81,
            caution: 0.44,
            discipline: 0.75,
            cooperation: 0.62,
            stressTolerance: 0.72,
            memoryCapacity: 4,
          },
          { decisionNoise: 0.31, executionNoise: 0.2 },
        ),
        roleActor(
          "kpa-main-road-column",
          "도로 전진 역할",
          "road-column-advance",
          {
            initiative: 0.73,
            caution: 0.38,
            discipline: 0.82,
            cooperation: 0.7,
            stressTolerance: 0.76,
            memoryCapacity: 3,
          },
          { decisionNoise: 0.2, executionNoise: 0.14 },
        ),
        roleActor(
          "kpa-main-pressure",
          "정면 압박 역할",
          "frontal-pressure",
          {
            initiative: 0.69,
            caution: 0.35,
            discipline: 0.78,
            cooperation: 0.67,
            stressTolerance: 0.84,
            memoryCapacity: 2,
          },
          { decisionNoise: 0.26, executionNoise: 0.21 },
        ),
        roleActor(
          "kpa-main-follow-through",
          "돌파 확대 역할",
          "breakthrough-exploitation",
          {
            initiative: 0.84,
            caution: 0.41,
            discipline: 0.71,
            cooperation: 0.59,
            stressTolerance: 0.68,
            memoryCapacity: 5,
          },
          { decisionNoise: 0.34, executionNoise: 0.29 },
        ),
      ],
    },
    {
      id: "kpa-crossing-force",
      label: "북한군 도하 압박대",
      sideId: "kpa",
      initialLocationId: "soyang-crossing-approach",
      initialIntentId: "find-and-force-crossing",
      entry: { kind: "elapsed", atMs: 9 * 60 * 1_000 },
      actors: [
        roleActor(
          "kpa-crossing-search",
          "도하지점 탐색 역할",
          "crossing-search",
          {
            initiative: 0.77,
            caution: 0.61,
            discipline: 0.68,
            cooperation: 0.73,
            stressTolerance: 0.63,
            memoryCapacity: 5,
          },
          { decisionNoise: 0.29, executionNoise: 0.24 },
        ),
        roleActor(
          "kpa-crossing-support",
          "도하 지원 역할",
          "crossing-support",
          {
            initiative: 0.62,
            caution: 0.56,
            discipline: 0.8,
            cooperation: 0.83,
            stressTolerance: 0.71,
            memoryCapacity: 4,
          },
          { decisionNoise: 0.17, executionNoise: 0.3 },
        ),
        roleActor(
          "kpa-crossing-assault",
          "교두보 확보 역할",
          "bridgehead-assault",
          {
            initiative: 0.79,
            caution: 0.32,
            discipline: 0.74,
            cooperation: 0.66,
            stressTolerance: 0.8,
            memoryCapacity: 2,
          },
          { decisionNoise: 0.32, executionNoise: 0.26 },
        ),
      ],
    },
    {
      id: "kpa-flanking-force",
      label: "북한군 우회 기동대",
      sideId: "kpa",
      initialLocationId: "east-chuncheon-route",
      initialIntentId: "probe-flank-and-bypass",
      entry: { kind: "elapsed", atMs: 20 * 60 * 1_000 },
      actors: [
        roleActor(
          "kpa-flank-pathfinder",
          "우회로 개척 역할",
          "flank-pathfinding",
          {
            initiative: 0.86,
            caution: 0.65,
            discipline: 0.63,
            cooperation: 0.58,
            stressTolerance: 0.69,
            memoryCapacity: 6,
          },
          { decisionNoise: 0.37, executionNoise: 0.33 },
        ),
        roleActor(
          "kpa-flank-screen",
          "측방 견제 역할",
          "flank-screening",
          {
            initiative: 0.71,
            caution: 0.54,
            discipline: 0.69,
            cooperation: 0.61,
            stressTolerance: 0.74,
            memoryCapacity: 3,
          },
          { decisionNoise: 0.27, executionNoise: 0.31 },
        ),
        roleActor(
          "kpa-flank-cutoff",
          "퇴로 위협 역할",
          "withdrawal-cutoff",
          {
            initiative: 0.82,
            caution: 0.46,
            discipline: 0.73,
            cooperation: 0.57,
            stressTolerance: 0.77,
            memoryCapacity: 4,
          },
          { decisionNoise: 0.35, executionNoise: 0.28 },
        ),
      ],
    },
    {
      id: "kpa-follow-on-pressure",
      label: "북한군 후속 압박대",
      sideId: "kpa",
      initialLocationId: "north-reinforcement-route",
      initialIntentId: "sustain-pursuit",
      entry: { kind: "elapsed", atMs: 33 * 60 * 1_000 },
      actors: [
        roleActor(
          "kpa-follow-on-supply",
          "전진 보급 역할",
          "forward-sustainment",
          {
            initiative: 0.58,
            caution: 0.67,
            discipline: 0.85,
            cooperation: 0.88,
            stressTolerance: 0.6,
            memoryCapacity: 5,
          },
          { decisionNoise: 0.18, executionNoise: 0.34 },
        ),
        roleActor(
          "kpa-follow-on-pursuit",
          "후속 추격 역할",
          "follow-on-pursuit",
          {
            initiative: 0.8,
            caution: 0.37,
            discipline: 0.76,
            cooperation: 0.64,
            stressTolerance: 0.79,
            memoryCapacity: 3,
          },
          { decisionNoise: 0.3, executionNoise: 0.36 },
        ),
      ],
    },
  ],
  objectives: [
    {
      id: "delay-southward-advance",
      label: "적의 춘천 남쪽 진출을 목표 시간까지 지연한다.",
      required: true,
      measurement: "contested-delay",
      criterion: { comparator: "at-least", required: 0.45 },
    },
    {
      id: "prepare-follow-on-defense",
      label: "후속 방어선이 전투 준비를 마칠 시간을 확보한다.",
      required: true,
      measurement: "controlled-readiness",
      criterion: { comparator: "at-least", required: 0.44 },
    },
    {
      id: "withdraw-with-combat-power",
      label: "방어대가 전투력을 보존해 다음 지연선으로 철수한다.",
      required: true,
      measurement: "controlled-effective-preservation",
      criterion: { comparator: "at-least", required: 0.75 },
    },
  ],
} as const satisfies AutonomousBattleDefinition;
