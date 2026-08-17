import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGameSession, type GameSession } from "../../src/application/game-session";
import type { CampaignDefinition } from "../../src/campaign";
import { bridgeDefenseCampaign } from "../../src/scenarios/bridgeDefenseOperation";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { flowCampaign } from "../fixtures/flow-campaign";
import type { GameAudio } from "../../src/ui/GameAudio";
import {
  mountGameApp,
  type GameApp,
  type GameFrameScheduler,
} from "../../src/ui/GameApp";

class DeterministicFrameScheduler implements GameFrameScheduler {
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

  pending(): number {
    return this.callbacks.size;
  }

  frame(timestamp: number): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(timestamp));
  }
}

function silentAudio(cues: string[] = [], soundtracks: string[] = []): GameAudio {
  let muted = false;
  return {
    cue: (cue) => { cues.push(cue); },
    setSoundtrack: (soundtrackId) => {
      if (soundtrackId) soundtracks.push(soundtrackId);
    },
    muted: () => muted,
    setMuted: (next) => {
      muted = next;
    },
    dispose: () => undefined,
  };
}

describe("production game app", () => {
  let root: HTMLElement;
  let session: GameSession;
  let scheduler: DeterministicFrameScheduler;
  let app: GameApp;
  let frameTime: number;
  let audioCues: string[];
  let soundtracks: string[];

  const action = (name: string): HTMLButtonElement => {
    const result = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    if (!result) throw new Error(`Missing action ${name}`);
    return result;
  };

  const startAttempt = (): void => {
    action("start-attempt").click();
    scheduler.frame(frameTime);
  };

  const advanceRealTime = (milliseconds: number): void => {
    frameTime += milliseconds;
    scheduler.frame(frameTime);
  };

  const completeTutorial = (): void => {
    const snapshot = session.read();
    const reportBeat = snapshot.scene.beats.find((beat) =>
      beat.reports.some(({ id }) => id === "school-han-address"),
    );
    advanceRealTime((reportBeat?.timeMs ?? 0) / snapshot.scene.gameplayTuning.simulationSpeed);
    expect(root.querySelector(".tutorial-guidance")?.textContent).toContain("작전 시간을 멈춘다");
    action("pause").click();

    const officer = root.querySelector<HTMLElement>('[data-officer-id="major-baek"]');
    expect(officer?.classList.contains("guidance-target")).toBe(true);
    officer?.querySelector<HTMLButtonElement>('[data-action="inspect-officer"]')?.click();

    const report = root.querySelector<HTMLElement>('[data-report-id="school-han-address"]');
    expect(report?.classList.contains("guidance-target")).toBe(true);
    expect(report?.querySelector<HTMLSelectElement>("select")?.value).toBe("major-baek");
    const routeGuidance = root.querySelector<HTMLElement>(".tutorial-guidance")?.textContent ?? "";
    const displayedReportCopy = report?.querySelector("blockquote")?.textContent ?? "";
    expect(routeGuidance).toContain(displayedReportCopy);
    expect(routeGuidance).toContain("소령 백돌격");
    expect(routeGuidance).not.toMatch(/school-han-address|major-baek/);
    report?.querySelector<HTMLButtonElement>('[data-action="route-report"]')?.click();
    action("resume").click();
    scheduler.frame(frameTime);
    expect(root.querySelector(".tutorial-guidance")).toBeNull();
  };

  const completeSharedBeliefObjective = (): void => {
    const snapshot = session.read();
    if (snapshot.scene.identity.id !== "night-switchboard") return;
    const message = snapshot.operation?.messages[0];
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
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    document.body.innerHTML = '<div id="test-root"></div>';
    root = document.querySelector("#test-root")!;
    session = createGameSession(completeCampaign, "ui-test-seed");
    scheduler = new DeterministicFrameScheduler();
    frameTime = 0;
    audioCues = [];
    soundtracks = [];
    app = mountGameApp(root, completeCampaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(audioCues, soundtracks),
    });
  });

  afterEach(() => {
    app.destroy();
    vi.restoreAllMocks();
  });

  it("configures the authored briefing and starts the real session", () => {
    expect(soundtracks).toEqual(["two-blinks-march"]);
    expect(root.querySelector("[data-phase='briefing']")).not.toBeNull();
    expect(root.textContent).toContain(completeCampaign.scenes[0]?.copy.briefing);
    expect(root.querySelectorAll("[data-harness-axis]")).toHaveLength(4);
    expect(root.textContent).toContain("남음");
    expect(root.textContent).toContain("보급 상자를 표시 천막까지 보낸다");

    const information = root.querySelector<HTMLInputElement>(
      '[data-harness-axis="informationReach"]',
    )!;
    information.value = "1";
    information.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("자원 한도");
    expect(session.read().harness.informationReach).not.toBe(1);

    startAttempt();
    expect(audioCues).toContain("movement");
    expect(session.read().phase).toBe("operation");
    expect(root.querySelector("[data-phase='operation']")).not.toBeNull();
    expect(action("pause").textContent).toBe("일시정지");
    expect(root.querySelectorAll("[data-action^='speed-']")).toHaveLength(3);
    expect(root.querySelector("[data-region='event-flow']")).not.toBeNull();
    const firstBeat = completeCampaign.scenes[0]?.beats[0];
    const beatEvent = root.querySelector<HTMLElement>(".event-beat-activated");
    expect(beatEvent?.textContent).toContain(firstBeat?.headline);
    expect(beatEvent?.textContent).toContain(firstBeat?.description);
    expect(beatEvent?.textContent).not.toContain(firstBeat?.id);
    const firstReport = root.querySelector<HTMLElement>(".report-card");
    expect(firstReport?.querySelector(".report-tone")?.textContent).toBe("어조 · 확신");
    expect(firstReport?.textContent).not.toContain(firstBeat?.reports[0]?.id);
    expect(root.querySelector("[data-region='interventions']")?.textContent).toContain("개입 자원");
    expect(root.querySelector(".operation-grid")?.children[1]?.getAttribute("data-region")).toBeNull();
    expect(root.querySelector(".operation-grid")?.children[1]?.querySelector("[data-region='battlefield']")).not.toBeNull();
  });

  it("renders live state and advances authored tutorial actions in order", () => {
    startAttempt();
    completeTutorial();

    const battlefield = root.querySelector<HTMLElement>('[data-region="battlefield"]');
    expect(battlefield?.querySelector("canvas.battlefield-canvas")).not.toBeNull();
    expect(battlefield?.getAttribute("aria-label")).toBe("실시간 픽셀 전장");
    expect(root.querySelector('[data-region="officers"]')?.textContent).toContain("현재 믿음");
    expect(root.querySelector('[data-region="officers"]')?.textContent).toContain("체력");
    expect(root.querySelector('[data-region="reports"]')?.textContent).not.toContain(
      completeCampaign.scenes[0]?.beats[2]?.reports[0]?.text,
    );
    expect(root.querySelector('[data-region="reports"]')?.textContent).toContain("전송 대기");
    expect(session.read().tutorial.currentStep).toBeNull();
    expect(session.read().lastIntervention?.command).toEqual({
      kind: "route-report",
      reportId: "school-han-address",
      recipientOfficerId: "major-baek",
    });
  });

  it("renders the Haein bridge inspect target without its internal officer id", () => {
    app.destroy();
    session = createGameSession(bridgeDefenseCampaign, "bridge-guidance-copy");
    app = mountGameApp(root, bridgeDefenseCampaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
    startAttempt();
    action("pause").click();

    const guidance = root.querySelector<HTMLElement>(".tutorial-guidance");
    expect(guidance?.textContent).toContain("대위 한확인");
    expect(guidance?.textContent).not.toContain("captain-han");
  });

  it("targets routed report cards by their unique runtime message identity", () => {
    app.destroy();
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable report scene.");
    }
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [];
    Object.assign(scene, {
      gameplayTuning: { ...scene.gameplayTuning, interventionBudget: 4 },
    });
    session = createGameSession(campaign, "runtime-report-ui");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0,
        authorityClarity: 0,
        verificationDepth: 0,
        feedbackCompression: 0,
      },
    });
    app = mountGameApp(root, campaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
    startAttempt();
    const original = session.read().operation?.messages[0];
    if (!original) throw new Error("Expected an authored report message.");
    session.dispatch({
      type: "route-report",
      reportId: original.id,
      recipientOfficerId: "captain-han",
    });
    app.render();
    const routed = session.read().operation?.messages.find(({ id }) => id !== original.id);
    if (!routed) throw new Error("Expected a routed runtime report message.");

    const originalCard = root.querySelector<HTMLElement>(`[data-report-id="${original.id}"]`);
    const routedCard = root.querySelector<HTMLElement>(`[data-report-id="${routed.id}"]`);
    expect(originalCard).not.toBeNull();
    expect(routedCard).not.toBeNull();
    expect(routedCard?.textContent).not.toContain(routed.id);

    routedCard?.querySelector<HTMLButtonElement>('[data-action="route-report"]')?.click();
    expect(session.read().lastIntervention?.command).toEqual({
      kind: "route-report",
      reportId: routed.id,
      recipientOfficerId: "major-baek",
    });

    const refreshedRoutedCard = root.querySelector<HTMLElement>(`[data-report-id="${routed.id}"]`);
    const prioritizeRouted = refreshedRoutedCard
      ?.querySelector<HTMLButtonElement>('[data-action="prioritize-verification"]');
    expect(prioritizeRouted).not.toBeNull();
    expect(prioritizeRouted?.disabled).toBe(false);
    prioritizeRouted?.click();

    expect(session.read().lastIntervention?.command).toEqual({
      kind: "prioritize-verification",
      reportId: routed.id,
    });
    expect(session.read().operation?.messages.find(({ id }) => id === routed.id)?.prioritized)
      .toBe(true);
    expect(session.read().operation?.messages.find(({ id }) => id === original.id)?.prioritized)
      .toBe(false);
  });

  it("renders the same weak received copy shown in the recipient officer belief", () => {
    app.destroy();
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable report scene.");
    }
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [];
    session = createGameSession(campaign, "weak-report-ui");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0.5,
        authorityClarity: 0.5,
        verificationDepth: 0.4,
        feedbackCompression: 0,
      },
    });
    app = mountGameApp(root, campaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
    startAttempt();
    const queuedSnapshot = session.read();
    const queued = queuedSnapshot.operation?.messages[0];
    if (!queued) throw new Error("Expected a queued report message.");
    const queuedCard = root.querySelector<HTMLElement>(`[data-report-id="${queued.id}"]`);

    expect(queuedCard?.dataset.deliveryState).toBe("queued");
    expect(queuedCard?.querySelector(".report-transmission-state")?.textContent)
      .toBe("전송 대기 · 아직 수신되지 않음");
    expect(queuedCard?.querySelector("blockquote")?.textContent).not.toContain(queued.text);

    session.advance(
      queued.deliveryAtMs / queuedSnapshot.scene.gameplayTuning.simulationSpeed,
    );
    const delivered = session.read().operation?.messages.find(({ id }) => id === queued.id);
    if (!delivered) throw new Error("Expected a delivered report message.");
    session.dispatch({
      type: "inspect-officer",
      officerId: delivered.recipientOfficerIds[0] ?? "",
    });
    app.render();
    const deliveredCard = root.querySelector<HTMLElement>(`[data-report-id="${queued.id}"]`);

    expect(queued.receivedText).toBe(`[불확실한 송신] ${queued.text}`);
    expect(deliveredCard?.dataset.deliveryState).toBe("delivered");
    expect(deliveredCard?.dataset.verificationState).toBe("pending");
    expect(deliveredCard?.querySelector("blockquote")?.textContent).toBe(queued.receivedText);
    expect(root.querySelector(".selected-officer-detail")?.textContent).toContain(
      queued.receivedText,
    );
  });

  it("keeps operation controls mounted between visual projection intervals", () => {
    startAttempt();
    const pause = action("pause");
    const canvas = root.querySelector("canvas.battlefield-canvas");

    advanceRealTime(16);

    expect(action("pause")).toBe(pause);
    advanceRealTime(100);
    expect(root.querySelector("canvas.battlefield-canvas")).toBe(canvas);
    action("pause").click();
    expect(session.read().paused).toBe(true);
    expect(action("resume").getAttribute("aria-pressed")).toBe("true");
  });

  it("issues a spatial signal at the battlefield tile selected by the player", () => {
    startAttempt();
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
    if (!canvas) throw new Error("battlefield canvas must be mounted");

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 320, clientY: 180 }));

    const controls = root.querySelector<HTMLElement>("[data-region='spatial-signal']");
    const kind = controls?.querySelector<HTMLSelectElement>("[data-signal-kind]");
    const strength = controls?.querySelector<HTMLSelectElement>("[data-signal-strength]");
    expect(controls?.textContent).toContain("선택 타일 12, 8");
    if (!kind || !strength) throw new Error("spatial signal controls must be mounted");
    kind.value = "defend";
    strength.value = "2";
    strength.dispatchEvent(new Event("change", { bubbles: true }));
    action("issue-spatial-signal").click();

    expect(session.read().operation?.signals.at(-1)).toMatchObject({
      kind: "defend",
      strength: 2,
      position: { x: 12, y: 8 },
    });
    expect(session.read().operation?.metrics.attentionSpent).toBe(2);
    expect(root.querySelector("[data-region='interventions']")?.textContent).toContain("개입 자원 2");
    const feedback = root.querySelector<HTMLElement>(".intervention-feedback");
    expect(feedback?.textContent).toContain("조작 · 방어 공간 신호 · 강도 2 · 타일 12, 8");
    expect(feedback?.textContent).toContain("자율성 비용 15 · 군수 비용 2 · 누적 개입 1회");
    expect(feedback?.textContent).not.toContain("issue-spatial-signal");
    const refreshedStrength = root.querySelector<HTMLSelectElement>("[data-signal-strength]");
    if (!refreshedStrength) throw new Error("spatial signal strength must remain mounted");
    expect(refreshedStrength.querySelector<HTMLOptionElement>('option[value="3"]')?.disabled).toBe(true);
    refreshedStrength.value = "3";
    refreshedStrength.dispatchEvent(new Event("change", { bubbles: true }));
    expect(action("issue-spatial-signal").disabled).toBe(true);
  });

  it("keeps battlefield keyboard focus while consecutive tile selections rerender controls", () => {
    startAttempt();
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
    if (!canvas) throw new Error("battlefield canvas must be mounted");
    canvas.focus();

    const moves = [
      ["ArrowRight", "13,8"],
      ["ArrowDown", "13,9"],
      ["ArrowLeft", "12,9"],
    ] as const;
    for (const [key, position] of moves) {
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

      expect(root.querySelector("canvas.battlefield-canvas")).toBe(canvas);
      expect(document.activeElement).toBe(canvas);
      expect(canvas.dataset.selectedTile).toBe(position);
      expect(canvas.getAttribute("aria-label")).toContain(
        `선택 타일 ${position.replace(",", ", ")}`,
      );
      expect(root.querySelector("[data-region='spatial-signal']")?.textContent).toContain(
        `선택 타일 ${position.replace(",", ", ")}`,
      );
    }
  });

  it("does not move focus to the battlefield after pointer tile selection", () => {
    startAttempt();
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
    if (!canvas) throw new Error("battlefield canvas must be mounted");
    const outside = document.createElement("button");
    document.body.prepend(outside);
    outside.focus();

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 320, clientY: 180 }));

    expect(document.activeElement).toBe(outside);
    expect(canvas.dataset.selectedTile).toBe("12,8");
    outside.remove();
  });

  it("does not restore battlefield focus after tile selection renders a terminal phase", () => {
    app.destroy();
    const campaign = structuredClone(flowCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable flow scene.");
    }
    Object.assign(scene, {
      guidance: [],
      beats: [],
      objectives: [],
      encounterParameters: { ...scene.encounterParameters, durationMs: 50 },
      gameplayTuning: { ...scene.gameplayTuning, simulationSpeed: 1 },
    });
    session = createGameSession(campaign, "terminal-tile-focus");
    app = mountGameApp(root, campaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
    startAttempt();
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
    if (!canvas) throw new Error("battlefield canvas must be mounted");
    canvas.focus();
    session.advance(50);
    expect(session.read().phase).toBe("debrief");

    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(root.querySelector("[data-phase='debrief']")).not.toBeNull();
    expect(canvas.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(canvas);
  });

  it("keeps a spatial-signal tutorial target visible until the exact signal is issued", () => {
    app.destroy();
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene) throw new Error("Expected a tutorial scene.");
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [{
      id: "defend-crossing",
      instruction: "표시된 교량에 방어 신호를 보낸다.",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "defend",
        strength: 2,
        position: { x: 11, y: 7 },
      },
      completionEvent: "spatial-signal-issued",
    }];
    session = createGameSession(campaign, "signal-guidance-ui");
    app = mountGameApp(root, campaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
    startAttempt();

    const controls = root.querySelector<HTMLElement>("[data-region='spatial-signal']");
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
    expect(root.querySelector(".tutorial-guidance")?.textContent).toContain(
      "방어 신호 · 강도 2 · 타일 11, 7",
    );
    expect(root.querySelector(".operation-screen")?.classList.contains("tutorial-active"))
      .toBe(true);
    expect(controls?.classList.contains("guidance-target")).toBe(true);
    expect(controls?.textContent).toContain("훈련 목표 타일 11, 7");
    expect(controls?.querySelector<HTMLSelectElement>("[data-signal-kind]")?.value).toBe("defend");
    expect(controls?.querySelector<HTMLSelectElement>("[data-signal-strength]")?.value).toBe("2");
    expect(canvas?.dataset.guidanceTile).toBe("11,7");
    expect(canvas?.getAttribute("aria-label")).toContain("훈련 목표 타일 11, 7");
    if (!canvas) throw new Error("Expected a battlefield canvas.");

    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 320, clientY: 180 }));
    action("issue-spatial-signal").click();

    expect(session.read().operation?.signals).toHaveLength(1);
    expect(session.read().tutorial.currentStep?.id).toBe("defend-crossing");
    expect(canvas.dataset.guidanceTile).toBe("11,7");

    expect(action("issue-spatial-signal").disabled).toBe(false);

    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(action("issue-spatial-signal").disabled).toBe(false);
    action("issue-spatial-signal").click();

    expect(session.read().operation?.signals).toHaveLength(2);
    expect(session.read().tutorial.currentStep).toBeNull();
  });

  it("renders the terminal phase even when it lands inside the render interval", () => {
    app.destroy();
    const campaign = structuredClone(flowCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable flow scene.");
    }
    Object.assign(scene, {
      guidance: [],
      beats: [],
      objectives: [],
      encounterParameters: {
        ...scene.encounterParameters,
        durationMs: 50,
      },
      gameplayTuning: {
        ...scene.gameplayTuning,
        simulationSpeed: 1,
      },
    });
    session = createGameSession(campaign, "terminal-frame-render");
    app = mountGameApp(root, campaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });

    startAttempt();
    advanceRealTime(50);

    expect(session.read().phase).toBe("debrief");
    expect(root.querySelector("[data-phase='debrief']")).not.toBeNull();
  });

  it("releases the persistent battlefield frame loop when destroyed", () => {
    startAttempt();
    expect(scheduler.pending()).toBeGreaterThan(0);

    app.destroy();

    expect(scheduler.pending()).toBe(0);
    expect(root.childElementCount).toBe(0);
  });

  it("keeps optional audio failures from blocking play or teardown", () => {
    app.destroy();
    const dispose = vi.fn(() => {
      throw new Error("audio dispose failed");
    });
    const failingAudio: GameAudio = {
      cue: () => { throw new Error("audio cue failed"); },
      setSoundtrack: () => { throw new Error("soundtrack failed"); },
      muted: () => { throw new Error("mute state failed"); },
      setMuted: () => { throw new Error("mute failed"); },
      dispose,
    };

    expect(() => {
      app = mountGameApp(root, completeCampaign, session, {
        frameScheduler: scheduler,
        audio: failingAudio,
      });
    }).not.toThrow();
    expect(() => startAttempt()).not.toThrow();
    expect(() => action("toggle-mute").click()).not.toThrow();
    expect(() => app.destroy()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
    expect(root.childElementCount).toBe(0);
  });

  it("presents committed actions without simulation diagnostics", () => {
    startAttempt();
    const snapshot = session.read();
    const decisionBeat = snapshot.scene.beats.find(
      ({ id }) => id === "school-acknowledgement-loop",
    );
    if (!decisionBeat) throw new Error("Missing committed-action test beat");

    advanceRealTime(
      decisionBeat.timeMs / snapshot.scene.gameplayTuning.simulationSpeed,
    );

    const rawReason = session.read().operation?.officers[0]?.committedAction?.trace.topReason;
    if (!rawReason) throw new Error("Missing committed-action diagnostic reason");

    const officerText = root.querySelector('[data-region="officers"]')?.textContent;
    expect(officerText).toContain("유지 중");
    expect(officerText).not.toContain(rawReason);
    expect(officerText).not.toContain(decisionBeat.id);
    expect(root.querySelectorAll(".decision-reasons li")).toHaveLength(3);
    expect(root.querySelector(".decision-abandoned")?.textContent).toContain("포기한 대안");
  });

  it("offers an authored retry after a poor configured attempt", () => {
    [
      "informationReach",
      "authorityClarity",
      "verificationDepth",
      "feedbackCompression",
    ].forEach((axis) => {
      const input = root.querySelector<HTMLInputElement>(
        `[data-harness-axis="${axis}"]`,
      )!;
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(Object.values(session.read().harness)).toEqual([0, 0, 0, 0]);

    startAttempt();
    const snapshot = session.read();
    advanceRealTime(
      snapshot.scene.encounterParameters.durationMs /
        snapshot.scene.gameplayTuning.simulationSpeed +
        2,
    );

    expect(session.read().debrief?.status).toBe("retry");
    expect(root.querySelector("[data-phase='debrief']")?.textContent).toContain(
      session.read().scene.copy.failure,
    );
    expect(root.querySelector("[data-region='objective-results']")?.textContent).toContain("미달성");
    expect(root.querySelector("[data-region='failure-causes']")?.textContent).toContain(
      "보고가 필요한 장교에게 전달되지 않았습니다.",
    );
    expect(root.querySelector("[data-phase='debrief']")?.textContent).not.toMatch(
      /point-not-preserved|threat-not-neutralized|report-not-routed|signal-school:event/,
    );
    expect(action("continue-campaign").textContent).toBe("다시 시도");
    action("continue-campaign").click();
    expect(session.read()).toMatchObject({ phase: "briefing", attemptNumber: 2 });
  });

  it("continues every successful debrief into the epilogue and resets", () => {
    app.destroy();
    session = createGameSession(flowCampaign, "ui-flow-seed");
    scheduler = new DeterministicFrameScheduler();
    frameTime = 0;
    app = mountGameApp(root, flowCampaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(audioCues),
    });
    const playedScenes: string[] = [];
    const operationCount = flowCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    ).length;

    while (session.read().phase !== "epilogue") {
      if (playedScenes.length >= operationCount) {
        throw new Error("Campaign did not reach the epilogue within the authored operations.");
      }
      playedScenes.push(session.read().scene.identity.id);
      startAttempt();
      if (session.read().scene.identity.kind === "tutorial") completeTutorial();
      if (session.read().scene.identity.id === "orchard-siege") {
        const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
        canvas?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 180 }));
        canvas?.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 320, clientY: 180 }));
        expect(action("issue-spatial-signal").disabled).toBe(true);
      }
      completeSharedBeliefObjective();

      const snapshot = session.read();
      const remaining =
        snapshot.scene.encounterParameters.durationMs -
        (snapshot.operation?.elapsedMs ?? 0);
      advanceRealTime(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 2);

      expect(session.read().phase).toBe("debrief");
      expect(root.querySelector("[data-phase='debrief']")?.textContent).toContain(
        session.read().scene.copy.success,
      );
      expect(root.querySelector("[data-region='objective-results']")?.textContent).toContain("달성");
      expect(root.querySelector("[data-region='failure-causes']")).toBeNull();
      const lessonChoices = root.querySelectorAll<HTMLButtonElement>(
        '[data-action="choose-lesson"]',
      );
      expect(lessonChoices).toHaveLength(completeCampaign.officers.length);
      expect(lessonChoices[0]?.textContent).toContain(completeCampaign.officers[0]?.name);
      const selectedLesson = session.read().debrief?.lessonChoices[0];
      lessonChoices[0]?.click();
      if (session.read().phase === "briefing") {
        const memory = root.querySelector<HTMLElement>('[data-region="officer-lessons"]');
        expect(memory?.textContent).toContain(selectedLesson?.summary);
        expect(memory?.querySelectorAll("li").length).toBeLessThanOrEqual(2);
        expect(memory?.textContent).not.toMatch(/major-baek|:lesson/);
      }
    }

    expect(playedScenes).toEqual(
      completeCampaign.scenes
        .filter(({ identity }) => identity.kind !== "epilogue")
        .map(({ identity }) => identity.id),
    );
    expect(root.querySelector("[data-phase='epilogue']")?.textContent).toContain(
      completeCampaign.scenes.at(-1)?.copy.success,
    );
    expect(root.querySelector(".pixel-garden")).not.toBeNull();
    action("reset-campaign").click();
    expect(session.read().phase).toBe("briefing");
    expect(session.read().progress.completedSceneIds).toEqual([]);
  });

  it("shows a selected officer lesson in the next briefing and operation", () => {
    startAttempt();
    completeTutorial();
    const operation = session.read();
    const remaining =
      operation.scene.encounterParameters.durationMs -
      (operation.operation?.elapsedMs ?? 0);
    advanceRealTime(remaining / operation.scene.gameplayTuning.simulationSpeed + 2);

    const lesson = session.read().debrief?.lessonChoices[0];
    if (!lesson) throw new Error("A successful operation must offer a lesson.");
    root.querySelector<HTMLButtonElement>('[data-action="choose-lesson"]')?.click();

    const memories = root.querySelector<HTMLElement>('[data-region="officer-lessons"]');
    expect(memories?.textContent).toContain("소령 백돌격");
    expect(memories?.textContent).toContain(lesson.summary);
    expect(memories?.textContent).not.toContain("대위 한확인");

    startAttempt();
    expect(root.querySelector('[data-region="officers"]')?.textContent).toContain("축적 교훈");
    expect(root.querySelector('[data-region="officers"]')?.textContent).toContain(lesson.summary);
  });
});
