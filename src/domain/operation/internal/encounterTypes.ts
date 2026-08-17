import type {
  AgentProfile,
  CampaignMapTopology,
  CampaignTilePosition,
  OfficerDisposition,
} from "../../../campaign/types";
import type { RandomSeed } from "../../../simulation/seededRandom";

export const ENCOUNTER_FIXED_STEP_MS = 100;

export type EncounterTeam = "officer" | "hostile";
export type PanicReaction = "retreat" | "misidentify" | "follow-ally" | "freeze";

export type EncounterWeapon = Readonly<{
  range: number;
  accuracy: number;
  damage: number;
  suppression: number;
}>;

export type EncounterActorDefinition = Readonly<{
  id: string;
  team: EncounterTeam;
  position: CampaignTilePosition;
  disposition: OfficerDisposition;
  profile: AgentProfile;
  health?: number;
  weapon: EncounterWeapon;
}>;

export type EncounterDefinition = Readonly<{
  id: string;
  topology: CampaignMapTopology;
  cover: readonly CampaignTilePosition[];
  actors: readonly EncounterActorDefinition[];
}>;

export type EncounterAction =
  | Readonly<{
      kind: "attack";
      actorId: string;
      targetId: string;
    }>
  | Readonly<{
      kind: "relocate";
      actorId: string;
      position: CampaignTilePosition;
    }>;

export type AttackBlockReason =
  | "unknown-actor"
  | "unknown-target"
  | "actor-incapacitated"
  | "target-incapacitated"
  | "friendly-target"
  | "out-of-range"
  | "no-line-of-sight";

export type EncounterEvent =
  | Readonly<{
      kind: "attack-blocked";
      timeMs: number;
      actorId: string;
      targetId: string;
      reason: AttackBlockReason;
    }>
  | Readonly<{
      kind: "attack-missed";
      timeMs: number;
      actorId: string;
      targetId: string;
    }>
  | Readonly<{
      kind: "unit-hit";
      timeMs: number;
      actorId: string;
      targetId: string;
      damage: number;
      remainingHealth: number;
      inCover: boolean;
    }>
  | Readonly<{
      kind: "unit-suppressed";
      timeMs: number;
      actorId: string;
      sourceId: string;
      suppression: number;
    }>
  | Readonly<{
      kind: "unit-retreated";
      timeMs: number;
      actorId: string;
      sourceId: string;
      from: CampaignTilePosition;
      to: CampaignTilePosition;
    }>
  | Readonly<{
      kind: "target-misidentified";
      timeMs: number;
      actorId: string;
      mistakenTargetId: string | null;
    }>
  | Readonly<{
      kind: "ally-followed";
      timeMs: number;
      actorId: string;
      allyId: string | null;
      from: CampaignTilePosition;
      to: CampaignTilePosition;
    }>
  | Readonly<{
      kind: "unit-froze";
      timeMs: number;
      actorId: string;
    }>
  | Readonly<{
      kind: "panic-recovered";
      timeMs: number;
      actorId: string;
    }>;

export type EncounterActorSnapshot = Readonly<{
  id: string;
  team: EncounterTeam;
  position: CampaignTilePosition;
  health: number;
  suppression: number;
  panicReaction: PanicReaction | null;
}>;

export type EncounterSnapshot = Readonly<{
  id: string;
  elapsedMs: number;
  fixedStepMs: number;
  actors: readonly EncounterActorSnapshot[];
}>;

export type EncounterSimulation = Readonly<{
  execute: (action: EncounterAction) => readonly EncounterEvent[];
  advance: (elapsedMs: number) => readonly EncounterEvent[];
  snapshot: () => EncounterSnapshot;
  events: () => readonly EncounterEvent[];
}>;

export type EncounterSimulationFactory = (
  definition: EncounterDefinition,
  seed: RandomSeed,
) => EncounterSimulation;
