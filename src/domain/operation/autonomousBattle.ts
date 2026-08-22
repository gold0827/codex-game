import type {
  AutonomousBattleActorDefinition,
  AutonomousBattleDefinition,
} from "../../campaign/autonomousBattleDefinition";
import type { RandomSeed } from "../../simulation/seededRandom";

export type {
  AutonomousBattleActorDefinition,
  AutonomousBattleDefinition,
  AutonomousBattleFormationDefinition,
  AutonomousBattleFormationEntry,
  AutonomousBattleObjectiveDefinition,
} from "../../campaign/autonomousBattleDefinition";

/**
 * The single public seam for an autonomous operation.
 *
 * Implementations own perception, beliefs, random streams, queues, action
 * scoring, combat, movement, and complete history. Callers only observe the
 * current operation and the latest completed decision for each actor.
 */
export interface AutonomousBattleHarnessPolicies {
  readonly informationReach: number;
  readonly authorityClarity: number;
  readonly verificationDepth: number;
  readonly feedbackCompression: number;
}

export type AutonomousBattleHarnessConsequenceCode =
  | "information-saturation"
  | "ambiguous-authority"
  | "verification-congestion"
  | "noisy-feedback"
  | "over-centralization";

export type AutonomousBattleHarnessConsequence = Readonly<{
  code: AutonomousBattleHarnessConsequenceCode;
  axis: keyof AutonomousBattleHarnessPolicies;
  severity: number;
}>;

export type AutonomousBattleHarnessSnapshot = Readonly<{
  policies: AutonomousBattleHarnessPolicies;
  consequences: readonly AutonomousBattleHarnessConsequence[];
}>;

export type AutonomousBattleDecisionTrace = Readonly<{
  id: string;
  actorId: string;
  startedAtMs: number;
  completedAtMs: number;
  information: Readonly<{
    atMs: number;
    state: "received" | "missed";
    observationId: string | null;
    confidence: number;
  }>;
  verification: Readonly<{
    atMs: number;
    observationId: string | null;
    state: "verified" | "contradicted" | "skipped";
    confidence: number;
  }>;
  authority: Readonly<{
    atMs: number;
    state: "clear" | "ambiguous" | "self-directed";
    intentId: string | null;
    confidence: number;
  }>;
  action: Readonly<{
    atMs: number;
    state: "executed" | "failed" | "deferred";
    behaviorId: string;
    targetId: string | null;
    confidence: number;
  }>;
  feedback: Readonly<{
    atMs: number;
    sourceActionTraceId: string | null;
    state: "integrated" | "missing" | "ignored";
    outcomeId: string | null;
    confidence: number;
  }>;
}>;

export type AutonomousBattleActorCondition =
  | "effective"
  | "suppressed"
  | "withdrawn"
  | "lost";

export type AutonomousBattleActorSnapshot = Readonly<{
  id: string;
  label: string;
  role: string;
  profile: AutonomousBattleActorDefinition["profile"];
  variability: AutonomousBattleActorDefinition["variability"];
  condition: AutonomousBattleActorCondition;
  latestDecision: AutonomousBattleDecisionTrace | null;
}>;

export type AutonomousBattleFormationSnapshot = Readonly<{
  id: string;
  label: string;
  sideId: string;
  active: boolean;
  locationId: string;
  intentId: string;
  actors: readonly AutonomousBattleActorSnapshot[];
}>;

export type AutonomousBattleObjectiveEvidence =
  | Readonly<{
      id: string;
      label: string;
      kind: "number";
      observed: number;
      required: number;
      comparator: "at-least" | "at-most" | "equal";
      unit: "ratio" | "count" | "milliseconds" | "score";
      satisfied: boolean;
    }>
  | Readonly<{
      id: string;
      label: string;
      kind: "boolean";
      observed: boolean;
      required: boolean;
      comparator: "equal";
      satisfied: boolean;
    }>
  | Readonly<{
      id: string;
      label: string;
      kind: "string";
      observed: string;
      required: string;
      comparator: "equal" | "not-equal";
      satisfied: boolean;
    }>;

export type AutonomousBattleObjectiveSnapshot = Readonly<{
  id: string;
  label: string;
  required: boolean;
  progress: number;
  state: "active" | "achieved" | "failed";
  evidence: readonly AutonomousBattleObjectiveEvidence[];
}>;

export type AutonomousBattleResolution =
  | Readonly<{ state: "running" }>
  | Readonly<{
      state: "resolved";
      disposition: "success" | "failure";
      outcomeId: string;
      resolvedAtMs: number;
    }>;

export type AutonomousBattleInterventionBudgetSnapshot = Readonly<{
  available: number;
  spent: number;
  remaining: number;
  count: number;
}>;

export type AutonomousBattleEvent =
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "formation-activated";
      formationId: string;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "formation-intent-changed";
      formationId: string;
      intentId: string;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "actor-decision";
      actorId: string;
      traceId: string;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "actor-condition-changed";
      actorId: string;
      condition: AutonomousBattleActorCondition;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "objective-state-changed";
      objectiveId: string;
      state: "active" | "achieved" | "failed";
      progress: number;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "harness-consequence";
      consequence: AutonomousBattleHarnessConsequence;
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "intervention-applied";
      receiptId: string;
      affectedFormationIds: readonly string[];
    }>
  | Readonly<{
      sequence: number;
      atMs: number;
      kind: "operation-resolved";
      disposition: "success" | "failure";
      outcomeId: string;
    }>;

export type AutonomousBattleRecentEvents = Readonly<{
  capacity: number;
  firstSequence: number;
  nextSequence: number;
  items: readonly AutonomousBattleEvent[];
}>;

export type AutonomousBattleSnapshot = Readonly<{
  battleId: string;
  elapsedMs: number;
  durationMs: number;
  resolution: AutonomousBattleResolution;
  harness: AutonomousBattleHarnessSnapshot;
  formations: readonly AutonomousBattleFormationSnapshot[];
  objectives: readonly AutonomousBattleObjectiveSnapshot[];
  interventionBudget: AutonomousBattleInterventionBudgetSnapshot;
  recentEvents: AutonomousBattleRecentEvents;
}>;

/** Formation-level exceptions only; individual actors are never command targets. */
export type AutonomousBattleIntervention =
  | Readonly<{
      kind: "set-formation-intent";
      formationId: string;
      intentId: string;
    }>
  | Readonly<{
      kind: "issue-guidance";
      guidanceId: string;
      recipientFormationIds: readonly string[];
    }>;

export type AutonomousBattleInterventionReceipt =
  | Readonly<{
      status: "accepted";
      id: string;
      kind: AutonomousBattleIntervention["kind"];
      appliedAtMs: number;
      cost: number;
      affectedFormationIds: readonly string[];
    }>
  | Readonly<{
      status: "rejected";
      id: string;
      kind: AutonomousBattleIntervention["kind"];
      rejectedAtMs: number;
      reason: "insufficient-budget" | "operation-resolved";
      cost: 0;
      affectedFormationIds: readonly string[];
    }>;

export type AutonomousBattleInterventionResult = Readonly<{
  snapshot: AutonomousBattleSnapshot;
  receipt: AutonomousBattleInterventionReceipt;
}>;

export interface AutonomousBattleSimulation {
  snapshot(): AutonomousBattleSnapshot;
  advance(deltaMs: number): AutonomousBattleSnapshot;
  intervene(intervention: AutonomousBattleIntervention): AutonomousBattleInterventionResult;
}

export type AutonomousBattleSimulationOptions = Readonly<{
  seed: RandomSeed;
  harness: AutonomousBattleHarnessPolicies;
  interventionBudget: number;
}>;

export type AutonomousBattleSimulationFactory = (
  definition: AutonomousBattleDefinition,
  options: AutonomousBattleSimulationOptions,
) => AutonomousBattleSimulation;
