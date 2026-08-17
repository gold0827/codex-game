export type WorldPosition = Readonly<{
  x: number;
  y: number;
}>;

export type BattlefieldAction =
  | "idle"
  | "walk"
  | "attack"
  | "inspect"
  | "broadcast"
  | "panic"
  | "hurt"
  | "down";

export type BattlefieldFacing =
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";

export type BattlefieldCue = "destination-reached" | "low-health";

export type BattlefieldMapTileKind = "blocked" | "rough";
export type BattlefieldMapLocationKind = "spawn" | "destination";

export type BattlefieldMapFrame = Readonly<{
  id: string;
  width: number;
  height: number;
  tiles: readonly Readonly<{
    kind: BattlefieldMapTileKind;
    position: WorldPosition;
  }>[];
  locations: readonly Readonly<{
    id: string;
    kind: BattlefieldMapLocationKind;
    position: WorldPosition;
  }>[];
}>;

export type BattlefieldActorFrame = Readonly<{
  id: string;
  position: WorldPosition;
  action: BattlefieldAction;
  facing: BattlefieldFacing;
  health: number;
  cues: readonly BattlefieldCue[];
  selected: boolean;
}>;

export type BattlefieldFrame = Readonly<{
  map: BattlefieldMapFrame;
  actors: readonly BattlefieldActorFrame[];
  effects: readonly EffectSample[];
  guidedTile?: WorldPosition | null;
}>;
import type { EffectSample } from "../effects/effectTrack";
