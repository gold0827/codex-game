import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleObjectiveEvidence,
  AutonomousBattleObjectiveSnapshot,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../domain/operation/autonomousBattle";
import type { RandomSeed } from "../simulation/seededRandom";

export type AutonomousBattleOutcomeDistributionEntry = Readonly<{
  outcomeId: string;
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
  states: readonly Readonly<{
    state: Exclude<AutonomousBattleObjectiveSnapshot["state"], "active">;
    count: number;
    share: number;
  }>[];
  evidence: readonly Readonly<{
    evidenceId: string;
    label: string;
    kind: AutonomousBattleObjectiveEvidence["kind"];
    observedSamples: readonly AutonomousBattleObjectiveEvidence["observed"][];
    satisfactionCount: number;
    satisfactionRate: number;
  }>[];
}>;

export type AutonomousBattleEvaluationRun = Readonly<{
  seed: RandomSeed;
  outcomeId: string;
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
    baselineOutcomeId: string;
    comparisonOutcomeId: string;
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

function compareOutcomeIds(left: string, right: string): number {
  if (left === right) return 0;
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
    {
      seed,
      harness: structuredClone(input.harness),
      interventionBudget: 0,
    },
  );
  let snapshot = simulation.snapshot();
  let remainingMs = input.definition.durationMs;

  while (snapshot.resolution.state === "running" && remainingMs > 0) {
    const deltaMs = Math.min(input.stepMs, remainingMs);
    snapshot = simulation.advance(deltaMs);
    remainingMs -= deltaMs;
  }
  if (snapshot.resolution.state === "running") {
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
  if (objective.state === "active") {
    throw new RangeError(`Terminal autonomous battle objective ${objectiveId} remains active.`);
  }
  return objective;
}

function findEvidence(
  objective: AutonomousBattleObjectiveSnapshot,
  evidenceId: string,
): AutonomousBattleObjectiveEvidence {
  const evidence = objective.evidence.find(({ id }) => id === evidenceId);
  if (!evidence) {
    throw new RangeError(
      `Autonomous battle objective ${objective.id} is missing evidence ${evidenceId}.`,
    );
  }
  return evidence;
}

export function evaluateAutonomousBattles(
  input: EvaluateAutonomousBattlesInput,
): AutonomousBattleEvaluation {
  assertEvaluationInput(input);
  const runs = input.seeds.map((seed): AutonomousBattleEvaluationRun => {
    const snapshot = terminalSnapshot(input, seed);
    if (snapshot.resolution.state !== "resolved") {
      throw new RangeError(`Autonomous battle ${input.definition.id} has no terminal resolution.`);
    }
    return {
      seed,
      outcomeId: snapshot.resolution.outcomeId,
      objectives: input.definition.objectives.map(({ id }) => ({
        ...findObjective(snapshot.objectives, id),
      })),
    };
  });
  const outcomeCounts = new Map<string, number>();
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
    const completionCount = samples.filter(({ state }) => state === "achieved").length;
    const states = (["achieved", "failed"] as const).flatMap((state) => {
      const count = samples.filter((objective) => objective.state === state).length;
      return count === 0 ? [] : [{ state, count, share: rounded(count / samples.length) }];
    });
    const firstObjective = samples[0];
    if (!firstObjective) {
      throw new RangeError(`Autonomous battle objective ${objectiveId} has no evaluation samples.`);
    }
    const evidence = firstObjective.evidence.map((firstEvidence) => {
      const evidenceSamples = samples.map((objective) => {
        const sample = findEvidence(objective, firstEvidence.id);
        if (sample.kind !== firstEvidence.kind || sample.label !== firstEvidence.label) {
          throw new RangeError(
            `Autonomous battle evidence ${firstEvidence.id} changed identity across runs.`,
          );
        }
        return sample;
      });
      const satisfactionCount = evidenceSamples.filter(({ satisfied }) => satisfied).length;
      return {
        evidenceId: firstEvidence.id,
        label: firstEvidence.label,
        kind: firstEvidence.kind,
        observedSamples: evidenceSamples.map(({ observed }) => observed),
        satisfactionCount,
        satisfactionRate: rounded(satisfactionCount / evidenceSamples.length),
      };
    });
    return {
      objectiveId,
      samples: progress,
      minimum: Math.min(...progress),
      maximum: Math.max(...progress),
      mean: rounded(progress.reduce((total, value) => total + value, 0) / progress.length),
      completionCount,
      completionRate: rounded(completionCount / samples.length),
      states,
      evidence,
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
