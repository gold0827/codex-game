import { describe, expect, it, vi } from "vitest";
import {
  configureCanvasViewport,
  createIsometricCamera,
  projectIsometric,
  unprojectIsometric,
} from "../../src/presentation/battlefield/isometricCamera";

describe("isometric camera runtime", () => {
  it("projects the fixed 2:1 world fixture and reverses it", () => {
    expect(projectIsometric({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(projectIsometric({ x: 1, y: 0 })).toEqual({ x: 32, y: 16 });
    expect(projectIsometric({ x: 0, y: 1 })).toEqual({ x: -32, y: 16 });
    expect(projectIsometric({ x: 3, y: 2 })).toEqual({ x: 32, y: 80 });
    expect(unprojectIsometric({ x: 32, y: 80 })).toEqual({ x: 3, y: 2 });
  });

  it("follows a selected actor and clamps follow and pan to world bounds", () => {
    const camera = createIsometricCamera({
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
      viewport: { width: 800, height: 450 },
      center: { x: 2, y: 2 },
    });

    expect(camera.follow({ x: 7, y: 5 }).center).toEqual({ x: 7, y: 5 });
    expect(camera.project({ x: 7, y: 5 })).toEqual({ x: 400, y: 225 });
    expect(camera.follow({ x: 20, y: -4 }).center).toEqual({ x: 10, y: 0 });
    expect(camera.panBy({ x: -10_000, y: -10_000 }).center).toEqual({ x: 10, y: 8 });
    expect(camera.panBy({ x: 10_000, y: 10_000 }).center).toEqual({ x: 0, y: 0 });
  });

  it("limits zoom and preserves the world point beneath a zoom anchor", () => {
    const camera = createIsometricCamera({
      bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      viewport: { width: 800, height: 600 },
      center: { x: 0, y: 0 },
    });
    const target = { x: 4, y: 2 };
    const anchor = camera.project(target);

    expect(camera.setZoom(10, anchor).zoom).toBe(2);
    expect(camera.project(target).x).toBeCloseTo(anchor.x);
    expect(camera.project(target).y).toBeCloseTo(anchor.y);
    expect(camera.setZoom(0.01).zoom).toBe(0.5);
  });

  it("caps DPR at two and disables bitmap smoothing", () => {
    const canvas = { width: 0, height: 0, style: { width: "", height: "" } };
    const context = { imageSmoothingEnabled: true, setTransform: vi.fn() };

    const configured = configureCanvasViewport(
      canvas,
      context,
      { width: 640, height: 360 },
      3.5,
    );

    expect(configured).toEqual({
      cssWidth: 640,
      cssHeight: 360,
      pixelWidth: 1280,
      pixelHeight: 720,
      devicePixelRatio: 2,
    });
    expect(canvas).toMatchObject({
      width: 1280,
      height: 720,
      style: { width: "640px", height: "360px" },
    });
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.imageSmoothingEnabled).toBe(false);
  });
});
