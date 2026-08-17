import type {
  BattlefieldAction,
  BattlefieldFacing,
  BattlefieldFrame,
} from "../battlefieldFrame";

export type BattlefieldDrawActor = Readonly<{
  id: string;
  x: number;
  y: number;
  action: BattlefieldAction;
  facing: BattlefieldFacing;
  health: number;
  selected: boolean;
}>;

export type BattlefieldDrawList = Readonly<{
  actors: readonly BattlefieldDrawActor[];
}>;

type TimedFrame = Readonly<{
  frame: BattlefieldFrame;
  receivedAt: number;
}>;

const SNAPSHOT_INTERVAL_MS = 100;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createBattlefieldDrawList(
  previous: TimedFrame | null,
  current: TimedFrame,
  now: number,
): BattlefieldDrawList {
  const progress = previous
    ? clamp((now - current.receivedAt) / SNAPSHOT_INTERVAL_MS, 0, 1)
    : 1;
  const previousById = new Map(previous?.frame.actors.map((actor) => [actor.id, actor]));

  return {
    actors: current.frame.actors.map((actor) => {
      const before = previousById.get(actor.id) ?? actor;
      return {
        id: actor.id,
        x: before.position.x + (actor.position.x - before.position.x) * progress,
        y: before.position.y + (actor.position.y - before.position.y) * progress,
        action: actor.action,
        facing: actor.facing,
        health: actor.health,
        selected: actor.selected,
      };
    }),
  };
}
