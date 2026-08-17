import type { CampaignMapTopology } from "../../../../campaign/types";
import type {
  OperationSpatialActorSnapshot,
  OperationSpatialSnapshot,
} from "../../../../simulation/simulationTypes";
import { createPathfinder } from "./pathfinder";
import type {
  MoveIntent,
  Pathfinder,
  SpatialBlockReason,
  SpatialEvent,
  SpatialWorld,
  TilePosition,
} from "./spatialTypes";
import { sameTile, tileKey } from "./spatialTypes";

type SpatialActor = {
  actorId: string;
  position: TilePosition;
  destination: TilePosition | null;
  path: TilePosition[];
};

export type SpatialActorSpawn = Readonly<{
  actorId: string;
  position: TilePosition;
}>;

const copyTile = ({ x, y }: TilePosition): TilePosition => ({ x, y });
const compareActorId = (left: SpatialActor, right: SpatialActor): number =>
  left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0;

export function createSpatialWorld(
  topology: CampaignMapTopology,
  spawns: readonly SpatialActorSpawn[],
  pathfinder: Pathfinder = createPathfinder(),
): SpatialWorld {
  const map = structuredClone(topology);
  const actors = new Map<string, SpatialActor>();
  spawns.forEach((spawn) => {
    if (actors.has(spawn.actorId)) throw new RangeError(`Duplicate spatial actor "${spawn.actorId}".`);
    if (spawn.position.x < 0 || spawn.position.y < 0 || spawn.position.x >= map.width ||
        spawn.position.y >= map.height || map.blocked.some((tile) => sameTile(tile, spawn.position)) ||
        [...actors.values()].some((actor) => sameTile(actor.position, spawn.position))) {
      throw new RangeError(`Invalid spatial spawn for actor "${spawn.actorId}".`);
    }
    actors.set(spawn.actorId, {
      actorId: spawn.actorId,
      position: copyTile(spawn.position),
      destination: null,
      path: [],
    });
  });
  const destinationReservations = new Map<string, string>();

  const blockedEvent = (
    intent: MoveIntent,
    actor: SpatialActor | undefined,
    reason: SpatialBlockReason,
  ): SpatialEvent => ({
    kind: "move-blocked",
    actorId: intent.actorId,
    position: actor ? copyTile(actor.position) : null,
    destination: copyTile(intent.destination),
    reason,
  });

  const occupiedKeys = (exceptActorId: string): Set<string> => new Set(
    [...actors.values()]
      .filter(({ actorId }) => actorId !== exceptActorId)
      .map(({ position }) => tileKey(position)),
  );

  const moveOneStep = (actor: SpatialActor, tickReservations: Set<string>): SpatialEvent => {
    const destination = actor.destination as TilePosition;
    const next = actor.path[0];
    if (!next) {
      destinationReservations.delete(tileKey(destination));
      actor.destination = null;
      return blockedEvent({ actorId: actor.actorId, destination }, actor, "already-there");
    }
    const nextKey = tileKey(next);
    if (occupiedKeys(actor.actorId).has(nextKey)) {
      return blockedEvent({ actorId: actor.actorId, destination }, actor, "occupied");
    }
    if (tickReservations.has(nextKey)) {
      return blockedEvent({ actorId: actor.actorId, destination }, actor, "reserved");
    }
    const from = copyTile(actor.position);
    actor.position = copyTile(next);
    actor.path.shift();
    tickReservations.add(nextKey);
    const remainingPath = actor.path.map(copyTile);
    if (remainingPath.length === 0) {
      destinationReservations.delete(tileKey(destination));
      actor.destination = null;
    }
    return {
      kind: "unit-moved",
      actorId: actor.actorId,
      from,
      to: copyTile(actor.position),
      destination: copyTile(destination),
      remainingPath,
    };
  };

  const execute = (intent: MoveIntent): SpatialEvent => {
    const actor = actors.get(intent.actorId);
    if (!actor) return blockedEvent(intent, undefined, "unknown-actor");
    const { destination } = intent;
    if (destination.x < 0 || destination.y < 0 || destination.x >= map.width || destination.y >= map.height) {
      return blockedEvent(intent, actor, "out-of-bounds");
    }
    if (map.blocked.some((tile) => sameTile(tile, destination))) return blockedEvent(intent, actor, "obstacle");
    if (sameTile(actor.position, destination)) return blockedEvent(intent, actor, "already-there");
    const occupied = occupiedKeys(actor.actorId);
    if (occupied.has(tileKey(destination))) return blockedEvent(intent, actor, "occupied");
    const reservedBy = destinationReservations.get(tileKey(destination));
    if (reservedBy && reservedBy !== actor.actorId) return blockedEvent(intent, actor, "reserved");
    const path = pathfinder.findPath({ topology: map, start: actor.position, goal: destination, occupied });
    if (!path || path.length === 0) return blockedEvent(intent, actor, "no-path");
    if (actor.destination) destinationReservations.delete(tileKey(actor.destination));
    actor.destination = copyTile(destination);
    actor.path = path.map(copyTile);
    destinationReservations.set(tileKey(destination), actor.actorId);
    return moveOneStep(actor, new Set());
  };

  const advance = (): readonly SpatialEvent[] => {
    const reservations = new Set<string>();
    return [...actors.values()]
      .filter(({ destination, path }) => destination !== null && path.length > 0)
      .sort(compareActorId)
      .map((actor) => moveOneStep(actor, reservations));
  };

  const snapshot = (): OperationSpatialSnapshot => ({
    topology: structuredClone(map),
    actors: [...actors.values()]
      .sort(compareActorId)
      .map<OperationSpatialActorSnapshot>((actor) => ({
        actorId: actor.actorId,
        position: copyTile(actor.position),
        destination: actor.destination ? copyTile(actor.destination) : null,
        path: actor.path.map(copyTile),
      })),
  });

  return { execute, advance, snapshot };
}
