import type { AgentProfile } from "../../campaign/types";
import type { RandomSeed } from "../../simulation/seededRandom";

/**
 * Public boundary for an autonomous battle adapter.
 *
 * This file describes wiring, not combat rules. Implementations decide how actors
 * perceive, choose, move, and fight while preserving these stable identities.
 */
export interface AutonomousBattleActorDefinition {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly profile: AgentProfile;
  readonly variability: Readonly<{
    readonly decisionNoise: number;
    readonly executionNoise: number;
  }>;
}

export type AutonomousBattleFormationEntry =
  | Readonly<{ kind: "present" }>
  | Readonly<{ kind: "elapsed"; atMs: number }>;

export interface AutonomousBattleFormationDefinition {
  readonly id: string;
  readonly label: string;
  readonly sideId: string;
  readonly initialLocationId: string;
  readonly initialIntentId: string;
  readonly entry: AutonomousBattleFormationEntry;
  readonly actors: readonly AutonomousBattleActorDefinition[];
}

export interface AutonomousBattleObjectiveDefinition {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
}

export interface AutonomousBattleDefinition {
  readonly id: string;
  readonly durationMs: number;
  /** Scenario-authored collections deliberately have no fixed formation or actor count. */
  readonly formations: readonly AutonomousBattleFormationDefinition[];
  readonly objectives: readonly AutonomousBattleObjectiveDefinition[];
}

export interface AutonomousBattleHarnessPolicies {
  readonly informationReach: number;
  readonly authorityClarity: number;
  readonly verificationDepth: number;
  readonly feedbackCompression: number;
}

export type AutonomousBattleActorCondition = "effective" | "suppressed" | "withdrawn" | "lost";

export interface AutonomousBattleActorSnapshot {
  readonly id: string;
  readonly formationId: string;
  readonly condition: AutonomousBattleActorCondition;
  readonly selectedBehaviorId: string | null;
  readonly decisionConfidence: number;
}

export interface AutonomousBattleFormationSnapshot {
  readonly id: string;
  readonly sideId: string;
  readonly active: boolean;
  readonly locationId: string;
  readonly intentId: string;
  readonly actors: readonly AutonomousBattleActorSnapshot[];
}

export interface AutonomousBattleObjectiveSnapshot {
  readonly id: string;
  readonly progress: number;
  readonly completed: boolean;
}

export type AutonomousBattleStatus = "running" | "resolved";

export interface AutonomousBattleSnapshot {
  readonly battleId: string;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly status: AutonomousBattleStatus;
  readonly outcomeId: string | null;
  readonly formations: readonly AutonomousBattleFormationSnapshot[];
  readonly objectives: readonly AutonomousBattleObjectiveSnapshot[];
}

/**
 * Exceptional interventions express formation intent or harness guidance.
 * Scenario/application policy owns their limits, costs, and rejection; direct
 * manipulation of an individual actor is deliberately outside this boundary.
 */
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

export interface AutonomousBattleSimulation {
  snapshot(): AutonomousBattleSnapshot;
  advance(deltaMs: number): AutonomousBattleSnapshot;
  intervene(intervention: AutonomousBattleIntervention): AutonomousBattleSnapshot;
}

export type AutonomousBattleSimulationFactory = (
  definition: AutonomousBattleDefinition,
  seed: RandomSeed,
  harness: AutonomousBattleHarnessPolicies,
) => AutonomousBattleSimulation;
