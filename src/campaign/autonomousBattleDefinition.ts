export interface OfficerSourceTrust {
  readonly officerId: string;
  readonly trust: number;
}

export interface AgentProfile {
  readonly initiative: number;
  readonly caution: number;
  readonly discipline: number;
  readonly cooperation: number;
  readonly stressTolerance: number;
  readonly memoryCapacity: number;
  readonly sourceTrust: readonly OfficerSourceTrust[];
}

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
