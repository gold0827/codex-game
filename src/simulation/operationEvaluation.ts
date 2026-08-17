import type { CampaignOfficer, CampaignScene } from "../campaign/types";
import { createOperationSimulation } from "../domain/operation/operationEngine";
import {
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type OfficerIntent,
  type OperationFailureCauseCode,
  type OperationIntervention,
  type OperationSnapshot,
} from "./simulationTypes";

export type OperationSeedRange = Readonly<{
  start: number;
  count: number;
}>;

export type OperationPolicyContext = Readonly<{
  seed: number;
  snapshot: OperationSnapshot;
}>;

export type OperationPolicyAdapter = Readonly<{
  id: string;
  decide: (
    context: OperationPolicyContext,
  ) => readonly OperationIntervention[];
}>;

export type ScriptedPolicyStep = Readonly<{
  atMs: number;
  intervention: OperationIntervention;
}>;

export type OperationFailureReason = OperationFailureCauseCode;

export type DistributionEntry = Readonly<{
  value: string;
  count: number;
  share: number;
}>;

export type NumericDistribution = Readonly<{
  observedCount: number;
  missingCount: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  p50: number | null;
  p95: number | null;
}>;

export type OperationRunEvaluation = Readonly<{
  seed: number;
  success: boolean;
  outcomeId: string | null;
  failureReasons: readonly OperationFailureReason[];
  firstReactionTimeMs: number | null;
  uniqueIntentCount: number;
  interventionCount: number;
  damageTaken: number;
  threatsBlocked: number;
  worldOutcome: string;
}>;

export type OperationEvaluation = Readonly<{
  schemaVersion: 2;
  sceneId: string;
  policyId: string;
  seedRange: OperationSeedRange;
  runCount: number;
  successCount: number;
  successRate: number;
  failureReasons: readonly DistributionEntry[];
  actionDistribution: readonly DistributionEntry[];
  routeDistribution: readonly DistributionEntry[];
  firstReactionTimeMs: NumericDistribution;
  intentDiversity: Readonly<{
    uniqueIntentCount: number;
    uniqueIntentsPerRun: NumericDistribution;
  }>;
  interventionCount: NumericDistribution;
  damageTaken: NumericDistribution;
  threatsBlocked: NumericDistribution;
  terminalStatusDistribution: readonly DistributionEntry[];
  worldOutcomeDiversity: number;
  unclassifiedFailureCount: number;
  runs: readonly OperationRunEvaluation[];
}>;

export type EvaluateOperationsInput = Readonly<{
  scene: CampaignScene;
  roster: readonly CampaignOfficer[];
  seedRange: OperationSeedRange;
  harness: HarnessConfiguration;
  policy: OperationPolicyAdapter;
}>;

export type CompareOperationPoliciesInput = Readonly<
  Omit<EvaluateOperationsInput, "policy"> & {
    baselinePolicy: OperationPolicyAdapter;
    comparisonPolicy: OperationPolicyAdapter;
  }
>;

export type PairedOperationEvaluation = Readonly<{
  schemaVersion: 2;
  sceneId: string;
  seedRange: OperationSeedRange;
  baseline: OperationEvaluation;
  comparison: OperationEvaluation;
  outcomeDistribution: readonly DistributionEntry[];
  successRateDelta: number;
  firstReactionTimeDeltaMs: NumericDistribution;
  interventionCountDelta: NumericDistribution;
  damageTakenDelta: NumericDistribution;
  threatsBlockedDelta: NumericDistribution;
  pairs: readonly Readonly<{
    seed: number;
    baselineSuccess: boolean;
    comparisonSuccess: boolean;
    firstReactionTimeDeltaMs: number | null;
    interventionCountDelta: number;
    damageTakenDelta: number;
    threatsBlockedDelta: number;
  }>[];
}>;

const FAILURE_REASON_ORDER: readonly OperationFailureReason[] = [
  "vehicle-not-arrived",
  "point-not-preserved",
  "civilian-survival-failed",
  "threat-not-neutralized",
  "report-not-routed",
  "report-not-verified",
  "shared-belief-not-aligned",
  "command-channel-congested",
  "autonomous-replan-not-achieved",
];

const PAIRED_OUTCOME_ORDER = [
  "both-succeeded",
  "baseline-only-succeeded",
  "comparison-only-succeeded",
  "both-failed",
] as const;

export const NO_INTERVENTION_POLICY: OperationPolicyAdapter = Object.freeze({
  id: "no-intervention",
  decide: () => [],
});

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function assertPolicyId(id: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("An operation policy must have a non-empty identifier.");
  }
}

function seedsFromRange(seedRange: OperationSeedRange): number[] {
  if (!Number.isSafeInteger(seedRange.start)) {
    throw new RangeError("An operation seed range must start at a safe integer.");
  }
  if (!Number.isSafeInteger(seedRange.count) || seedRange.count <= 0) {
    throw new RangeError("An operation seed range must have a positive safe count.");
  }
  const finalSeed = seedRange.start + seedRange.count - 1;
  if (!Number.isSafeInteger(finalSeed)) {
    throw new RangeError("Every seed in an operation seed range must be a safe integer.");
  }
  return Array.from({ length: seedRange.count }, (_, index) => seedRange.start + index);
}

function distribution(
  values: readonly string[],
  preferredOrder?: readonly string[],
): DistributionEntry[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  const keys = preferredOrder
    ? preferredOrder.filter((value) => counts.has(value))
    : [...counts.keys()].sort(compareText);

  return keys.map((value) => ({
    value,
    count: counts.get(value) ?? 0,
    share: values.length === 0 ? 0 : rounded((counts.get(value) ?? 0) / values.length),
  }));
}

function numericDistribution(
  values: readonly (number | null)[],
): NumericDistribution {
  const observed = values
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (observed.length === 0) {
    return {
      observedCount: 0,
      missingCount: values.length,
      minimum: null,
      maximum: null,
      mean: null,
      p50: null,
      p95: null,
    };
  }

  const percentile = (fraction: number): number =>
    observed[Math.max(0, Math.ceil(observed.length * fraction) - 1)] as number;
  const total = observed.reduce((sum, value) => sum + value, 0);
  return {
    observedCount: observed.length,
    missingCount: values.length - observed.length,
    minimum: observed[0] as number,
    maximum: observed.at(-1) as number,
    mean: rounded(total / observed.length),
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}

function failureReasons(
  snapshot: OperationSnapshot,
): OperationFailureReason[] {
  if (snapshot.status === "success") return [];
  const reasons = new Set(snapshot.result?.failureCauses.map(({ code }) => code) ?? []);
  return FAILURE_REASON_ORDER.filter((reason) => reasons.has(reason));
}

type MeasuredRun = Readonly<{
  result: OperationRunEvaluation;
  actions: readonly string[];
  intents: readonly OfficerIntent[];
  routes: readonly string[];
}>;

function measureRun(
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
  seed: number,
  harness: HarnessConfiguration,
  policy: OperationPolicyAdapter,
): MeasuredRun {
  const simulation = createOperationSimulation(scene, roster, seed, harness);
  let snapshot = simulation.snapshot();

  while (snapshot.status === "running") {
    const interventions = policy.decide({ seed, snapshot });
    if (!Array.isArray(interventions)) {
      throw new TypeError("An operation policy must return an intervention array.");
    }
    interventions.forEach((intervention) => simulation.intervene(intervention));
    snapshot = simulation.advance(
      Math.min(OPERATION_FIXED_STEP_MS, snapshot.durationMs - snapshot.elapsedMs),
    );
  }

  const events = simulation.events();
  const decisions = events
    .filter(({ kind }) => kind === "decision")
    .map(({ data }) => data);
  const actions = decisions
    .map(({ action }) => action)
    .filter((action): action is string => typeof action === "string");
  const intents = decisions
    .map(({ intent }) => intent)
    .filter((intent): intent is OfficerIntent => typeof intent === "string");
  const firstReaction = events.find(({ kind }) => kind === "decision");
  const routes = snapshot.units.map(({ officerId, tile }) =>
    `${officerId}@${tile.x},${tile.y}`,
  );
  const reasons = failureReasons(snapshot);
  const damageTaken = rounded(snapshot.units.reduce(
    (total, { health }) => total + Math.max(0, 100 - health),
    0,
  ));
  const threatsBlocked = snapshot.threats.filter(({ result }) => result === "blocked").length;
  const worldOutcome = JSON.stringify({
    status: snapshot.status,
    threats: snapshot.threats.map(({ result }) => result),
    health: snapshot.units.map(({ health }) => health),
    safety: snapshot.metrics.civilianSafety,
  });

  return {
    result: {
      seed,
      success: snapshot.status === "success",
      outcomeId: snapshot.outcomeId,
      failureReasons: reasons,
      firstReactionTimeMs: firstReaction?.timeMs ?? null,
      uniqueIntentCount: new Set(intents).size,
      interventionCount: snapshot.metrics.interventionCount,
      damageTaken,
      threatsBlocked,
      worldOutcome,
    },
    actions,
    intents,
    routes,
  };
}

export function createScriptedPolicy(
  id: string,
  suppliedSteps: readonly ScriptedPolicyStep[],
): OperationPolicyAdapter {
  assertPolicyId(id);
  if (!Array.isArray(suppliedSteps)) {
    throw new TypeError("Scripted operation policy steps must be an array.");
  }
  const steps = suppliedSteps.map((step, index) => {
    if (
      !Number.isSafeInteger(step.atMs) ||
      step.atMs < 0 ||
      step.atMs % OPERATION_FIXED_STEP_MS !== 0
    ) {
      throw new RangeError(
        `Scripted operation policy step ${index} must use a non-negative fixed-step time.`,
      );
    }
    return structuredClone(step);
  });

  return Object.freeze({
    id,
    decide: ({ snapshot }: OperationPolicyContext) =>
      steps
        .filter(({ atMs }) => atMs === snapshot.elapsedMs)
        .map(({ intervention }) => structuredClone(intervention)),
  });
}

export function evaluateOperations(
  input: EvaluateOperationsInput,
): OperationEvaluation {
  assertPolicyId(input.policy.id);
  const seeds = seedsFromRange(input.seedRange);
  const measuredRuns = seeds.map((seed) =>
    measureRun(input.scene, input.roster, seed, input.harness, input.policy),
  );
  const runs = measuredRuns.map(({ result }) => result);
  const successfulRuns = runs.filter(({ success }) => success);
  const failureReasonValues = runs.flatMap(({ failureReasons: reasons }) => reasons);
  const actions = measuredRuns.flatMap(({ actions: runActions }) => runActions);
  const intents = measuredRuns.flatMap(({ intents: runIntents }) => runIntents);
  const routes = measuredRuns.flatMap(({ routes: runRoutes }) => runRoutes);

  return {
    schemaVersion: 2,
    sceneId: input.scene.identity.id,
    policyId: input.policy.id,
    seedRange: { start: input.seedRange.start, count: input.seedRange.count },
    runCount: runs.length,
    successCount: successfulRuns.length,
    successRate: rounded(successfulRuns.length / runs.length),
    failureReasons: distribution(failureReasonValues, FAILURE_REASON_ORDER),
    actionDistribution: distribution(actions),
    routeDistribution: distribution(routes),
    firstReactionTimeMs: numericDistribution(
      runs.map(({ firstReactionTimeMs }) => firstReactionTimeMs),
    ),
    intentDiversity: {
      uniqueIntentCount: new Set(intents).size,
      uniqueIntentsPerRun: numericDistribution(
        runs.map(({ uniqueIntentCount }) => uniqueIntentCount),
      ),
    },
    interventionCount: numericDistribution(
      runs.map(({ interventionCount }) => interventionCount),
    ),
    damageTaken: numericDistribution(runs.map(({ damageTaken }) => damageTaken)),
    threatsBlocked: numericDistribution(runs.map(({ threatsBlocked }) => threatsBlocked)),
    terminalStatusDistribution: distribution(
      runs.map(({ success }) => success ? "success" : "retry"),
      ["success", "retry"],
    ),
    worldOutcomeDiversity: new Set(runs.map(({ worldOutcome }) => worldOutcome)).size,
    unclassifiedFailureCount: runs.filter(
      ({ success, failureReasons: reasons }) => !success && reasons.length === 0,
    ).length,
    runs,
  };
}

export function compareOperationPolicies(
  input: CompareOperationPoliciesInput,
): PairedOperationEvaluation {
  const commonInput = {
    scene: input.scene,
    roster: input.roster,
    seedRange: input.seedRange,
    harness: input.harness,
  };
  const baseline = evaluateOperations({
    ...commonInput,
    policy: input.baselinePolicy,
  });
  const comparison = evaluateOperations({
    ...commonInput,
    policy: input.comparisonPolicy,
  });
  const pairs = baseline.runs.map((baselineRun, index) => {
    const comparisonRun = comparison.runs[index] as OperationRunEvaluation;
    const bothReactionTimesExist =
      baselineRun.firstReactionTimeMs !== null &&
      comparisonRun.firstReactionTimeMs !== null;
    return {
      seed: baselineRun.seed,
      baselineSuccess: baselineRun.success,
      comparisonSuccess: comparisonRun.success,
      firstReactionTimeDeltaMs: bothReactionTimesExist
        ? (comparisonRun.firstReactionTimeMs as number) -
          (baselineRun.firstReactionTimeMs as number)
        : null,
      interventionCountDelta:
        comparisonRun.interventionCount - baselineRun.interventionCount,
      damageTakenDelta: comparisonRun.damageTaken - baselineRun.damageTaken,
      threatsBlockedDelta: comparisonRun.threatsBlocked - baselineRun.threatsBlocked,
    };
  });
  const pairedOutcomes = pairs.map((pair) => {
    if (pair.baselineSuccess && pair.comparisonSuccess) return "both-succeeded";
    if (pair.baselineSuccess) return "baseline-only-succeeded";
    if (pair.comparisonSuccess) return "comparison-only-succeeded";
    return "both-failed";
  });

  return {
    schemaVersion: 2,
    sceneId: input.scene.identity.id,
    seedRange: { start: input.seedRange.start, count: input.seedRange.count },
    baseline,
    comparison,
    outcomeDistribution: distribution(pairedOutcomes, PAIRED_OUTCOME_ORDER),
    successRateDelta: rounded(comparison.successRate - baseline.successRate),
    firstReactionTimeDeltaMs: numericDistribution(
      pairs.map(({ firstReactionTimeDeltaMs }) => firstReactionTimeDeltaMs),
    ),
    interventionCountDelta: numericDistribution(
      pairs.map(({ interventionCountDelta }) => interventionCountDelta),
    ),
    damageTakenDelta: numericDistribution(
      pairs.map(({ damageTakenDelta }) => damageTakenDelta),
    ),
    threatsBlockedDelta: numericDistribution(
      pairs.map(({ threatsBlockedDelta }) => threatsBlockedDelta),
    ),
    pairs,
  };
}
