import { describe, expect, it } from "vitest";
import type { BattlefieldMapFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import { createBattlefieldMapDrawList } from "../../src/presentation/battlefield/internal/mapDrawList";
import type { MapAtlasSkin } from "../../src/presentation/mapAtlas";

const map: BattlefieldMapFrame = {
  id: "bridge-test",
  width: 3,
  height: 2,
  tiles: [
    { kind: "blocked", position: { x: 1, y: 0 } },
    { kind: "rough", position: { x: 0, y: 1 } },
  ],
  locations: [
    { id: "west", kind: "spawn", position: { x: 0, y: 0 } },
    { id: "east", kind: "destination", position: { x: 2, y: 1 } },
  ],
};

const skin: MapAtlasSkin = {
  tiles: [
    { id: "water", kind: "water", position: { x: 1, y: 0 } },
    { id: "bridge", kind: "bridge", position: { x: 1, y: 0 } },
  ],
  props: [
    { id: "post", kind: "command-post", position: { x: 0, y: 0 } },
  ],
};

describe("battlefield map draw list", () => {
  it("builds every base tile and lets the final skin tile replace topology styling", () => {
    const drawList = createBattlefieldMapDrawList(map, skin);
    const atBridge = drawList.tiles.filter(({ position }) => position.x === 1 && position.y === 0);

    expect(drawList.tiles.filter(({ kind }) => kind.startsWith("ground"))).toHaveLength(6);
    expect(atBridge.map(({ kind }) => kind)).toEqual(["ground-a", "bridge"]);
    expect(drawList.tiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rough:0,1", kind: "rough" }),
      expect.objectContaining({ id: "spawn:west", kind: "spawn" }),
      expect.objectContaining({ id: "destination:east", kind: "destination" }),
    ]));
    expect(drawList.props).toEqual(skin.props);
  });

  it("uses deterministic ground variation without requiring skin data", () => {
    expect(createBattlefieldMapDrawList(map, { tiles: [], props: [] }))
      .toEqual(createBattlefieldMapDrawList(map, { tiles: [], props: [] }));
  });
});
