import { describe, expect, it } from "vitest";
import {
  battlefieldDepth,
  orderBattlefieldRenderables,
  type BattlefieldRenderable,
} from "../../src/presentation/battlefield/drawOrder";

const renderable = (
  id: string,
  kind: BattlefieldRenderable["kind"],
  x: number,
  y: number,
  depthOffset?: number,
): BattlefieldRenderable => ({ id, kind, position: { x, y }, depthOffset });

describe("battlefield draw order", () => {
  it("orders by isometric foot depth rather than input order", () => {
    const front = renderable("front", "actor", 4, 4);
    const rear = renderable("rear", "actor", 1, 2);

    expect(battlefieldDepth(front)).toBe(8);
    expect(orderBattlefieldRenderables([front, rear]).map(({ id }) => id)).toEqual([
      "rear",
      "front",
    ]);
  });

  it("draws a prop after an actor at the same foot depth so the prop occludes it", () => {
    const actor = renderable("unit", "actor", 3, 2);
    const prop = renderable("tree", "prop", 1, 4);

    expect(orderBattlefieldRenderables([prop, actor]).map(({ id }) => id)).toEqual([
      "unit",
      "tree",
    ]);
  });

  it("draws a world effect beneath an actor and prop at the same foot depth", () => {
    const effect = renderable("signal", "effect", 3, 2);
    const actor = renderable("unit", "actor", 3, 2);
    const prop = renderable("post", "prop", 3, 2);

    expect(orderBattlefieldRenderables([prop, actor, effect]).map(({ id }) => id)).toEqual([
      "signal",
      "unit",
      "post",
    ]);
  });

  it("uses depth offsets and stable ids to avoid order flicker across input frames", () => {
    const renderables = [
      renderable("bravo", "actor", 2, 2),
      renderable("alpha", "actor", 1, 3),
      renderable("raised", "actor", 5, 0, -2),
    ];
    const forward = orderBattlefieldRenderables(renderables).map(({ id }) => id);
    const reversed = orderBattlefieldRenderables([...renderables].reverse()).map(({ id }) => id);

    expect(forward).toEqual(["raised", "alpha", "bravo"]);
    expect(reversed).toEqual(forward);
  });
});
