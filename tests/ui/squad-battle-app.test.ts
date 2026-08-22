import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSquadBattleSession } from "../../src/application/squad-battle-session";
import type { BattlefieldMapFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import { mountSquadBattleApp, type SquadBattleApp } from "../../src/ui/SquadBattleApp";

class DeterministicScheduler {
  private nextHandle = 1;
  private callbacks = new Map<number, FrameRequestCallback>();

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

  pending(): number {
    return this.callbacks.size;
  }
}

const map: BattlefieldMapFrame = {
  id: "haein-river-bridge-dusk",
  width: 24,
  height: 16,
  tiles: [],
  locations: [],
};

describe("squad battle browser app", () => {
  let root: HTMLElement;
  let scheduler: DeterministicScheduler;
  let app: SquadBattleApp;

  const action = (name: string): HTMLButtonElement => {
    const value = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    if (!value) throw new Error(`Missing squad battle action ${name}.`);
    return value;
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    root = document.createElement("div");
    document.body.append(root);
    scheduler = new DeterministicScheduler();
    app = mountSquadBattleApp(root, createSquadBattleSession("browser-app"), map, {
      frameScheduler: scheduler,
      reducedMotion: true,
    });
  });

  afterEach(() => {
    app.destroy();
    root.remove();
    vi.restoreAllMocks();
  });

  it("renders the live battlefield, mission, squads, and command surface", () => {
    expect(root.querySelector(".squad-battle-game")?.getAttribute("data-status")).toBe("running");
    expect(root.querySelector("canvas.battlefield-canvas")?.getAttribute("data-actor-count")).toBe("18");
    expect(root.querySelectorAll("[data-squad-id]")).toHaveLength(4);
    expect(root.textContent).toContain("해인교 내구도");
    expect(root.textContent).toContain("수송대 통과");
    expect(action("relief-advance").disabled).toBe(true);
  });

  it("routes real player commands and projects deployed soldiers", () => {
    action("main-advance").click();
    action("deploy-north").click();

    expect(app.session.read().battle.squads.find(({ id }) => id === "main")?.pendingOrder)
      .toMatchObject({ order: "advance" });
    expect(app.session.read().battle.squads.find(({ id }) => id === "relief"))
      .toMatchObject({ active: true, route: "north" });
    expect(root.querySelector("canvas.battlefield-canvas")?.getAttribute("data-actor-count")).toBe("27");
    expect(action("relief-advance").disabled).toBe(false);

    scheduler.frame(0);
    scheduler.frame(5_000);
    expect(app.session.read().battle.squads.find(({ id }) => id === "main"))
      .toMatchObject({ order: "advance", pendingOrder: null });
    expect(root.querySelector('[data-squad-id="main"]')?.textContent).toContain("진군");
  });

  it("pauses, changes speed, resumes, and resets the same round", () => {
    scheduler.frame(0);
    action("pause").click();
    scheduler.frame(10_000);
    expect(app.session.read()).toMatchObject({ paused: true, battle: { elapsedMs: 0 } });

    action("speed-2").click();
    action("resume").click();
    scheduler.frame(10_000);
    scheduler.frame(12_500);
    expect(app.session.read()).toMatchObject({ speed: 2, battle: { elapsedMs: 5_000 } });

    action("reset-battle").click();
    expect(app.session.read()).toMatchObject({ paused: false, speed: 1, battle: { elapsedMs: 0 } });
    expect(root.querySelector(".squad-battle-clock")?.textContent).toContain("0 / 180초");
  });

  it("releases both app and battlefield frame work when destroyed", () => {
    expect(scheduler.pending()).toBeGreaterThan(0);
    app.destroy();
    expect(scheduler.pending()).toBe(0);
    expect(root.childElementCount).toBe(0);
  });
});
