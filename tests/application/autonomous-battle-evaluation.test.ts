import { describe, expect, it } from "vitest";

import {
  compareAutonomousBattleHarnesses,
  evaluateAutonomousBattles,
} from "../../src/application/autonomous-battle-evaluation";
import { DEFAULT_HARNESS } from "../../src/application/campaign-operation";
import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSimulationFactory,
} from "../../src/domain/operation/autonomousBattle";
import { createAutonomousBattleSimulation } from "../../src/domain/operation/operationEngine";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";

const definition: AutonomousBattleDefinition = {
  id: "evaluation-battle",
  durationMs: 3_000,
  playerControlledSideId: "friendly",
  formations: [],
  objectives: [
    {
      id: "delay", label: "진격 지연", required: true,
      measurement: "contested-delay",
      criterion: { comparator: "at-least", required: 0.5 },
    },
    {
      id: "preserve", label: "전력 보존", required: true,
      measurement: "controlled-effective-preservation",
      criterion: { comparator: "at-least", required: 0.7 },
    },
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
  options,
) => {
  let elapsedMs = 0;
  const progress = Math.min(
    1,
    (seedValue(options.seed) + options.harness.authorityClarity * 4) / 4,
  );
  const preserveProgress = 1 - progress / 2;
  const read = () => {
    const resolved = elapsedMs >= suppliedDefinition.durationMs;
    return {
      battleId: suppliedDefinition.id,
      elapsedMs,
      durationMs: suppliedDefinition.durationMs,
      resolution: resolved
        ? {
            state: "resolved" as const,
            disposition: progress >= 0.75 ? "success" as const : "failure" as const,
            outcomeId: progress >= 0.75 ? "held" : "withdrawn",
            resolvedAtMs: elapsedMs,
          }
        : { state: "running" as const },
      harness: {
        policies: structuredClone(options.harness),
        consequences: [],
      },
      formations: [],
      objectives: [
        {
          id: "delay",
          label: "진격 지연",
          required: true,
          progress,
          state: resolved ? progress >= 0.75 ? "achieved" as const : "failed" as const : "active" as const,
          evidence: [{
            id: "delay-progress",
            label: "지연 시간 확보율",
            kind: "number" as const,
            observed: progress,
            required: 0.75,
            comparator: "at-least" as const,
            unit: "ratio" as const,
            satisfied: progress >= 0.75,
          }],
        },
        {
          id: "preserve",
          label: "전력 보존",
          required: true,
          progress: preserveProgress,
          state: resolved ? preserveProgress >= 0.75 ? "achieved" as const : "failed" as const : "active" as const,
          evidence: [{
            id: "preserve-progress",
            label: "잔존 전투력",
            kind: "number" as const,
            observed: preserveProgress,
            required: 0.75,
            comparator: "at-least" as const,
            unit: "ratio" as const,
            satisfied: preserveProgress >= 0.75,
          }],
        },
      ],
      interventionBudget: {
        available: options.interventionBudget,
        spent: 0,
        remaining: options.interventionBudget,
        count: 0,
      },
      recentEvents: {
        capacity: 64,
        firstSequence: 0,
        nextSequence: 0,
        items: [],
      },
    };
  };

  return {
    snapshot: read,
    advance(deltaMs) {
      elapsedMs = Math.min(suppliedDefinition.durationMs, elapsedMs + deltaMs);
      return read();
    },
    intervene(intervention) {
      const formationIds = intervention.kind === "set-formation-intent"
        ? [intervention.formationId]
        : [...intervention.recipientFormationIds];
      return {
        snapshot: read(),
        receipt: {
          status: "rejected",
          id: "fake-no-budget",
          kind: intervention.kind,
          rejectedAtMs: elapsedMs,
          reason: elapsedMs >= suppliedDefinition.durationMs
            ? "operation-resolved"
            : "insufficient-budget",
          cost: 0,
          affectedFormationIds: formationIds,
        },
      };
    },
  };
};

describe("autonomous battle evaluation", () => {
  it("reproduces a non-degenerate production Chuncheon distribution and paired harness shift", () => {
    const seeds = [1, 2, 3];
    const input = {
      definition: chuncheonAutonomousBattle,
      harness: DEFAULT_HARNESS,
      seeds,
      stepMs: 60_000,
      factory: createAutonomousBattleSimulation,
    } as const;
    const first = evaluateAutonomousBattles(input);
    const replay = evaluateAutonomousBattles(input);
    const paired = compareAutonomousBattleHarnesses({
      ...input,
      baselineHarness: {
        informationReach: 0.2,
        authorityClarity: 0.2,
        verificationDepth: 0.2,
        feedbackCompression: 0.2,
      },
      comparisonHarness: DEFAULT_HARNESS,
    });

    expect(replay).toEqual(first);
    expect(first.dispositions.map(({ count }) => count)).toEqual([2, 1]);
    expect(first.objectives.every(({ evidence }) =>
      evidence.every(({ observedSamples }) =>
        new Set<unknown>(observedSamples as readonly unknown[]).size > 1),
    )).toBe(true);
    expect(paired.pairs.map(({ seed }) => seed)).toEqual(seeds);
    expect(paired.pairs.some(({ objectives }) => objectives.some(({ delta }) => delta !== 0)))
      .toBe(true);
  }, 20_000);

  it("runs supplied seeds in order and returns outcome and objective distributions", () => {
    const result = evaluateAutonomousBattles({
      definition,
      harness: baselineHarness,
      seeds: [3, 1, 2],
      stepMs: 1_000,
      factory: createFakeBattle,
    });

    expect(result.runs.map(({ seed }) => seed)).toEqual([3, 1, 2]);
    expect(result.runs.map(({ disposition }) => disposition)).toEqual([
      "success",
      "failure",
      "failure",
    ]);
    expect(result.dispositions).toEqual([
      { disposition: "success", count: 1, share: 0.333333 },
      { disposition: "failure", count: 2, share: 0.666667 },
    ]);
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
        states: [
          { state: "achieved", count: 1, share: 0.333333 },
          { state: "failed", count: 2, share: 0.666667 },
        ],
        evidence: [{
          evidenceId: "delay-progress",
          label: "지연 시간 확보율",
          kind: "number",
          required: 0.75,
          comparator: "at-least",
          unit: "ratio",
          observedSamples: [0.75, 0.25, 0.5],
          satisfactionCount: 1,
          satisfactionRate: 0.333333,
        }],
      },
      {
        objectiveId: "preserve",
        samples: [0.625, 0.875, 0.75],
        minimum: 0.625,
        maximum: 0.875,
        mean: 0.75,
        completionCount: 2,
        completionRate: 0.666667,
        states: [
          { state: "achieved", count: 2, share: 0.666667 },
          { state: "failed", count: 1, share: 0.333333 },
        ],
        evidence: [{
          evidenceId: "preserve-progress",
          label: "잔존 전투력",
          kind: "number",
          required: 0.75,
          comparator: "at-least",
          unit: "ratio",
          observedSamples: [0.625, 0.875, 0.75],
          satisfactionCount: 2,
          satisfactionRate: 0.666667,
        }],
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
        baselineDisposition: "failure",
        comparisonDisposition: "success",
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
        baselineDisposition: "failure",
        comparisonDisposition: "success",
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
        baselineDisposition: "success",
        comparisonDisposition: "success",
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
        resolution: { state: "running" as const },
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

  it("rejects evidence whose canonical criterion changes across seeds", () => {
    const createInconsistentEvidenceBattle: AutonomousBattleSimulationFactory = (
      suppliedDefinition,
      options,
    ) => {
      const simulation = createFakeBattle(suppliedDefinition, options);
      const snapshot = () => {
        const current = simulation.snapshot();
        if (options.seed !== 2) return current;
        return {
          ...current,
          objectives: current.objectives.map((objective) => objective.id !== "delay"
            ? objective
            : {
                ...objective,
                evidence: objective.evidence.map((evidence) => evidence.kind !== "number"
                  ? evidence
                  : { ...evidence, required: 0.8 }),
              }),
        };
      };
      return {
        snapshot,
        advance(deltaMs) {
          simulation.advance(deltaMs);
          return snapshot();
        },
        intervene: simulation.intervene,
      };
    };

    expect(() => evaluateAutonomousBattles({
      definition,
      harness: baselineHarness,
      seeds: [1, 2],
      stepMs: 1_000,
      factory: createInconsistentEvidenceBattle,
    })).toThrow(/changed identity/);
  });
});
