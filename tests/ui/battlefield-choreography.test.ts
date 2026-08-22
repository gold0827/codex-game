import { describe, expect, it } from "vitest";

import { createAutonomousBattleSimulation } from "../../src/domain/operation/operationEngine";
import { planBattlefieldChoreography } from "../../src/presentation/battlefield/battlefieldChoreography";
import { projectAutonomousOperation } from "../../src/presentation/operation/autonomousOperationProjector";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";

function operation(elapsedMs = 250) {
  const simulation = createAutonomousBattleSimulation(chuncheonAutonomousBattle, {
    seed: "battlefield-choreography-test",
    harness: {
      informationReach: 0.68,
      authorityClarity: 0.72,
      verificationDepth: 0.68,
      feedbackCompression: 0.7,
    },
    interventionBudget: 4,
  });
  simulation.advance(elapsedMs);
  return projectAutonomousOperation(simulation.snapshot(), null);
}

describe("battlefield choreography", () => {
  it("produces the same plan independent of canonical collection order", () => {
    const source = operation();
    const reordered = {
      ...source,
      formations: [...source.formations]
        .reverse()
        .map((formation) => ({
          ...formation,
          actors: [...formation.actors].reverse(),
        })),
    };

    expect(planBattlefieldChoreography(source, false)).toEqual(
      planBattlefieldChoreography(reordered, false),
    );
  });

  it("moves active 행동 주체 deterministically as operation time advances", () => {
    const source = operation();
    const later = {
      ...source,
      clock: {
        ...source.clock,
        elapsedMs: source.clock.elapsedMs + 2_000,
      },
    };
    const before = planBattlefieldChoreography(source, false);
    const after = planBattlefieldChoreography(later, false);
    const beforeActors = new Map(before.formations.flatMap(({ actors }) => actors)
      .map((actor) => [actor.actorId, actor] as const));

    const moved = after.formations.flatMap(({ actors }) => actors).filter((actor) =>
      actor.moving && actor.transform !== beforeActors.get(actor.actorId)?.transform);
    expect(moved.length).toBeGreaterThan(0);
  });

  it("uses a fixed readable pose when reduced motion is requested", () => {
    const source = operation();
    const later = {
      ...source,
      clock: {
        ...source.clock,
        elapsedMs: source.clock.elapsedMs + 4_000,
      },
    };
    const poses = (value: typeof source) => planBattlefieldChoreography(value, true).formations
      .flatMap(({ formationId, offset, actors }) => actors.map((actor) => ({
        formationId,
        offset,
        actorId: actor.actorId,
        transform: actor.transform,
        moving: actor.moving,
      })));

    expect(poses(later)).toEqual(poses(source));
    expect(poses(source).every(({ moving }) => moving === false)).toBe(true);
  });

  it("shows contact and pressure flow only between active opposing sides", () => {
    const source = operation();
    const plan = planBattlefieldChoreography(source, false);
    const formations = new Map(source.formations.map((formation) => [formation.id, formation]));

    expect(plan.exchanges.map(({ kind }) => kind)).toContain("contact-pressure");
    expect(plan.exchanges.map(({ kind }) => kind)).toContain("pressure-flow");
    expect(plan.exchanges.every((exchange) => {
      const from = formations.get(exchange.fromFormationId);
      const to = formations.get(exchange.toFormationId);
      return from?.active === true && to?.active === true && from.sideId !== to.sideId;
    })).toBe(true);

    const oneSide = {
      ...source,
      formations: source.formations.map((formation) => ({ ...formation, sideId: "one-side" })),
    };
    const inactive = {
      ...source,
      formations: source.formations.map((formation) => ({ ...formation, active: false })),
    };
    expect(planBattlefieldChoreography(oneSide, false).exchanges).toHaveLength(0);
    expect(planBattlefieldChoreography(inactive, false).exchanges).toHaveLength(0);
  });

  it("places an unknown authored location with a stable non-opaque fallback", () => {
    const source = operation();
    const unknownLocation = "future-scenario-ridge";
    const view = {
      ...source,
      formations: source.formations.map((formation, index) => index === 0
        ? { ...formation, location: unknownLocation }
        : formation),
    };
    const formationId = view.formations[0]!.id;
    const anchor = () => planBattlefieldChoreography(view, false).formations
      .find((formation) => formation.formationId === formationId)?.anchor;

    expect(anchor()).toEqual(anchor());
    expect(anchor()).toMatchObject({ known: false });
    expect(anchor()?.label).toMatch(/^작전 지점 \d{2}$/);
    expect(anchor()?.label).not.toContain(unknownLocation);
  });

  it("keeps arbitrary actor hit targets separated in a scrollable footprint", () => {
    const source = operation();
    const first = source.formations[0]!;
    const actors = Array.from({ length: 64 }, (_, index) => ({
      ...first.actors[index % first.actors.length]!,
      id: `dense-actor-${index}`,
    }));
    const plan = planBattlefieldChoreography({
      ...source,
      formations: [{ ...first, actors }],
    }, true);

    const formation = plan.formations[0]!;
    expect(formation.actors).toHaveLength(64);
    expect(formation.footprintHeight).toBeGreaterThan(240);
    for (const [index, actor] of formation.actors.entries()) {
      for (const other of formation.actors.slice(index + 1)) {
        expect(Math.hypot(actor.x - other.x, actor.y - other.y)).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
