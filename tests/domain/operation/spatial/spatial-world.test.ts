import { describe, expect, it } from "vitest";

import type { CampaignMapTopology } from "../../../../src/campaign";
import {
  createPathfinder,
  createSpatialWorld,
} from "../../../../src/domain/operation/internal/spatial";
import { firstSpatialMap } from "../../../../src/scenarios/completeCampaign";

const distance = (
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number => Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

describe("deterministic spatial world", () => {
  it("executes deterministic adjacent movement across the 24x16 fixture", () => {
    const run = () => {
      const world = createSpatialWorld(firstSpatialMap, [
        { actorId: "alpha", position: firstSpatialMap.spawns[0].position },
        { actorId: "bravo", position: firstSpatialMap.spawns[1].position },
        { actorId: "charlie", position: firstSpatialMap.spawns[2].position },
      ]);
      const events = firstSpatialMap.destinations.map((destination, index) =>
        world.execute({
          actorId: ["alpha", "bravo", "charlie"][index]!,
          destination: destination.position,
        }),
      );
      for (let step = 0; step < 40; step += 1) events.push(...world.advance());
      return { events, snapshot: world.snapshot() };
    };

    const first = run();
    const second = run();
    expect(firstSpatialMap).toMatchObject({ width: 24, height: 16 });
    expect(second).toEqual(first);
    const moved = first.events.filter((event) => event.kind === "unit-moved");
    expect(moved.length).toBeGreaterThan(0);
    moved.forEach((event) => expect(distance(event.from, event.to)).toBe(1));
    expect(first.snapshot.actors.map(({ position }) => position)).toEqual(
      firstSpatialMap.destinations.map(({ position }) => position),
    );
    const blocked = new Set(firstSpatialMap.blocked.map(({ x, y }) => `${x},${y}`));
    expect(first.snapshot.actors.every(({ position }) => !blocked.has(`${position.x},${position.y}`))).toBe(true);
    expect(new Set(first.snapshot.actors.map(({ position }) => `${position.x},${position.y}`)).size).toBe(3);
  });

  it("uses a stable A* tie-break and terrain costs", () => {
    const topology: CampaignMapTopology = {
      width: 5,
      height: 5,
      blocked: [],
      terrain: [{ position: { x: 3, y: 2 }, movementCost: 9 }],
      spawns: [],
      destinations: [],
    };
    const pathfinder = createPathfinder();
    const request = {
      topology,
      start: { x: 2, y: 2 },
      goal: { x: 4, y: 2 },
      occupied: new Set<string>(),
    };
    const first = pathfinder.findPath(request);
    expect(pathfinder.findPath(request)).toEqual(first);
    expect(first).toEqual([
      { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 },
    ]);
  });

  it("blocks obstacle entry, teleporting, occupancy, and duplicate reservations", () => {
    const world = createSpatialWorld(firstSpatialMap, [
      { actorId: "alpha", position: { x: 1, y: 2 } },
      { actorId: "bravo", position: { x: 1, y: 7 } },
    ]);
    expect(world.execute({ actorId: "alpha", destination: { x: 11, y: 2 } })).toMatchObject({
      kind: "move-blocked",
      reason: "obstacle",
    });
    expect(world.execute({ actorId: "alpha", destination: { x: 1, y: 7 } })).toMatchObject({
      kind: "move-blocked",
      reason: "occupied",
    });
    const farMove = world.execute({ actorId: "alpha", destination: { x: 22, y: 2 } });
    expect(farMove).toMatchObject({ kind: "unit-moved" });
    if (farMove.kind !== "unit-moved") throw new Error("Expected one adjacent move.");
    expect(distance(farMove.from, farMove.to)).toBe(1);
    expect(world.execute({ actorId: "bravo", destination: { x: 22, y: 2 } })).toMatchObject({
      kind: "move-blocked",
      reason: "reserved",
    });
  });
});
