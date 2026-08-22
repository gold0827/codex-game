import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleObjectiveEvidence,
  AutonomousBattleObjectiveSnapshot,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../domain/operation/autonomousBattle";
import type { RandomSeed } from "../simulation/seededRandom";

type AutonomousBattleTerminalResolution = Extract<
  AutonomousBattleSnapshot["resolution"],
  { state: "resolved" }
>;
type AutonomousBattleDisposition = AutonomousBattleTerminalResolution["disposition"];
type NumberEvidence = Extract<AutonomousBattleObjectiveEvidence, { kind: "number" }>;
type BooleanEvidence = Extract<AutonomousBattleObjectiveEvidence, { kind: "boolean" }>;
type StringEvidence = Extract<AutonomousBattleObjectiveEvidence, { kind: "string" }>;

type EvidenceDistributionBase = Readonly<{
  evidenceId: string;
  label: string;
  satisfactionCount: number;
  satisfactionRate: number;
}>;

export type AutonomousBattleObjectiveEvidenceDistribution =
  | Readonly<EvidenceDistributionBase & {
      kind: "number";
      required: NumberEvidence["required"];
      comparator: NumberEvidence["comparator"];
      unit: NumberEvidence["unit"];
      observedSamples: readonly NumberEvidence["observed"][];
    }>
  | Readonly<EvidenceDistributionBase & {
      kind: "boolean";
      required: BooleanEvidence["required"];
      comparator: BooleanEvidence["comparator"];
      observedSamples: readonly BooleanEvidence["observed"][];
    }>
  | Readonly<EvidenceDistributionBase & {
      kind: "string";
      required: StringEvidence["required"];
      comparator: StringEvidence["comparator"];
      observedSamples: readonly StringEvidence["observed"][];
    }>;

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
  evidence: readonly AutonomousBattleObjectiveEvidenceDistribution[];
}>;

export type AutonomousBattleDispositionDistributionEntry = Readonly<{
  disposition: AutonomousBattleDisposition;
  count: number;
  share: number;
}>;

export type AutonomousBattleEvaluationRun = Readonly<{
  seed: RandomSeed;
  outcomeId: string;
  disposition: AutonomousBattleDisposition;
  objectives: readonly AutonomousBattleObjectiveSnapshot[];
}>;

export type AutonomousBattleEvaluation = Readonly<{
  battleId: string;
  runCount: number;
  outcomes: readonly AutonomousBattleOutcomeDistributionEntry[];
  dispositions: readonly AutonomousBattleDispositionDistributionEntry[];
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
    baselineDisposition: AutonomousBattleDisposition;
    comparisonDisposition: AutonomousBattleDisposition;
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

function assertSameEvidenceCriterion(
  reference: AutonomousBattleObjectiveEvidence,
  sample: AutonomousBattleObjectiveEvidence,
): void {
  const changed = sample.kind !== reference.kind || sample.label !== reference.label;
  if (changed) {
    throw new RangeError(`Autonomous battle evidence ${reference.id} changed identity across runs.`);
  }
  if (reference.kind === "number") {
    if (sample.kind !== "number" || sample.required !== reference.required ||
        sample.comparator !== reference.comparator || sample.unit !== reference.unit) {
      throw new RangeError(`Autonomous battle evidence ${reference.id} changed identity across runs.`);
    }
    return;
  }
  if (reference.kind === "boolean") {
    if (sample.kind !== "boolean" || sample.required !== reference.required ||
        sample.comparator !== reference.comparator) {
      throw new RangeError(`Autonomous battle evidence ${reference.id} changed identity across runs.`);
    }
    return;
  }
  if (sample.kind !== "string" || sample.required !== reference.required ||
      sample.comparator !== reference.comparator) {
    throw new RangeError(`Autonomous battle evidence ${reference.id} changed identity across runs.`);
  }
}

function evidenceDistribution(
  reference: AutonomousBattleObjectiveEvidence,
  samples: readonly AutonomousBattleObjectiveEvidence[],
): AutonomousBattleObjectiveEvidenceDistribution {
  samples.forEach((sample) => assertSameEvidenceCriterion(reference, sample));
  const satisfactionCount = samples.filter(({ satisfied }) => satisfied).length;
  const common = {
    evidenceId: reference.id,
    label: reference.label,
    satisfactionCount,
    satisfactionRate: rounded(satisfactionCount / samples.length),
  };
  if (reference.kind === "number") {
    return {
      ...common,
      kind: reference.kind,
      required: reference.required,
      comparator: reference.comparator,
      unit: reference.unit,
      observedSamples: samples.map((sample) => {
        if (sample.kind !== "number") throw new Error("Validated evidence kind changed.");
        return sample.observed;
      }),
    };
  }
  if (reference.kind === "boolean") {
    return {
      ...common,
      kind: reference.kind,
      required: reference.required,
      comparator: reference.comparator,
      observedSamples: samples.map((sample) => {
        if (sample.kind !== "boolean") throw new Error("Validated evidence kind changed.");
        return sample.observed;
      }),
    };
  }
  return {
    ...common,
    kind: reference.kind,
    required: reference.required,
    comparator: reference.comparator,
    observedSamples: samples.map((sample) => {
      if (sample.kind !== "string") throw new Error("Validated evidence kind changed.");
      return sample.observed;
    }),
  };
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
      disposition: snapshot.resolution.disposition,
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
  const dispositions = (["success", "failure"] as const).map((disposition) => {
    const count = runs.filter((run) => run.disposition === disposition).length;
    return { disposition, count, share: rounded(count / runs.length) };
  });
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
        return sample;
      });
      return evidenceDistribution(firstEvidence, evidenceSamples);
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
    dispositions,
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
      baselineDisposition: baselineRun.disposition,
      comparisonDisposition: comparisonRun.disposition,
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
