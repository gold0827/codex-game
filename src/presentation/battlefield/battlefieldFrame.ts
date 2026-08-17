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
  actors: readonly BattlefieldActorFrame[];
}>;
