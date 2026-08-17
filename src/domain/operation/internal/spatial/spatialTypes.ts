import type {
  CampaignMapTopology,
  CampaignTilePosition,
} from "../../../../campaign/types";
import type { OperationSpatialSnapshot } from "../../../../simulation/simulationTypes";

export type TilePosition = CampaignTilePosition;

export type MoveIntent = Readonly<{
  actorId: string;
  destination: TilePosition;
}>;

export type SpatialBlockReason =
  | "unknown-actor"
  | "out-of-bounds"
  | "obstacle"
  | "occupied"
  | "reserved"
  | "no-path"
  | "already-there";

export type SpatialEvent =
  | Readonly<{
      kind: "unit-moved";
      actorId: string;
      from: TilePosition;
      to: TilePosition;
      destination: TilePosition;
      remainingPath: readonly TilePosition[];
    }>
  | Readonly<{
      kind: "move-blocked";
      actorId: string;
      position: TilePosition | null;
      destination: TilePosition;
      reason: SpatialBlockReason;
    }>;

export type PathRequest = Readonly<{
  topology: CampaignMapTopology;
  start: TilePosition;
  goal: TilePosition;
  occupied: ReadonlySet<string>;
}>;

export interface Pathfinder {
  findPath(request: PathRequest): readonly TilePosition[] | null;
}

export interface SpatialWorld {
  execute(intent: MoveIntent): SpatialEvent;
  advance(): readonly SpatialEvent[];
  snapshot(): OperationSpatialSnapshot;
}

export const tileKey = ({ x, y }: TilePosition): string => `${x},${y}`;
export const sameTile = (left: TilePosition, right: TilePosition): boolean =>
  left.x === right.x && left.y === right.y;
