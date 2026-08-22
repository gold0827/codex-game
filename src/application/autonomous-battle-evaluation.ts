import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleObjectiveSnapshot,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../domain/operation/autonomousBattle";
import type { RandomSeed } from "../simulation/seededRandom";

export type AutonomousBattleOutcomeDistributionEntry = Readonly<{
  outcomeId: string | null;
  count: number;
  share: number;
}>;

export type AutonomousBattleObjectiveDistribution = Readonly<{
  objectiveId: string;
  samples: readonly number[];
  minimum: number;
  maximum: number;
  mean: number;
  completionCount: number;
  completionRate: number;
}>;

export type AutonomousBattleEvaluationRun = Readonly<{
  seed: RandomSeed;
  outcomeId: string | null;
  objectives: readonly AutonomousBattleObjectiveSnapshot[];
}>;

export type AutonomousBattleEvaluation = Readonly<{
  battleId: string;
  runCount: number;
  outcomes: readonly AutonomousBattleOutcomeDistributionEntry[];
  objectives: readonly AutonomousBattleObjectiveDistribution[];
  runs: readonly AutonomousBattleEvaluationRun[];
}>;

export type EvaluateAutonomousBattlesInput = Readonly<{
  definition: AutonomousBattleDefinition;
  harness: AutonomousBattleHarnessPolicies;
  seeds: readonly RandomSeed[];
  stepMs: number;
  factory: AutonomousBattleSimulationFactory;
}>;

export type CompareAutonomousBattleHarnessesInput = Readonly<
  Omit<EvaluateAutonomousBattlesInput, "harness"> & {
    baselineHarness: AutonomousBattleHarnessPolicies;
    comparisonHarness: AutonomousBattleHarnessPolicies;
  }
>;

export type PairedAutonomousBattleEvaluation = Readonly<{
  battleId: string;
  baseline: AutonomousBattleEvaluation;
  comparison: AutonomousBattleEvaluation;
  pairs: readonly Readonly<{
    seed: RandomSeed;
    baselineOutcomeId: string | null;
    comparisonOutcomeId: string | null;
    objectives: readonly Readonly<{
      objectiveId: string;
      baselineProgress: number;
      comparisonProgress: number;
      delta: number;
    }>[];
  }>[];
}>;

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function compareOutcomeIds(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function assertEvaluationInput(input: EvaluateAutonomousBattlesInput): void {
  if (!Number.isFinite(input.definition.durationMs) || input.definition.durationMs <= 0) {
    throw new RangeError("An autonomous battle evaluation needs a positive finite duration.");
  }
  if (!Number.isFinite(input.stepMs) || input.stepMs <= 0) {
    throw new RangeError("An autonomous battle evaluation needs a positive finite step.");
  }
  if (!Array.isArray(input.seeds) || input.seeds.length === 0) {
    throw new RangeError("An autonomous battle evaluation needs at least one seed.");
  }
  input.seeds.forEach((seed) => {
    if (typeof seed === "string") {
      if (seed.length === 0) {
        throw new TypeError("An evaluation seed must be a non-empty string or safe integer.");
      }
    } else if (!Number.isSafeInteger(seed)) {
      throw new RangeError("An evaluation seed must be a non-empty string or safe integer.");
    }
  });
}

function terminalSnapshot(
  input: EvaluateAutonomousBattlesInput,
  seed: RandomSeed,
): AutonomousBattleSnapshot {
  const simulation = input.factory(
    structuredClone(input.definition),
    seed,
    structuredClone(input.harness),
  );
  let snapshot = simulation.snapshot();
  let remainingMs = input.definition.durationMs;

  while (snapshot.status === "running" && remainingMs > 0) {
    const deltaMs = Math.min(input.stepMs, remainingMs);
    snapshot = simulation.advance(deltaMs);
    remainingMs -= deltaMs;
  }
  if (snapshot.status === "running") {
    throw new RangeError(
      `Autonomous battle ${input.definition.id} did not resolve within its declared duration for seed ${String(seed)}.`,
    );
  }

  return snapshot;
}

function findObjective(
  objectives: readonly AutonomousBattleObjectiveSnapshot[],
  objectiveId: string,
): AutonomousBattleObjectiveSnapshot {
  const objective = objectives.find(({ id }) => id === objectiveId);
  if (!objective) {
    throw new RangeError(`Autonomous battle result is missing objective ${objectiveId}.`);
  }
  if (!Number.isFinite(objective.progress)) {
    throw new RangeError(`Autonomous battle objective ${objectiveId} has invalid progress.`);
  }
  return objective;
}

export function evaluateAutonomousBattles(
  input: EvaluateAutonomousBattlesInput,
): AutonomousBattleEvaluation {
  assertEvaluationInput(input);
  const runs = input.seeds.map((seed): AutonomousBattleEvaluationRun => {
    const snapshot = terminalSnapshot(input, seed);
    return {
      seed,
      outcomeId: snapshot.outcomeId,
      objectives: input.definition.objectives.map(({ id }) => ({
        ...findObjective(snapshot.objectives, id),
      })),
    };
  });
  const outcomeCounts = new Map<string | null, number>();
  runs.forEach(({ outcomeId }) => {
    outcomeCounts.set(outcomeId, (outcomeCounts.get(outcomeId) ?? 0) + 1);
  });
  const outcomes = [...outcomeCounts.entries()]
    .sort(([left], [right]) => compareOutcomeIds(left, right))
    .map(([outcomeId, count]) => ({
      outcomeId,
      count,
      share: rounded(count / runs.length),
    }));
  const objectives = input.definition.objectives.map(({ id: objectiveId }) => {
    const samples = runs.map(({ objectives: runObjectives }) =>
      findObjective(runObjectives, objectiveId),
    );
    const progress = samples.map(({ progress: value }) => value);
    const completionCount = samples.filter(({ completed }) => completed).length;
    return {
      objectiveId,
      samples: progress,
      minimum: Math.min(...progress),
      maximum: Math.max(...progress),
      mean: rounded(progress.reduce((total, value) => total + value, 0) / progress.length),
      completionCount,
      completionRate: rounded(completionCount / samples.length),
    };
  });

  return {
    battleId: input.definition.id,
    runCount: runs.length,
    outcomes,
    objectives,
    runs,
  };
}

export function compareAutonomousBattleHarnesses(
  input: CompareAutonomousBattleHarnessesInput,
): PairedAutonomousBattleEvaluation {
  const common = {
    definition: input.definition,
    seeds: input.seeds,
    stepMs: input.stepMs,
    factory: input.factory,
  };
  const baseline = evaluateAutonomousBattles({
    ...common,
    harness: input.baselineHarness,
  });
  const comparison = evaluateAutonomousBattles({
    ...common,
    harness: input.comparisonHarness,
  });
  const pairs = baseline.runs.map((baselineRun, index) => {
    const comparisonRun = comparison.runs[index];
    if (!comparisonRun) {
      throw new RangeError(`Paired evaluation is missing run ${index}.`);
    }
    return {
      seed: baselineRun.seed,
      baselineOutcomeId: baselineRun.outcomeId,
      comparisonOutcomeId: comparisonRun.outcomeId,
      objectives: input.definition.objectives.map(({ id: objectiveId }) => {
        const baselineObjective = findObjective(baselineRun.objectives, objectiveId);
        const comparisonObjective = findObjective(comparisonRun.objectives, objectiveId);
        return {
          objectiveId,
          baselineProgress: baselineObjective.progress,
          comparisonProgress: comparisonObjective.progress,
          delta: rounded(comparisonObjective.progress - baselineObjective.progress),
        };
      }),
    };
  });

  return {
    battleId: input.definition.id,
    baseline,
    comparison,
    pairs,
  };
}
