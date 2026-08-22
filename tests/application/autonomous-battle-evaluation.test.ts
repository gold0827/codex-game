import { describe, expect, it } from "vitest";

import {
  compareAutonomousBattleHarnesses,
  evaluateAutonomousBattles,
} from "../../src/application/autonomous-battle-evaluation";
import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSimulationFactory,
} from "../../src/domain/operation/autonomousBattle";

const definition: AutonomousBattleDefinition = {
  id: "evaluation-battle",
  durationMs: 3_000,
  formations: [],
  objectives: [
    { id: "delay", label: "진격 지연", required: true },
    { id: "preserve", label: "전력 보존", required: true },
  ],
};

const baselineHarness: AutonomousBattleHarnessPolicies = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
};

function seedValue(seed: string | number): number {
  return typeof seed === "number" ? seed : seed.length;
}

/** Test-only outcome model; this is deliberately not a gameplay proposal. */
const createFakeBattle: AutonomousBattleSimulationFactory = (
  suppliedDefinition,
  seed,
  harness,
) => {
  let elapsedMs = 0;
  const progress = Math.min(1, (seedValue(seed) + harness.authorityClarity * 4) / 4);
  const read = () => ({
    battleId: suppliedDefinition.id,
    elapsedMs,
    durationMs: suppliedDefinition.durationMs,
    status: elapsedMs >= suppliedDefinition.durationMs ? "resolved" as const : "running" as const,
    outcomeId: elapsedMs >= suppliedDefinition.durationMs
      ? progress >= 0.75 ? "held" : "withdrawn"
      : null,
    formations: [],
    objectives: [
      { id: "delay", progress, completed: progress >= 0.75 },
      { id: "preserve", progress: 1 - progress / 2, completed: progress <= 0.5 },
    ],
  });

  return {
    snapshot: read,
    advance(deltaMs) {
      elapsedMs = Math.min(suppliedDefinition.durationMs, elapsedMs + deltaMs);
      return read();
    },
    intervene: () => read(),
  };
};

describe("autonomous battle evaluation", () => {
  it("runs supplied seeds in order and returns outcome and objective distributions", () => {
    const result = evaluateAutonomousBattles({
      definition,
      harness: baselineHarness,
      seeds: [3, 1, 2],
      stepMs: 1_000,
      factory: createFakeBattle,
    });

    expect(result.runs.map(({ seed }) => seed)).toEqual([3, 1, 2]);
    expect(result.outcomes).toEqual([
      { outcomeId: "held", count: 1, share: 0.333333 },
      { outcomeId: "withdrawn", count: 2, share: 0.666667 },
    ]);
    expect(result.objectives).toEqual([
      {
        objectiveId: "delay",
        samples: [0.75, 0.25, 0.5],
        minimum: 0.25,
        maximum: 0.75,
        mean: 0.5,
        completionCount: 1,
        completionRate: 0.333333,
      },
      {
        objectiveId: "preserve",
        samples: [0.625, 0.875, 0.75],
        minimum: 0.625,
        maximum: 0.875,
        mean: 0.75,
        completionCount: 2,
        completionRate: 0.666667,
      },
    ]);
    expect(JSON.stringify(
      evaluateAutonomousBattles({
        definition,
        harness: baselineHarness,
        seeds: [3, 1, 2],
        stepMs: 1_000,
        factory: createFakeBattle,
      }),
    )).toBe(JSON.stringify(result));
  });

  it("compares two harnesses over paired seeds without losing seed order", () => {
    const comparisonHarness = {
      ...baselineHarness,
      authorityClarity: 0.5,
    };
    const result = compareAutonomousBattleHarnesses({
      definition,
      baselineHarness,
      comparisonHarness,
      seeds: [1, 2, 3],
      stepMs: 1_000,
      factory: createFakeBattle,
    });

    expect(result.baseline.runs.map(({ seed }) => seed)).toEqual([1, 2, 3]);
    expect(result.comparison.runs.map(({ seed }) => seed)).toEqual([1, 2, 3]);
    expect(result.pairs).toEqual([
      {
        seed: 1,
        baselineOutcomeId: "withdrawn",
        comparisonOutcomeId: "held",
        objectives: [
          {
            objectiveId: "delay",
            baselineProgress: 0.25,
            comparisonProgress: 0.75,
            delta: 0.5,
          },
          {
            objectiveId: "preserve",
            baselineProgress: 0.875,
            comparisonProgress: 0.625,
            delta: -0.25,
          },
        ],
      },
      {
        seed: 2,
        baselineOutcomeId: "withdrawn",
        comparisonOutcomeId: "held",
        objectives: [
          {
            objectiveId: "delay",
            baselineProgress: 0.5,
            comparisonProgress: 1,
            delta: 0.5,
          },
          {
            objectiveId: "preserve",
            baselineProgress: 0.75,
            comparisonProgress: 0.5,
            delta: -0.25,
          },
        ],
      },
      {
        seed: 3,
        baselineOutcomeId: "held",
        comparisonOutcomeId: "held",
        objectives: [
          {
            objectiveId: "delay",
            baselineProgress: 0.75,
            comparisonProgress: 1,
            delta: 0.25,
          },
          {
            objectiveId: "preserve",
            baselineProgress: 0.625,
            comparisonProgress: 0.5,
            delta: -0.125,
          },
        ],
      },
    ]);
  });

  it("rejects empty seeds and invalid evaluation timing", () => {
    const evaluate = (
      overrides: Partial<Parameters<typeof evaluateAutonomousBattles>[0]> = {},
    ) => evaluateAutonomousBattles({
      definition,
      harness: baselineHarness,
      seeds: [1],
      stepMs: 1_000,
      factory: createFakeBattle,
      ...overrides,
    });

    expect(() => evaluate({ seeds: [] })).toThrow(/at least one seed/);
    expect(() => evaluate({ seeds: [""] })).toThrow(/non-empty string/);
    expect(() => evaluate({ stepMs: 0 })).toThrow(/positive finite step/);
    expect(() => evaluate({ stepMs: Number.NaN })).toThrow(/positive finite step/);
    expect(() => evaluate({
      definition: { ...definition, durationMs: 0 },
    })).toThrow(/positive finite duration/);
    expect(() => evaluate({
      definition: { ...definition, durationMs: Number.POSITIVE_INFINITY },
    })).toThrow(/positive finite duration/);
  });

  it("rejects a simulation that remains unresolved after the declared duration", () => {
    const createUnfinishedBattle: AutonomousBattleSimulationFactory = (...arguments_) => {
      const simulation = createFakeBattle(...arguments_);
      let advanceCount = 0;
      const unresolved = () => ({
        ...simulation.snapshot(),
        status: "running" as const,
        outcomeId: null,
      });
      return {
        snapshot: unresolved,
        advance(deltaMs) {
          advanceCount += 1;
          if (advanceCount > 4) throw new Error("test guard: evaluator did not stop");
          simulation.advance(deltaMs);
          return unresolved();
        },
        intervene: simulation.intervene,
      };
    };

    expect(() => evaluateAutonomousBattles({
      definition,
      harness: baselineHarness,
      seeds: [1],
      stepMs: 1_000,
      factory: createUnfinishedBattle,
    })).toThrow(/did not resolve/);
  });
});
