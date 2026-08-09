import { beforeEach, describe, expect, it } from "vitest";

import type { CampaignStorage } from "../../src/editor";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import type { GameAudio } from "../../src/ui/GameAudio";
import type { GameFrameScheduler } from "../../src/ui/GameApp";
import {
  mountGameWorkbench,
  type GameWorkbench,
} from "../../src/ui/GameWorkbench";

class MemoryStorage implements CampaignStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class DeterministicScheduler implements GameFrameScheduler {
  nextHandle = 1;
  callbacks = new Map<number, FrameRequestCallback>();
  cancelled: number[] = [];

  request(callback: FrameRequestCallback): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }
}

describe("game workbench", () => {
  let root: HTMLElement;
  let storage: MemoryStorage;
  let scheduler: DeterministicScheduler;
  let disposedAudio: number;
  let workbench: GameWorkbench;

  const audioFactory = (): GameAudio => ({
    cue: () => undefined,
    muted: () => true,
    setMuted: () => undefined,
    dispose: () => { disposedAudio += 1; },
  });

  const action = (name: string): HTMLButtonElement => {
    const result = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    if (!result) throw new Error(`Missing action: ${name}`);
    return result;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.querySelector("#root")!;
    storage = new MemoryStorage();
    scheduler = new DeterministicScheduler();
    disposedAudio = 0;
    workbench = mountGameWorkbench(root, completeCampaign, {
      storage,
      frameScheduler: scheduler,
      audioFactory,
      seed: "workbench-test",
    });
  });

  it("pauses an active operation while the editor is open and resumes on close", () => {
    action("start-attempt").click();
    expect(workbench.controller().snapshot().phase).toBe("operation");
    expect(workbench.controller().snapshot().paused).toBe(false);

    action("open-editor").click();
    expect(workbench.controller().snapshot().paused).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);
    action("close-editor").click();
    expect(workbench.controller().snapshot().paused).toBe(false);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(true);
  });

  it("restarts a deep-cloned edited campaign and destroys the previous game app", () => {
    const previousController = workbench.controller();
    action("start-attempt").click();
    expect(scheduler.callbacks.size).toBeGreaterThan(0);
    workbench.openEditor();
    const title = root.querySelector<HTMLInputElement>('[data-field="copy.title"]')!;
    title.value = "재시작에 반영된 제목";
    action("apply-scene").click();
    action("restart-game").click();

    expect(workbench.controller()).not.toBe(previousController);
    expect(workbench.controller().snapshot().scene.copy.title).toBe("재시작에 반영된 제목");
    expect(root.querySelector(".workbench-game")?.textContent).toContain("재시작에 반영된 제목");
    expect(disposedAudio).toBe(1);
    expect(scheduler.cancelled.length).toBeGreaterThan(0);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);

    const mutableSnapshot = workbench.document.snapshot() as unknown as {
      scenes: Array<{ copy: { title: string } }>;
    };
    mutableSnapshot.scenes[0]!.copy.title = "외부 변이";
    expect(workbench.controller().snapshot().scene.copy.title).toBe("재시작에 반영된 제목");
  });

  it("loads a saved override and restore returns both editor and game to authored content", () => {
    const override = structuredClone(completeCampaign) as unknown as {
      scenes: Array<{ copy: { title: string } }>;
    };
    override.scenes[0]!.copy.title = "저장된 시작 제목";
    storage.setItem(`campaign-document:${completeCampaign.id}`, JSON.stringify(override));
    workbench.destroy();
    workbench = mountGameWorkbench(root, completeCampaign, {
      storage,
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.controller().snapshot().scene.copy.title).toBe("저장된 시작 제목");

    workbench.openEditor();
    action("restore-campaign").click();
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(workbench.controller().snapshot().scene.copy.title).toBe(
      completeCampaign.scenes[0]!.copy.title,
    );
    expect(storage.values.size).toBe(0);
  });

  it("falls back to authored content and shows a Korean diagnostic for invalid storage", () => {
    workbench.destroy();
    const invalidStorage: CampaignStorage = {
      getItem: () => "not-json",
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    workbench = mountGameWorkbench(root, completeCampaign, {
      storage: invalidStorage,
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(workbench.controller().snapshot().scene.copy.title).toBe(
      completeCampaign.scenes[0]!.copy.title,
    );
    expect(root.querySelector(".workbench-notice")?.textContent).toContain(
      "저장된 캠페인을 불러오지 못했습니다.",
    );
  });

  it("falls back and reports when storage cannot be read", () => {
    workbench.destroy();
    const unreadableStorage: CampaignStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    workbench = mountGameWorkbench(root, completeCampaign, {
      storage: unreadableStorage,
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(root.querySelector(".workbench-notice")?.textContent).toContain(
      "저장된 캠페인을 불러오지 못했습니다.",
    );
  });

  it("destroys frame and audio resources and clears the mount", () => {
    action("start-attempt").click();
    workbench.destroy();
    expect(disposedAudio).toBe(1);
    expect(scheduler.cancelled.length).toBeGreaterThan(0);
    expect(root.childElementCount).toBe(0);
  });
});
