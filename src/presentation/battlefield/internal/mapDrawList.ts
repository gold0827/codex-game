import type { MapAtlasKind, MapAtlasSkin, MapSkinPropKind } from "../../mapAtlas";
import type { BattlefieldMapFrame, WorldPosition } from "../battlefieldFrame";

export type BattlefieldMapDrawTile = Readonly<{
  id: string;
  kind: MapAtlasKind;
  position: WorldPosition;
}>;

export type BattlefieldMapDrawProp = Readonly<{
  id: string;
  kind: MapSkinPropKind;
  position: WorldPosition;
}>;

export type BattlefieldMapDrawList = Readonly<{
  tiles: readonly BattlefieldMapDrawTile[];
  props: readonly BattlefieldMapDrawProp[];
}>;

function positionKey(position: WorldPosition): string {
  return `${position.x},${position.y}`;
}

function baseTileKind(position: WorldPosition): "ground-a" | "ground-b" {
  return (position.x * 17 + position.y * 31) % 5 === 0 ? "ground-b" : "ground-a";
}

export function createBattlefieldMapDrawList(
  map: BattlefieldMapFrame,
  skin: MapAtlasSkin,
): BattlefieldMapDrawList {
  const overlays = new Map<string, BattlefieldMapDrawTile>();
  for (const tile of map.tiles) {
    overlays.set(positionKey(tile.position), {
      id: `${tile.kind}:${positionKey(tile.position)}`,
      kind: tile.kind,
      position: tile.position,
    });
  }
  for (const tile of skin.tiles) {
    overlays.set(positionKey(tile.position), tile);
  }

  const tiles: BattlefieldMapDrawTile[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const position = { x, y };
      tiles.push({
        id: `ground:${x},${y}`,
        kind: baseTileKind(position),
        position,
      });
      const overlay = overlays.get(positionKey(position));
      if (overlay) tiles.push(overlay);
    }
  }
  for (const location of map.locations) {
    tiles.push({
      id: `${location.kind}:${location.id}`,
      kind: location.kind,
      position: location.position,
    });
  }
  return { tiles, props: skin.props };
}
