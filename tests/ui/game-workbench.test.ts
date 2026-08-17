import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLocalStorageCampaignRepository,
  type CampaignKeyValueStore,
} from "../../src/campaign";
import type { GameSession } from "../../src/application/game-session";
import type { GameSessionResume } from "../../src/application/game-session";
import { createCampaignCheckpoint } from "../../src/app/CampaignCheckpoint";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { productionSoundtrackCatalog } from "../../src/app/musicCatalog";
import { flowCampaign } from "../fixtures/flow-campaign";
import type { GameAudio } from "../../src/ui/GameAudio";
import type { GameFrameScheduler } from "../../src/ui/GameApp";
import {
  mountGameWorkbench,
  type GameWorkbench,
} from "../../src/app/GameWorkbench";

class MemoryStorage implements CampaignKeyValueStore {
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

function advanceToOperationTime(
  session: GameSession,
  operationElapsedMs: number,
): void {
  const simulationSpeed = session.read().scene.gameplayTuning.simulationSpeed;
  session.advance(operationElapsedMs / simulationSpeed);
}

function finishSuccessfulAttempt(session: GameSession): void {
  const routeStep = session
    .read()
    .scene.guidance.find((step) => step.action === "route");
  if (routeStep?.action === "route") {
    const reportBeat = session.read().scene.beats.find((beat) =>
      beat.reports.some(({ id }) => id === routeStep.target.reportId),
    );
    advanceToOperationTime(session, reportBeat?.timeMs ?? 0);
    if (session.read().tutorial.currentStep?.action === "pause") {
      session.dispatch({ type: "pause" });
    }
    const inspectStep = session.read().tutorial.currentStep;
    if (inspectStep?.action === "inspect") {
      session.dispatch({ type: "inspect-officer", officerId: inspectStep.target.officerId });
    }
    session.dispatch({
      type: "route-report",
      reportId: routeStep.target.reportId,
      recipientOfficerId: routeStep.target.recipientOfficerId,
    });
    if (session.read().tutorial.currentStep?.action === "resume") {
      session.dispatch({ type: "resume" });
    }
  }
  const operation = session.read();
  if (operation.scene.identity.id === "night-switchboard") {
    const message = operation.operation?.messages[0];
    const missingRecipient = completeCampaign.officers.find(({ id }) =>
      id !== message?.sourceOfficerId && !message?.recipientOfficerIds.includes(id));
    if (!message || !missingRecipient) {
      throw new Error("Night switchboard requires one missing report recipient.");
    }
    session.dispatch({
      type: "route-report",
      reportId: message.authoredReportId,
      recipientOfficerId: missingRecipient.id,
    });
  }
  const snapshot = session.read();
  const remaining =
    snapshot.scene.encounterParameters.durationMs -
    (snapshot.operation?.elapsedMs ?? 0);
  session.advance(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 1);
}

describe("game workbench", () => {
  let root: HTMLElement;
  let storage: MemoryStorage;
  let scheduler: DeterministicScheduler;
  let disposedAudio: number;
  let workbench: GameWorkbench;

  const audioFactory = (): GameAudio => ({
    cue: () => undefined,
    setSoundtrack: () => undefined,
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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    document.body.innerHTML = '<div id="root"></div>';
    root = document.querySelector("#root")!;
    storage = new MemoryStorage();
    scheduler = new DeterministicScheduler();
    disposedAudio = 0;
    workbench = mountGameWorkbench(root, completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, storage),
      frameScheduler: scheduler,
      audioFactory,
      audioCredits: productionSoundtrackCatalog,
      seed: "workbench-test",
    });
  });

  afterEach(() => {
    workbench.destroy();
    vi.restoreAllMocks();
  });

  it("keeps the field manual available in every game phase", () => {
    workbench.destroy();
    storage = new MemoryStorage();
    workbench = mountGameWorkbench(root, flowCampaign, {
      repository: createLocalStorageCampaignRepository(flowCampaign, storage),
      frameScheduler: scheduler,
      audioFactory,
      seed: "workbench-flow",
    });
    const expectManualOpens = (): void => {
      expect(action("open-manual").hidden).toBe(false);
      action("open-manual").click();
      expect(root.querySelector<HTMLElement>(".workbench-manual")?.hidden).toBe(false);
      action("close-manual").click();
    };

    expect(workbench.session().read().phase).toBe("briefing");
    expectManualOpens();
    workbench.session().dispatch({ type: "start-attempt" });
    expect(workbench.session().read().phase).toBe("operation");
    expectManualOpens();
    finishSuccessfulAttempt(workbench.session());
    expect(workbench.session().read().phase).toBe("debrief");
    expectManualOpens();

    const operationCount = flowCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    ).length;
    let completedOperations = 1;
    while (workbench.session().read().phase !== "epilogue") {
      const lesson = workbench.session().read().debrief?.lessonChoices[0];
      if (!lesson) throw new Error("A successful operation must offer a lesson.");
      workbench.session().dispatch({ type: "choose-lesson", lessonId: lesson.id });
      if (workbench.session().read().phase === "epilogue") break;
      if (completedOperations >= operationCount) {
        throw new Error("Campaign did not reach the epilogue within the authored operations.");
      }
      workbench.session().dispatch({ type: "start-attempt" });
      finishSuccessfulAttempt(workbench.session());
      completedOperations += 1;
    }
    expect(workbench.session().read().phase).toBe("epilogue");
    expectManualOpens();
  });

  it("explains the complete campaign and keeps scrolling inside the overlay", () => {
    action("open-manual").click();
    const overlay = root.querySelector<HTMLElement>(".workbench-manual")!;
    const content = root.querySelector<HTMLElement>(".field-manual-content")!;

    expect(overlay.textContent).toContain("브리핑에서 지휘 조건 설정");
    expect(overlay.textContent).toContain("자율 작전 관찰");
    expect(overlay.textContent).toContain("0.5배속, 1배속, 2배속");
    expect(overlay.textContent).toContain("제한된 직접 개입");
    expect(overlay.textContent).toContain("여섯 작전과 졸업");
    expect(overlay.textContent).toContain("별도 도구 · 장면 편집");
    expect(overlay.textContent).toContain("배경음악 출처");
    expect(overlay.querySelectorAll(".audio-credit-list li")).toHaveLength(
      productionSoundtrackCatalog.length,
    );
    expect(overlay.querySelector<HTMLAnchorElement>(".audio-credit-list a")?.href).toBe(
      productionSoundtrackCatalog[0].sourcePageUrl,
    );
    expect(overlay.contains(content)).toBe(true);
    document.documentElement.scrollTop = 0;
    content.scrollTop = 160;
    expect(content.scrollTop).toBe(160);
    expect(document.documentElement.scrollTop).toBe(0);
    action("close-manual").click();
    action("open-manual").click();
    expect(content.scrollTop).toBe(0);
  });

  it("pauses only an operation that the field manual found running", () => {
    action("start-attempt").click();
    action("open-manual").click();
    expect(workbench.session().read().paused).toBe(true);
    action("close-manual").click();
    expect(workbench.session().read().paused).toBe(false);

    workbench.session().dispatch({ type: "pause" });
    action("open-manual").click();
    action("close-manual").click();
    expect(workbench.session().read().paused).toBe(true);
  });

  it("keeps the field manual and scene editor mutually exclusive", () => {
    action("start-attempt").click();
    workbench.openTool("manual");
    expect(root.querySelector<HTMLElement>(".workbench-manual")?.hidden).toBe(false);

    workbench.openTool("editor");
    expect(root.querySelector<HTMLElement>(".workbench-manual")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);
    expect(workbench.session().read().paused).toBe(true);

    workbench.openTool("manual");
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-manual")?.hidden).toBe(false);
    workbench.closeTool("manual");
    expect(workbench.session().read().paused).toBe(false);
  });

  it("keeps one pause while switching across every workbench overlay", () => {
    action("start-attempt").click();

    workbench.openTool("manual");
    workbench.openTool("settings");
    expect(root.querySelector<HTMLElement>(".workbench-manual")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-settings")?.hidden).toBe(false);
    expect(workbench.session().read().paused).toBe(true);

    workbench.openTool("editor");
    expect(root.querySelector<HTMLElement>(".workbench-settings")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);
    expect(workbench.session().read().paused).toBe(true);

    workbench.closeTool("editor");
    expect(workbench.session().read().paused).toBe(false);
    expect(document.activeElement).toBe(action("open-editor"));
  });

  it("pauses an active operation while the editor is open and resumes on close", () => {
    action("start-attempt").click();
    expect(workbench.session().read().phase).toBe("operation");
    expect(workbench.session().read().paused).toBe(false);

    action("open-editor").click();
    expect(workbench.session().read().paused).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);
    action("close-editor").click();
    expect(workbench.session().read().paused).toBe(false);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(true);
  });

  it("restarts a deep-cloned edited campaign and destroys the previous game app", () => {
    const previousSession = workbench.session();
    action("start-attempt").click();
    expect(scheduler.callbacks.size).toBeGreaterThan(0);
    workbench.openTool("editor");
    const title = root.querySelector<HTMLInputElement>('[data-field="copy.title"]')!;
    title.value = "재시작에 반영된 제목";
    action("apply-scene").click();
    action("restart-game").click();

    expect(workbench.session()).not.toBe(previousSession);
    expect(workbench.session().read().scene.copy.title).toBe("재시작에 반영된 제목");
    expect(root.querySelector(".workbench-game")?.textContent).toContain("재시작에 반영된 제목");
    expect(disposedAudio).toBe(1);
    expect(scheduler.cancelled.length).toBeGreaterThan(0);
    expect(root.querySelector<HTMLElement>(".workbench-editor")?.hidden).toBe(false);

    const mutableSnapshot = workbench.document.snapshot() as unknown as {
      scenes: Array<{ copy: { title: string } }>;
    };
    mutableSnapshot.scenes[0]!.copy.title = "외부 변이";
    expect(workbench.session().read().scene.copy.title).toBe("재시작에 반영된 제목");
  });

  it("loads a saved override and restore returns both editor and game to authored content", () => {
    const override = structuredClone(completeCampaign) as unknown as {
      scenes: Array<{ copy: { title: string } }>;
    };
    override.scenes[0]!.copy.title = "저장된 시작 제목";
    storage.setItem(`campaign-document:${completeCampaign.id}`, JSON.stringify(override));
    workbench.destroy();
    workbench = mountGameWorkbench(root, completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, storage),
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.session().read().scene.copy.title).toBe("저장된 시작 제목");

    workbench.openTool("editor");
    action("restore-campaign").click();
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(workbench.session().read().scene.copy.title).toBe(
      completeCampaign.scenes[0]!.copy.title,
    );
    expect(storage.values.size).toBe(0);
  });

  it("falls back to authored content and shows a Korean diagnostic for invalid storage", () => {
    workbench.destroy();
    const invalidStorage: CampaignKeyValueStore = {
      getItem: () => "not-json",
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    workbench = mountGameWorkbench(root, completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, invalidStorage),
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(workbench.session().read().scene.copy.title).toBe(
      completeCampaign.scenes[0]!.copy.title,
    );
    expect(root.querySelector(".workbench-notice")?.textContent).toContain(
      "저장된 캠페인을 불러오지 못했습니다.",
    );
  });

  it("falls back and reports when storage cannot be read", () => {
    workbench.destroy();
    const unreadableStorage: CampaignKeyValueStore = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    workbench = mountGameWorkbench(root, completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, unreadableStorage),
      frameScheduler: scheduler,
      audioFactory,
    });
    expect(workbench.document.snapshot()).toEqual(completeCampaign);
    expect(root.querySelector(".workbench-notice")?.textContent).toContain(
      "저장된 캠페인을 불러오지 못했습니다.",
    );
  });

  it("pauses behind persisted player settings and hides production authoring", () => {
    workbench.destroy();
    let savedSettings: unknown = {
      muted: false,
      masterVolume: 0.9,
      musicVolume: 0.6,
      effectsVolume: 0.7,
      reducedMotion: false,
      showTutorial: true,
      uiScale: "standard",
    };
    workbench = mountGameWorkbench(root, completeCampaign, {
      frameScheduler: scheduler,
      audioFactory,
      editorEnabled: false,
      settingsStore: {
        load: () => savedSettings,
        save: (settings) => { savedSettings = structuredClone(settings); },
      },
    });

    expect(root.querySelector('[data-action="open-editor"]')).toBeNull();
    action("start-attempt").click();
    action("open-settings").click();
    expect(workbench.session().read().paused).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-game")?.inert).toBe(true);
    const requestFullscreen = vi.fn(async () => undefined);
    const shell = root.querySelector<HTMLElement>(".game-workbench")!;
    shell.requestFullscreen = requestFullscreen;
    document.dispatchEvent(new Event("fullscreenchange"));
    action("toggle-fullscreen").click();
    expect(requestFullscreen).toHaveBeenCalledOnce();

    const uiScale = root.querySelector<HTMLSelectElement>('[data-setting="uiScale"]')!;
    uiScale.value = "large";
    uiScale.dispatchEvent(new Event("change", { bubbles: true }));
    const reducedMotion = root.querySelector<HTMLInputElement>(
      '[data-setting="reducedMotion"]',
    )!;
    reducedMotion.checked = true;
    reducedMotion.dispatchEvent(new Event("change", { bubbles: true }));

    expect(savedSettings).toMatchObject({ uiScale: "large", reducedMotion: true });
    expect(root.querySelector<HTMLElement>(".game-workbench")?.dataset.uiScale).toBe("large");
    action("close-settings").click();
    expect(workbench.session().read().paused).toBe(false);
    expect(root.querySelector<HTMLElement>(".workbench-game")?.inert).toBe(false);
    expect(document.activeElement).toBe(action("open-settings"));
  });

  it("restores campaign checkpoints and confirms a new game", () => {
    workbench.destroy();
    let saved: GameSessionResume | null = null;
    const checkpoint = createCampaignCheckpoint({
      load: () => saved,
      save: (resume) => { saved = structuredClone(resume); },
      clear: () => { saved = null; },
    });
    workbench = mountGameWorkbench(root, completeCampaign, {
      frameScheduler: scheduler,
      audioFactory,
      checkpoint,
      seed: "checkpoint-test",
    });

    action("start-attempt").click();
    finishSuccessfulAttempt(workbench.session());
    const lesson = workbench.session().read().debrief?.lessonChoices[0];
    if (!lesson) throw new Error("Expected a lesson choice");
    workbench.session().dispatch({ type: "choose-lesson", lessonId: lesson.id });
    action("open-settings").click();
    const reducedMotion = root.querySelector<HTMLInputElement>(
      '[data-setting="reducedMotion"]',
    )!;
    reducedMotion.checked = true;
    reducedMotion.dispatchEvent(new Event("change", { bubbles: true }));
    const nextSceneId = completeCampaign.scenes[1]!.identity.id;
    expect(saved).toMatchObject({ progress: { currentSceneId: nextSceneId } });

    workbench.destroy();
    workbench = mountGameWorkbench(root, completeCampaign, {
      frameScheduler: scheduler,
      audioFactory,
      checkpoint,
      seed: "checkpoint-test",
    });
    expect(workbench.session().read()).toMatchObject({
      phase: "briefing",
      scene: { identity: { id: nextSceneId } },
    });

    action("open-settings").click();
    action("request-new-game").click();
    expect(root.querySelector<HTMLElement>(
      '[data-region="new-game-confirmation"]',
    )?.hidden).toBe(false);
    action("confirm-new-game").click();
    expect(workbench.session().read().scene.identity.id).toBe(completeCampaign.startSceneId);
    expect(root.querySelector<HTMLElement>(".workbench-settings")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".workbench-game")?.inert).toBe(false);
  });

  it("recovers safely from a malformed progress checkpoint", () => {
    workbench.destroy();
    workbench = mountGameWorkbench(root, completeCampaign, {
      frameScheduler: scheduler,
      audioFactory,
      checkpoint: createCampaignCheckpoint({
        load: () => ({ broken: true }),
        save: () => undefined,
        clear: () => undefined,
      }),
    });

    expect(workbench.session().read().scene.identity.id).toBe(completeCampaign.startSceneId);
    expect(root.querySelector(".workbench-notice")?.textContent).toContain(
      "새 게임으로 시작했습니다",
    );
  });

  it("destroys frame and audio resources and clears the mount", () => {
    action("start-attempt").click();
    workbench.destroy();
    workbench.openTool("manual");
    workbench.openTool("settings");
    workbench.openTool("editor");
    workbench.closeTool("manual");
    workbench.closeTool("settings");
    workbench.closeTool("editor");
    expect(disposedAudio).toBe(1);
    expect(scheduler.cancelled.length).toBeGreaterThan(0);
    expect(root.childElementCount).toBe(0);
  });
});
