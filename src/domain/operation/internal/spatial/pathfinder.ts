import type { CampaignTerrainTile } from "../../../../campaign/types";
import type { Pathfinder, PathRequest, TilePosition } from "./spatialTypes";
import { sameTile, tileKey } from "./spatialTypes";

type SearchNode = {
  position: TilePosition;
  cost: number;
  heuristic: number;
  sequence: number;
};

const compareNode = (left: SearchNode, right: SearchNode): number =>
  left.cost + left.heuristic - (right.cost + right.heuristic) ||
  left.heuristic - right.heuristic ||
  left.position.y - right.position.y ||
  left.position.x - right.position.x ||
  left.sequence - right.sequence;

const manhattan = (left: TilePosition, right: TilePosition): number =>
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

const reconstruct = (
  goal: TilePosition,
  start: TilePosition,
  previous: ReadonlyMap<string, TilePosition>,
): readonly TilePosition[] => {
  const reversed: TilePosition[] = [];
  let cursor = goal;
  while (!sameTile(cursor, start)) {
    reversed.push(cursor);
    const parent = previous.get(tileKey(cursor));
    if (!parent) return [];
    cursor = parent;
  }
  return reversed.reverse();
};

export function createPathfinder(): Pathfinder {
  const findPath = ({ topology, start, goal, occupied }: PathRequest): readonly TilePosition[] | null => {
    if (sameTile(start, goal)) return [];
    const blocked = new Set(topology.blocked.map(tileKey));
    const costs = new Map(
      topology.terrain.map((tile: CampaignTerrainTile) => [tileKey(tile.position), tile.movementCost]),
    );
    const open: SearchNode[] = [{ position: start, cost: 0, heuristic: manhattan(start, goal), sequence: 0 }];
    const bestCost = new Map<string, number>([[tileKey(start), 0]]);
    const previous = new Map<string, TilePosition>();
    let sequence = 1;

    while (open.length > 0) {
      open.sort(compareNode);
      const current = open.shift() as SearchNode;
      if (current.cost !== bestCost.get(tileKey(current.position))) continue;
      if (sameTile(current.position, goal)) return reconstruct(goal, start, previous);

      const neighbors = [
        { x: current.position.x, y: current.position.y - 1 },
        { x: current.position.x - 1, y: current.position.y },
        { x: current.position.x + 1, y: current.position.y },
        { x: current.position.x, y: current.position.y + 1 },
      ];
      neighbors.forEach((position) => {
        const key = tileKey(position);
        if (position.x < 0 || position.y < 0 || position.x >= topology.width ||
            position.y >= topology.height || blocked.has(key) || occupied.has(key)) return;
        const cost = current.cost + (costs.get(key) ?? 1);
        if (cost >= (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) return;
        bestCost.set(key, cost);
        previous.set(key, current.position);
        open.push({ position, cost, heuristic: manhattan(position, goal), sequence });
        sequence += 1;
      });
    }
    return null;
  };
  return { findPath };
}
