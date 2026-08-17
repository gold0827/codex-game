import type { CampaignOfficer, CampaignScene } from "../campaign/types";
import { createOperationSimulation } from "./operationSimulation";
import {
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type OfficerIntent,
  type OperationEvent,
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

export type OperationFailureReason =
  | "civilian-safety-below-threshold"
  | "logistics-below-threshold"
  | "readiness-below-threshold"
  | "required-autonomous-replan-missing"
  | "threat-control-below-threshold";

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
}>;

export type OperationEvaluation = Readonly<{
  schemaVersion: 1;
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
  schemaVersion: 1;
  sceneId: string;
  seedRange: OperationSeedRange;
  baseline: OperationEvaluation;
  comparison: OperationEvaluation;
  outcomeDistribution: readonly DistributionEntry[];
  successRateDelta: number;
  firstReactionTimeDeltaMs: NumericDistribution;
  interventionCountDelta: NumericDistribution;
  pairs: readonly Readonly<{
    seed: number;
    baselineSuccess: boolean;
    comparisonSuccess: boolean;
    firstReactionTimeDeltaMs: number | null;
    interventionCountDelta: number;
  }>[];
}>;

const FAILURE_REASON_ORDER: readonly OperationFailureReason[] = [
  "civilian-safety-below-threshold",
  "logistics-below-threshold",
  "readiness-below-threshold",
  "required-autonomous-replan-missing",
  "threat-control-below-threshold",
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

function readNumber(event: OperationEvent | undefined, key: string): number | null {
  const value = event?.data[key];
  return typeof value === "number" ? value : null;
}

function readBoolean(
  event: OperationEvent | undefined,
  key: string,
): boolean | null {
  const value = event?.data[key];
  return typeof value === "boolean" ? value : null;
}

function requiresAutonomousReplan(scene: CampaignScene): boolean {
  const threatKinds = new Set(
    scene.beats.flatMap((beat) => beat.threats.map(({ kind }) => kind)),
  );
  return (
    threatKinds.size >= 3 &&
    scene.beats.some((beat) =>
      beat.threats.some(({ kind }) => kind === "misinformation"),
    )
  );
}

function failureReasons(
  scene: CampaignScene,
  snapshot: OperationSnapshot,
  outcomeEvent: OperationEvent | undefined,
): OperationFailureReason[] {
  if (snapshot.status === "success") return [];

  const reasons = new Set<OperationFailureReason>();
  const readiness = readNumber(outcomeEvent, "readiness");
  const blockedThreats = readNumber(outcomeEvent, "blockedThreats");
  const threatCount = readNumber(outcomeEvent, "threatCount");
  const autonomousReplan = readBoolean(outcomeEvent, "autonomousReplan");
  const interventionCount = readNumber(outcomeEvent, "interventionCount");

  if (readiness !== null && readiness < 0.52) {
    reasons.add("readiness-below-threshold");
  }
  if (
    blockedThreats !== null &&
    threatCount !== null &&
    blockedThreats / Math.max(1, threatCount) < 0.6
  ) {
    reasons.add("threat-control-below-threshold");
  }
  if (snapshot.metrics.civilianSafety < 65) {
    reasons.add("civilian-safety-below-threshold");
  }
  if (snapshot.metrics.logistics < 65) {
    reasons.add("logistics-below-threshold");
  }
  if (
    requiresAutonomousReplan(scene) &&
    (autonomousReplan !== true || interventionCount !== 0)
  ) {
    reasons.add("required-autonomous-replan-missing");
  }

  return FAILURE_REASON_ORDER.filter((reason) => reasons.has(reason));
}

type MeasuredRun = Readonly<{
  result: OperationRunEvaluation;
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
  const outcomeEvent = events.find(({ kind }) => kind === "outcome");
  const intents = events
    .filter(({ kind }) => kind === "decision")
    .map(({ data }) => data.intent)
    .filter((intent): intent is OfficerIntent => typeof intent === "string");
  const firstReaction = events.find(({ kind }) => kind === "decision");
  const routes = snapshot.units.map(({ route }) =>
    route.length === 0 ? "stationary" : route.join(">"),
  );
  const reasons = failureReasons(scene, snapshot, outcomeEvent);

  return {
    result: {
      seed,
      success: snapshot.status === "success",
      outcomeId: snapshot.outcomeId,
      failureReasons: reasons,
      firstReactionTimeMs: firstReaction?.timeMs ?? null,
      uniqueIntentCount: new Set(intents).size,
      interventionCount: snapshot.metrics.interventionCount,
    },
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
  const intents = measuredRuns.flatMap(({ intents: runIntents }) => runIntents);
  const routes = measuredRuns.flatMap(({ routes: runRoutes }) => runRoutes);

  return {
    schemaVersion: 1,
    sceneId: input.scene.identity.id,
    policyId: input.policy.id,
    seedRange: { start: input.seedRange.start, count: input.seedRange.count },
    runCount: runs.length,
    successCount: successfulRuns.length,
    successRate: rounded(successfulRuns.length / runs.length),
    failureReasons: distribution(failureReasonValues, FAILURE_REASON_ORDER),
    actionDistribution: distribution(intents),
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
    };
  });
  const pairedOutcomes = pairs.map((pair) => {
    if (pair.baselineSuccess && pair.comparisonSuccess) return "both-succeeded";
    if (pair.baselineSuccess) return "baseline-only-succeeded";
    if (pair.comparisonSuccess) return "comparison-only-succeeded";
    return "both-failed";
  });

  return {
    schemaVersion: 1,
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
    pairs,
  };
}
