import type {
  BattlefieldAction,
  BattlefieldFacing,
  BattlefieldFrame,
  BattlefieldThreatFrame,
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
  threats: readonly BattlefieldDrawThreat[];
}>;

export type BattlefieldDrawThreat = Readonly<
  Omit<BattlefieldThreatFrame, "position"> & { x: number; y: number }
>;

type TimedFrame = Readonly<{
  frame: BattlefieldFrame;
}>;

const SNAPSHOT_INTERVAL_MS = 100;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createBattlefieldDrawList(
  previous: TimedFrame | null,
  current: TimedFrame,
  sampleOperationTimeMs: number,
): BattlefieldDrawList {
  const snapshotIntervalMs = previous
    ? current.frame.animation.operationTimeMs - previous.frame.animation.operationTimeMs
    : SNAPSHOT_INTERVAL_MS;
  const progress = previous
    && !current.frame.animation.paused
    && !current.frame.animation.reducedMotion
    ? clamp(
      (sampleOperationTimeMs - current.frame.animation.operationTimeMs) /
        (snapshotIntervalMs > 0 ? snapshotIntervalMs : SNAPSHOT_INTERVAL_MS),
      0,
      1,
    )
    : 1;
  const previousById = new Map(previous?.frame.actors.map((actor) => [actor.id, actor]));
  const previousThreatById = new Map(previous?.frame.threats.map((threat) => [threat.id, threat]));

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
    threats: current.frame.threats.map((threat) => {
      const before = previousThreatById.get(threat.id) ?? threat;
      return {
        ...threat,
        x: before.position.x + (threat.position.x - before.position.x) * progress,
        y: before.position.y + (threat.position.y - before.position.y) * progress,
      };
    }),
  };
}
