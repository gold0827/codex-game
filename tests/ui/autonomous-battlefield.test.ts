import { afterEach, describe, expect, it, vi } from "vitest";

import { createAutonomousBattleSimulation } from "../../src/domain/operation/operationEngine";
import { mountAutonomousBattlefield } from "../../src/presentation/battlefield/autonomousBattlefield";
import { projectAutonomousOperation } from "../../src/presentation/operation/autonomousOperationProjector";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";

const originalCanvasContextDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "CanvasRenderingContext2D",
);

function operation(selectedActorId: string | null = null) {
  const simulation = createAutonomousBattleSimulation(chuncheonAutonomousBattle, {
    seed: "battlefield-test",
    harness: {
      informationReach: 0.68,
      authorityClarity: 0.72,
      verificationDepth: 0.68,
      feedbackCompression: 0.7,
    },
    interventionBudget: 4,
  });
  simulation.advance(250);
  return projectAutonomousOperation(simulation.snapshot(), selectedActorId);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (originalCanvasContextDescriptor === undefined) {
    Reflect.deleteProperty(globalThis, "CanvasRenderingContext2D");
  } else {
    Object.defineProperty(
      globalThis,
      "CanvasRenderingContext2D",
      originalCanvasContextDescriptor,
    );
  }
});

describe("autonomous battlefield presentation", () => {
  it("renders arbitrary canonical formations and actor inspection without commands", () => {
    const inspected: string[] = [];
    const battlefield = mountAutonomousBattlefield({
      onInspectActor: (actorId) => inspected.push(actorId),
    });
    document.body.append(battlefield.element);
    const view = operation();

    battlefield.update(view, false);

    expect(battlefield.element.dataset).toMatchObject({
      region: "battlefield",
      visualState: "degraded",
      operationState: "running",
      formationCount: String(view.formations.length),
      actorCount: String(view.formations.reduce(
        (total, formation) => total + formation.actors.length,
        0,
      )),
      controlledFormationCount: "3",
      uncontrolledFormationCount: "4",
      reducedMotion: "false",
    });
    const canvas = battlefield.element.querySelector<HTMLCanvasElement>(
      'canvas[data-region="battlefield-canvas"]',
    );
    expect(canvas).toMatchObject({ width: 960, height: 540 });
    expect(canvas?.dataset.drawCount).toBe("0");
    expect(battlefield.element.querySelectorAll(".battlefield-formation-marker")).toHaveLength(7);
    expect(battlefield.element.querySelectorAll(".battlefield-actor-pip")).toHaveLength(21);
    expect(battlefield.element.textContent).toContain("소양강 북안");
    expect(battlefield.element.querySelector("[data-action]")).toBeNull();

    const firstActor = battlefield.element.querySelector<HTMLButtonElement>(
      ".battlefield-actor-pip",
    );
    firstActor?.click();
    expect(inspected).toEqual([firstActor?.dataset.actorId]);
    firstActor?.focus();
    battlefield.update(view, false);
    expect((document.activeElement as HTMLElement | null)?.dataset.actorId)
      .toBe(firstActor?.dataset.actorId);

    battlefield.update(view, true);
    expect(battlefield.element.dataset.reducedMotion).toBe("true");
    battlefield.update(null, false);
    expect(battlefield.element.dataset).toMatchObject({
      visualState: "degraded",
      operationState: "empty",
      formationCount: "0",
      actorCount: "0",
      controlledFormationCount: "0",
      uncontrolledFormationCount: "0",
    });
    expect(battlefield.element.querySelectorAll(".battlefield-formation-marker")).toHaveLength(0);

    battlefield.destroy();
    battlefield.update(view, false);
    expect(battlefield.element.dataset.visualState).toBe("destroyed");
  });

  it("uses a visible deterministic fallback for an unknown location", () => {
    const battlefield = mountAutonomousBattlefield({ onInspectActor: () => undefined });
    const source = operation();
    const first = source.formations[0]!;
    const unknownLocation = "scenario-authored-ridge";
    const view = {
      ...source,
      formations: [
        { ...first, location: unknownLocation },
        ...source.formations.slice(1),
      ],
    };

    battlefield.update(view, false);

    const marker = battlefield.element.querySelector<HTMLElement>(
      `[data-location-id="${unknownLocation}"]`,
    );
    expect(marker?.dataset.locationKnown).toBe("false");
    expect(marker?.textContent).toMatch(/작전 지점 \d{2}/);
    expect(marker?.textContent).not.toContain(unknownLocation);
    expect(marker?.style.left).not.toBe("");
    expect(marker?.style.top).not.toBe("");
  });

  it("keeps arbitrary formations at one location reachable in a scrolling cluster", () => {
    const battlefield = mountAutonomousBattlefield({ onInspectActor: () => undefined });
    const source = operation();
    const first = source.formations[0]!;
    const formations = Array.from({ length: 8 }, (_, formationIndex) => ({
      ...first,
      id: `${first.id}-${formationIndex}`,
      actors: first.actors.map((actor, actorIndex) => ({
        ...actor,
        id: `${actor.id}-${formationIndex}-${actorIndex}`,
      })),
    }));

    battlefield.update({ ...source, formations }, false);

    const cluster = battlefield.element.querySelector<HTMLElement>(
      `.battlefield-location-cluster[data-location-id="${first.location}"]`,
    );
    expect(cluster?.dataset.formationCount).toBe("8");
    expect(cluster?.querySelectorAll(".battlefield-formation-marker")).toHaveLength(8);
    expect(cluster?.querySelectorAll(".battlefield-actor-pip")).toHaveLength(24);

    if (cluster) cluster.scrollTop = 120;
    battlefield.update({ ...source, formations }, false);
    expect(battlefield.element.querySelector<HTMLElement>(
      `.battlefield-location-cluster[data-location-id="${first.location}"]`,
    )?.scrollTop).toBe(120);
  });

  it("draws nonempty procedural terrain when a Canvas context is available", () => {
    const fill = vi.fn();
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fill,
      fillRect: vi.fn(),
      fillStyle: "",
      fillText: vi.fn(),
      font: "",
      lineTo: vi.fn(),
      lineWidth: 1,
      moveTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(globalThis, "CanvasRenderingContext2D", {
      configurable: true,
      value: class CanvasRenderingContext2D {},
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);

    const battlefield = mountAutonomousBattlefield({ onInspectActor: () => undefined });
    const canvas = battlefield.element.querySelector<HTMLCanvasElement>("canvas")!;
    expect(battlefield.element.dataset.visualState).toBe("ready");
    expect(canvas.dataset.drawCount).toBe("1");

    battlefield.update(operation(), false);

    expect(canvas.dataset.drawCount).toBe("2");
    expect(fill).toHaveBeenCalledTimes(16 * 12 * 2);
    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillText).toHaveBeenCalled();
  });

  it("degrades to interactive DOM markers when Canvas drawing fails", () => {
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fill: vi.fn(),
      fillRect: vi.fn(() => { throw new Error("draw failed"); }),
      fillStyle: "",
      fillText: vi.fn(),
      font: "",
      lineTo: vi.fn(),
      lineWidth: 1,
      moveTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(globalThis, "CanvasRenderingContext2D", {
      configurable: true,
      value: class CanvasRenderingContext2D {},
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);

    const battlefield = mountAutonomousBattlefield({ onInspectActor: () => undefined });
    expect(() => battlefield.update(operation(), false)).not.toThrow();
    expect(battlefield.element.dataset.visualState).toBe("degraded");
    expect(battlefield.element.querySelectorAll(".battlefield-formation-marker")).toHaveLength(7);
    expect(battlefield.element.querySelector<HTMLCanvasElement>("canvas")?.dataset.drawCount)
      .toBe("0");
  });
});
