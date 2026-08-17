import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BattlefieldFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import {
  createCanvasBattlefieldViewport,
  drawTileHighlight,
  sampleBattlefieldAnimation,
} from "../../src/presentation/battlefield/internal/canvasViewport";
import { createBattlefieldDrawList } from "../../src/presentation/battlefield/internal/drawList";

class TestScheduler {
  private nextHandle = 1;
  callbacks = new Map<number, FrameRequestCallback>();

  request(callback: FrameRequestCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  frame(timestamp: number): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(timestamp));
  }
}

class TestResizeObserver {
  static latest: TestResizeObserver | null = null;
  disconnected = false;
  observed: Element | null = null;

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.latest = this;
  }

  observe(target: Element): void {
    this.observed = target;
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
    this.observed = null;
  }

  resize(width: number, height: number): void {
    this.callback([
      { contentRect: { width, height } as DOMRectReadOnly } as ResizeObserverEntry,
    ], this as unknown as ResizeObserver);
  }
}

const frame = (
  x: number,
  animation: BattlefieldFrame["animation"] = {
    operationTimeMs: 0,
    paused: false,
    reducedMotion: false,
  },
): BattlefieldFrame => ({
  map: {
    id: "test-map",
    width: 24,
    height: 16,
    tiles: [],
    locations: [],
  },
  actors: [{
    id: "major-baek",
    position: { x, y: 7 },
    action: "walk",
    facing: "east",
    health: 82,
    cues: [],
    selected: true,
  }],
  threats: [],
  effects: [],
  animation,
});

describe("persistent Canvas battlefield viewport", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestResizeObserver.latest = null;
  });

  it("interpolates actor positions across the 100ms snapshot interval", () => {
    const previous = { frame: frame(2, {
      operationTimeMs: 0,
      paused: false,
      reducedMotion: false,
    }), receivedAt: 0 };
    const current = { frame: frame(10, {
      operationTimeMs: 100,
      paused: false,
      reducedMotion: false,
    }), receivedAt: 100 };

    expect(createBattlefieldDrawList(previous, current, 100).actors[0]?.x).toBe(2);
    expect(createBattlefieldDrawList(previous, current, 150).actors[0]?.x).toBe(6);
    expect(createBattlefieldDrawList(previous, current, 200).actors[0]?.x).toBe(10);
  });

  it("samples animation from operation time without advancing across a pause", () => {
    const running = { frame: frame(4, {
      operationTimeMs: 200,
      paused: false,
      reducedMotion: false,
    }), receivedAt: 1_000 };
    const paused = { frame: frame(4, {
      operationTimeMs: 200,
      paused: true,
      reducedMotion: false,
    }), receivedAt: 1_000 };
    const reduced = { frame: frame(4, {
      operationTimeMs: 200,
      paused: false,
      reducedMotion: true,
    }), receivedAt: 1_000 };

    expect(sampleBattlefieldAnimation(running, 1_100, 2)).toEqual({
      active: true,
      operationTimeMs: 400,
      spriteTimeMs: 400,
    });
    expect(sampleBattlefieldAnimation(paused, 6_000, 2)).toEqual({
      active: false,
      operationTimeMs: 200,
      spriteTimeMs: 200,
    });
    expect(sampleBattlefieldAnimation(reduced, 6_000, 2)).toEqual({
      active: false,
      operationTimeMs: 200,
      spriteTimeMs: 0,
    });
  });

  it("snaps actor and threat snapshots when motion is paused or reduced", () => {
    const previous = { frame: frame(2, {
      operationTimeMs: 0,
      paused: false,
      reducedMotion: false,
    }) };
    const paused = { frame: frame(10, {
      operationTimeMs: 100,
      paused: true,
      reducedMotion: false,
    }) };
    const reduced = { frame: frame(12, {
      operationTimeMs: 200,
      paused: false,
      reducedMotion: true,
    }) };

    expect(createBattlefieldDrawList(previous, paused, 100).actors[0]?.x).toBe(10);
    expect(createBattlefieldDrawList(paused, reduced, 200).actors[0]?.x).toBe(12);
  });

  it("only keeps a continuous Canvas callback while animation is active", () => {
    const context = new Proxy<Record<PropertyKey, unknown>>({}, {
      get(target, property) {
        if (!(property in target)) target[property] = vi.fn();
        return target[property];
      },
    }) as unknown as CanvasRenderingContext2D;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context);
    const host = document.createElement("section");
    const scheduler = new TestScheduler();
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler,
      now: () => 100,
      fetchManifest: async () => { throw new Error("offline"); },
    });

    viewport.update(frame(2, {
      operationTimeMs: 100,
      paused: false,
      reducedMotion: false,
    }));
    scheduler.frame(100);
    expect(scheduler.callbacks.size).toBe(1);

    viewport.update(frame(2, {
      operationTimeMs: 100,
      paused: true,
      reducedMotion: false,
    }));
    scheduler.frame(5_000);
    expect(scheduler.callbacks.size).toBe(0);
    expect(host.querySelector("canvas")?.dataset.sampledSpriteTimeMs).toBe("100");

    viewport.update(frame(3, {
      operationTimeMs: 200,
      paused: false,
      reducedMotion: true,
    }));
    scheduler.frame(6_000);
    expect(scheduler.callbacks.size).toBe(0);
    expect(host.querySelector("canvas")?.dataset.sampledSpriteTimeMs).toBe("0");
    viewport.destroy();
  });

  it("draws guided then selected tile diamonds with their established styles", () => {
    const operations: Array<Readonly<{
      kind: "fill" | "stroke";
      fill: string;
      stroke: string;
      lineWidth: number;
    }>> = [];
    const context = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.mocked(context.fill).mockImplementation(() => operations.push({
      kind: "fill",
      fill: String(context.fillStyle),
      stroke: String(context.strokeStyle),
      lineWidth: context.lineWidth,
    }));
    vi.mocked(context.stroke).mockImplementation(() => operations.push({
      kind: "stroke",
      fill: String(context.fillStyle),
      stroke: String(context.strokeStyle),
      lineWidth: context.lineWidth,
    }));

    drawTileHighlight(context, { x: 100, y: 50 }, 1, "guided");
    drawTileHighlight(context, { x: 200, y: 80 }, 1, "selected");

    expect(context.moveTo).toHaveBeenNthCalledWith(1, 100, 34);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 200, 64);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 132, 50);
    expect(context.lineTo).toHaveBeenNthCalledWith(4, 232, 80);
    expect(context.save).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
    expect(operations).toEqual([
      {
        kind: "fill",
        fill: "rgba(115, 185, 162, 0.28)",
        stroke: "#f4d77d",
        lineWidth: 3,
      },
      {
        kind: "stroke",
        fill: "rgba(115, 185, 162, 0.28)",
        stroke: "#f4d77d",
        lineWidth: 3,
      },
      {
        kind: "fill",
        fill: "rgba(230, 207, 114, 0.18)",
        stroke: "#e6cf72",
        lineWidth: 2,
      },
      {
        kind: "stroke",
        fill: "rgba(230, 207, 114, 0.18)",
        stroke: "#e6cf72",
        lineWidth: 2,
      },
    ]);
  });

  it("interpolates threat positions without changing the friendly actor path", () => {
    const threat = {
      id: "artillery",
      position: { x: 4, y: 5 },
      category: "physical" as const,
      kind: "artillery" as const,
      severity: "medium" as const,
      state: "telegraphed" as const,
      result: null,
      health: 55,
      glyph: "✹",
      severityGlyph: "Ⅱ",
      statusGlyph: "…",
      label: "물리적 위협 포격. 심각도 중간. 예고 중. 타일 4, 5",
    };
    const previous = {
      frame: { ...frame(2, { operationTimeMs: 0, paused: false, reducedMotion: false }), threats: [{ ...threat, position: { x: 2, y: 5 } }] },
      receivedAt: 0,
    };
    const current = {
      frame: { ...frame(10, { operationTimeMs: 100, paused: false, reducedMotion: false }), threats: [threat] },
      receivedAt: 100,
    };
    const drawList = createBattlefieldDrawList(previous, current, 150);

    expect(drawList.actors[0]?.x).toBe(6);
    expect(drawList.threats[0]).toMatchObject({ x: 3, y: 5, glyph: "✹" });
  });

  it("keeps one Canvas, responds to resize, and releases observers and frames", () => {
    const host = document.createElement("section");
    const scheduler = new TestScheduler();
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler,
      now: () => 0,
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");

    viewport.update(frame(2));
    viewport.update(frame(3));
    TestResizeObserver.latest?.resize(320, 180);

    expect(host.querySelector("canvas")).toBe(canvas);
    expect(canvas).toMatchObject({ width: 320, height: 180 });
    expect(scheduler.callbacks.size).toBe(1);
    viewport.destroy();
    expect(scheduler.callbacks.size).toBe(0);
    expect(TestResizeObserver.latest?.disconnected).toBe(true);
    expect(host.childElementCount).toBe(0);
  });

  it("follows the selected actor, then accepts bounded pointer pan and wheel zoom", () => {
    const host = document.createElement("section");
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) throw new Error("canvas must be mounted");

    viewport.update(frame(6));
    expect(viewport.readCamera().center).toEqual({ x: 6, y: 7 });

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: 500, clientY: 100 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: 500, clientY: 100 }));
    expect(viewport.readCamera().center).toEqual({ x: 0, y: 13.25 });

    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -10_000, cancelable: true }));
    expect(viewport.readCamera().zoom).toBe(2);
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 10_000, cancelable: true }));
    expect(viewport.readCamera().zoom).toBe(0.5);
    viewport.destroy();
  });

  it("selects bounded battlefield tiles without treating pointer pans as selections", () => {
    const host = document.createElement("section");
    const selected: Array<Readonly<{ x: number; y: number }>> = [];
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
      onTileSelected: (position) => selected.push(position),
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) throw new Error("canvas must be mounted");

    viewport.update({ ...frame(2), actors: [] });

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 320, clientY: 180 }));

    expect(selected).toEqual([{ x: 12, y: 8 }]);
    expect(canvas.dataset.selectedTile).toBe("12,8");
    expect(canvas.getAttribute("aria-label")).toContain("선택 타일 12, 8");

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: 420, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 420, clientY: 180 }));

    expect(selected).toHaveLength(1);

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: -10_000, clientY: -10_000 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: -10_000, clientY: -10_000 }));
    expect(selected).toHaveLength(1);
    viewport.destroy();
  });

  it("moves the selected battlefield tile with the keyboard", () => {
    const host = document.createElement("section");
    const selected: Array<Readonly<{ x: number; y: number }>> = [];
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
      onTileSelected: (position) => selected.push(position),
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) throw new Error("canvas must be mounted");

    viewport.update({ ...frame(2), actors: [] });

    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    expect(selected).toEqual([{ x: 13, y: 8 }, { x: 13, y: 9 }]);
    expect(canvas.dataset.selectedTile).toBe("13,9");
    viewport.destroy();
  });

  it("uses the current map dimensions for camera and keyboard selection bounds", () => {
    const host = document.createElement("section");
    const selected: Array<Readonly<{ x: number; y: number }>> = [];
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
      onTileSelected: (position) => selected.push(position),
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) throw new Error("canvas must be mounted");
    viewport.update({
      ...frame(2),
      map: { id: "small", width: 4, height: 3, tiles: [], locations: [] },
      actors: [],
    });

    for (let index = 0; index < 10; index += 1) {
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    }

    expect(selected.at(-1)).toEqual({ x: 3, y: 2 });
    expect(viewport.readCamera().center).toEqual({ x: 1.5, y: 1 });
    viewport.destroy();
  });

  it("caps the backing store DPR and leaves bitmap smoothing disabled", () => {
    const context = {
      setTransform: vi.fn(),
      imageSmoothingEnabled: true,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const host = document.createElement("section");
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");

    viewport.resize({ width: 320, height: 180, pixelRatio: 4 });

    expect(canvas).toMatchObject({ width: 640, height: 360 });
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    viewport.destroy();
  });

  it("announces an accessible placeholder when sprite assets fail", async () => {
    const host = document.createElement("section");
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });

    await vi.waitFor(() => {
      expect(host.querySelector('[role="status"]')?.textContent).toContain("대체 표식");
    });
    expect(host.querySelector("canvas")?.getAttribute("aria-label")).toContain("실시간 전장");
    viewport.destroy();
  });

  it("announces active world-space effect semantics from the Canvas", () => {
    const host = document.createElement("section");
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });

    viewport.update({
      ...frame(2),
      effects: [{
        id: "verification:major-baek:0",
        kind: "verification",
        label: "검증",
        glyph: "✓",
        color: "#7de1d8",
        position: { x: 2, y: 7 },
        progress: 0.2,
        radius: 13,
        opacity: 1,
      }],
    });

    expect(host.querySelector("canvas")?.getAttribute("aria-label")).toContain("식별된 효과: 검증");
    viewport.destroy();
  });

  it("announces physical and informational threat markers from the Canvas", () => {
    const host = document.createElement("section");
    const viewport = createCanvasBattlefieldViewport(host, {
      scheduler: new TestScheduler(),
      resizeObserver: TestResizeObserver as unknown as typeof ResizeObserver,
      fetchManifest: async () => { throw new Error("offline"); },
    });

    viewport.update({
      ...frame(2),
      threats: [
        {
          id: "artillery",
          position: { x: 4, y: 5 },
          category: "physical",
          kind: "artillery",
          severity: "medium",
          state: "telegraphed",
          result: null,
          health: 55,
          glyph: "✹",
          severityGlyph: "Ⅱ",
          statusGlyph: "…",
          label: "물리적 위협 포격. 심각도 중간. 예고 중. 타일 4, 5",
        },
        {
          id: "false-report",
          position: { x: 6, y: 2 },
          category: "informational",
          kind: "misinformation",
          severity: "high",
          state: "resolved",
          result: "blocked",
          health: 90,
          glyph: "?",
          severityGlyph: "Ⅲ",
          statusGlyph: "✓",
          label: "정보 위협 허위 정보. 심각도 높음. 차단됨. 타일 6, 2",
        },
      ],
    });

    const canvas = host.querySelector("canvas");
    expect(canvas?.dataset.threatMarkerCount).toBe("2");
    expect(canvas?.dataset.threatMarkerCategories).toBe("physical,informational");
    expect(canvas?.getAttribute("aria-label")).toContain(
      "식별된 위협: 물리적 위협 포격. 심각도 중간. 예고 중. 타일 4, 5",
    );
    expect(canvas?.getAttribute("aria-label")).toContain(
      "정보 위협 허위 정보. 심각도 높음. 차단됨. 타일 6, 2",
    );
    viewport.destroy();
  });
});
