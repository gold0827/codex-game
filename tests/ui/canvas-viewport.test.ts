import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BattlefieldFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import { createCanvasBattlefieldViewport } from "../../src/presentation/battlefield/internal/canvasViewport";
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

const frame = (x: number): BattlefieldFrame => ({
  actors: [{
    id: "major-baek",
    position: { x, y: 7 },
    action: "walk",
    facing: "east",
    health: 82,
    cues: [],
    selected: true,
  }],
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
    const previous = { frame: frame(2), receivedAt: 0 };
    const current = { frame: frame(10), receivedAt: 100 };

    expect(createBattlefieldDrawList(previous, current, 100).actors[0]?.x).toBe(2);
    expect(createBattlefieldDrawList(previous, current, 150).actors[0]?.x).toBe(6);
    expect(createBattlefieldDrawList(previous, current, 200).actors[0]?.x).toBe(10);
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
});
