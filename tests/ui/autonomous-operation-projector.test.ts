import { describe, expect, it } from "vitest";

import type {
  AutonomousBattleActorSnapshot,
  AutonomousBattleDecisionTrace,
  AutonomousBattleSnapshot,
} from "../../src/domain/operation/autonomousBattle";
import { projectAutonomousOperation } from "../../src/presentation/operation/autonomousOperationProjector";

const trace: AutonomousBattleDecisionTrace = {
  id: "trace:alpha:2",
  actorId: "alpha",
  startedAtMs: 63_000,
  completedAtMs: 65_000,
  information: {
    atMs: 63_000,
    state: "received",
    observationId: "observation:north-road",
    confidence: 0.82,
  },
  verification: {
    atMs: 63_500,
    observationId: "observation:north-road",
    state: "verified",
    confidence: 0.76,
  },
  authority: {
    atMs: 64_000,
    state: "clear",
    intentId: "delay-north",
    confidence: 0.71,
  },
  action: {
    atMs: 64_500,
    state: "executed",
    behaviorId: "screen-withdrawal",
    targetId: "north-road",
    confidence: 0.68,
  },
  feedback: {
    atMs: 65_000,
    source: "prior-action",
    state: "integrated",
    outcomeId: "delay-maintained",
    confidence: 0.79,
  },
};

function actor(
  id: string,
  label: string,
  latestDecision: AutonomousBattleDecisionTrace | null = null,
): AutonomousBattleActorSnapshot {
  return {
    id,
    label,
    role: "소총수",
    profile: {
      initiative: 0.7,
      caution: 0.6,
      discipline: 0.8,
      cooperation: 0.75,
      stressTolerance: 0.65,
      memoryCapacity: 3,
      sourceTrust: [],
    },
    variability: {
      decisionNoise: 0.2,
      executionNoise: 0.15,
    },
    condition: "effective",
    latestDecision,
  };
}

function snapshot(): AutonomousBattleSnapshot {
  return {
    battleId: "chuncheon-delay",
    elapsedMs: 65_000,
    durationMs: 180_000,
    resolution: { state: "running" },
    harness: {
      policies: {
        informationReach: 0.8,
        authorityClarity: 0.7,
        verificationDepth: 0.6,
        feedbackCompression: 0.5,
      },
      consequences: [{
        code: "verification-congestion",
        axis: "verificationDepth",
        severity: 0.4,
      }],
    },
    formations: [
      {
        id: "rok-screen",
        label: "국군 전방 엄호대",
        sideId: "rok",
        active: true,
        locationId: "north-road",
        intentId: "delay-north",
        actors: [actor("alpha", "김 일병", trace), actor("bravo", "이 상병")],
      },
      {
        id: "rok-reserve",
        label: "국군 예비대",
        sideId: "rok",
        active: false,
        locationId: "chuncheon",
        intentId: "hold-reserve",
        actors: [actor("charlie", "박 하사")],
      },
      {
        id: "kpa-vanguard",
        label: "북한군 선두대",
        sideId: "kpa",
        active: true,
        locationId: "north-road",
        intentId: "break-through",
        actors: [
          actor("enemy-1", "적 선두 1"),
          actor("enemy-2", "적 선두 2"),
          actor("enemy-3", "적 선두 3"),
        ],
      },
    ],
    objectives: [{
      id: "delay",
      label: "북한군 진격 지연",
      required: true,
      progress: 0.65,
      state: "active",
      evidence: [
        {
          id: "delay-time",
          label: "확보한 지연 시간",
          kind: "number",
          observed: 65_000,
          required: 90_000,
          comparator: "at-least",
          unit: "milliseconds",
          satisfied: false,
        },
        {
          id: "force-preserved",
          label: "철수 전력 보존",
          kind: "boolean",
          observed: true,
          required: true,
          comparator: "equal",
          satisfied: true,
        },
      ],
    }],
    interventionBudget: {
      available: 4,
      spent: 1,
      remaining: 3,
      count: 1,
    },
    recentEvents: {
      capacity: 12,
      firstSequence: 0,
      nextSequence: 7,
      items: [
        { sequence: 0, atMs: 0, kind: "formation-activated", formationId: "rok-screen" },
        { sequence: 1, atMs: 0, kind: "formation-activated", formationId: "kpa-vanguard" },
        { sequence: 2, atMs: 10_000, kind: "actor-decision", actorId: "alpha", traceId: "trace:alpha:1" },
        {
          sequence: 3,
          atMs: 30_000,
          kind: "formation-intent-changed",
          formationId: "rok-screen",
          intentId: "delay-north",
        },
        {
          sequence: 4,
          atMs: 40_000,
          kind: "harness-consequence",
          consequence: {
            code: "verification-congestion",
            axis: "verificationDepth",
            severity: 0.4,
          },
        },
        {
          sequence: 5,
          atMs: 50_000,
          kind: "intervention-applied",
          receiptId: "receipt:1",
          affectedFormationIds: ["rok-screen"],
        },
        { sequence: 6, atMs: 65_000, kind: "actor-decision", actorId: "alpha", traceId: trace.id },
      ],
    },
  };
}

describe("canonical autonomous operation projector", () => {
  it("projects the complete player-facing operation without assuming formation sizes", () => {
    const source = snapshot();
    const before = structuredClone(source);
    const view = projectAutonomousOperation(source, null);

    expect(view.clock.label).toBe("01:05 / 03:00");
    expect(view.resolution).toMatchObject({ state: "running", label: "작전 진행 중" });
    expect(view.harness.policies.map(({ label, valueLabel }) => [label, valueLabel])).toEqual([
      ["정보 도달", "80%"],
      ["권한 명료도", "70%"],
      ["검증 깊이", "60%"],
      ["피드백 압축", "50%"],
    ]);
    expect(view.harness.consequences[0]).toMatchObject({
      label: "검증 정체",
      severityLabel: "40%",
    });
    expect(view.interventionBudget).toMatchObject({
      label: "제한 개입 3 / 4",
      usage: "사용 1 · 1회",
    });
    expect(view.formations.map(({ actorCount }) => actorCount)).toEqual([2, 1, 3]);
    expect(view.objectives[0]).toMatchObject({
      label: "북한군 진격 지연",
      requirement: "필수",
      progressLabel: "65%",
    });
    expect(view.objectives[0]?.evidence.map(({ summary, status }) => [summary, status])).toEqual([
      ["관측 01:05 · 기준 01:30 이상", "미충족"],
      ["관측 예 · 기준 예 일치", "충족"],
    ]);
    expect(view.recentEvents).toHaveLength(6);
    expect(view.recentEvents[0]).toMatchObject({
      sequence: 6,
      summary: "김 일병 판단 완료",
    });
    expect(view.recentEvents.at(-1)?.sequence).toBe(1);
    expect(source).toEqual(before);
  });

  it("projects a selected actor's five decision stages in harness-loop order", () => {
    const view = projectAutonomousOperation(snapshot(), "alpha");

    expect(view.selectedActor?.label).toBe("김 일병");
    expect(view.selectedActor?.trace?.stages.map(({ id }) => id)).toEqual([
      "information",
      "verification",
      "authority",
      "action",
      "feedback",
    ]);
    expect(view.selectedActor?.trace?.stages.map(({ state }) => state)).toEqual([
      "수신",
      "검증됨",
      "권한 명확",
      "실행",
      "반영",
    ]);
    expect(view.selectedActor?.trace?.stages[4]?.detail).toBe(
      "이전 행동 결과 있음 · delay-maintained",
    );
    expect("commands" in view).toBe(false);
    expect("actions" in (view.selectedActor ?? {})).toBe(false);
  });

  it("handles stale selection and resolved failure without compatibility state", () => {
    const source = snapshot();
    const resolved: AutonomousBattleSnapshot = {
      ...source,
      elapsedMs: source.durationMs,
      resolution: {
        state: "resolved",
        disposition: "failure",
        outcomeId: "delay-line-broken",
        resolvedAtMs: source.durationMs,
      },
    };

    const view = projectAutonomousOperation(resolved, "missing-actor");

    expect(view.resolution).toEqual({
      state: "failure",
      label: "작전 실패",
      outcomeId: "delay-line-broken",
      resolvedAt: "03:00",
    });
    expect(view.selectedActor).toBeNull();
  });
});
