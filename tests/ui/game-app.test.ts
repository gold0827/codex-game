import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGameSession, type GameSession } from "../../src/application/game-session";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
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

function silentAudio(): GameAudio {
  let muted = false;
  return {
    cue: () => undefined,
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
    report?.querySelector<HTMLButtonElement>('[data-action="route-report"]')?.click();
    action("resume").click();
    scheduler.frame(frameTime);
    expect(root.querySelector(".tutorial-guidance")).toBeNull();
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    document.body.innerHTML = '<div id="test-root"></div>';
    root = document.querySelector("#test-root")!;
    session = createGameSession(completeCampaign, "ui-test-seed");
    scheduler = new DeterministicFrameScheduler();
    frameTime = 0;
    app = mountGameApp(root, completeCampaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(),
    });
  });

  afterEach(() => {
    app.destroy();
    vi.restoreAllMocks();
  });

  it("configures the authored briefing and starts the real session", () => {
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
    expect(session.read().phase).toBe("operation");
    expect(root.querySelector("[data-phase='operation']")).not.toBeNull();
    expect(action("pause").textContent).toBe("일시정지");
    expect(root.querySelectorAll("[data-action^='speed-']")).toHaveLength(3);
    expect(root.querySelector("[data-region='event-flow']")).not.toBeNull();
    expect(root.querySelector("[data-region='interventions']")?.textContent).toContain("회 남음");
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
    expect(root.querySelector('[data-region="reports"]')?.textContent).toContain(
      completeCampaign.scenes[0]?.beats[2]?.reports[0]?.text,
    );
    expect(session.read().tutorial.currentStep).toBeNull();
    expect(session.read().lastIntervention?.command).toEqual({
      kind: "route-report",
      reportId: "school-han-address",
      recipientOfficerId: "major-baek",
    });
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

  it("releases the persistent battlefield frame loop when destroyed", () => {
    startAttempt();
    expect(scheduler.pending()).toBeGreaterThan(0);

    app.destroy();

    expect(scheduler.pending()).toBe(0);
    expect(root.childElementCount).toBe(0);
  });

  it("presents pending decisions without simulation diagnostics", () => {
    startAttempt();
    const snapshot = session.read();
    const decisionBeat = snapshot.scene.beats.find(
      ({ id }) => id === "school-acknowledgement-loop",
    );
    if (!decisionBeat) throw new Error("Missing pending-decision test beat");

    advanceRealTime(
      decisionBeat.timeMs / snapshot.scene.gameplayTuning.simulationSpeed,
    );

    const rawReason = session.read().operation?.officers[0]?.pendingDecision?.reason;
    if (!rawReason) throw new Error("Missing pending-decision diagnostic reason");
    expect(rawReason).toContain(decisionBeat.id);

    const officerText = root.querySelector('[data-region="officers"]')?.textContent;
    expect(officerText).toContain("판단 준비 중");
    expect(officerText).not.toContain(rawReason);
    expect(officerText).not.toContain(decisionBeat.id);
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
    expect(action("continue-campaign").textContent).toBe("다시 시도");
    action("continue-campaign").click();
    expect(session.read()).toMatchObject({ phase: "briefing", attemptNumber: 2 });
  });

  it("continues every successful debrief into the epilogue and resets", () => {
    const playedScenes: string[] = [];

    while (session.read().phase !== "epilogue") {
      playedScenes.push(session.read().scene.identity.id);
      startAttempt();
      if (session.read().scene.identity.kind === "tutorial") completeTutorial();

      const snapshot = session.read();
      const remaining =
        snapshot.scene.encounterParameters.durationMs -
        (snapshot.operation?.elapsedMs ?? 0);
      advanceRealTime(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 2);

      expect(session.read().phase).toBe("debrief");
      expect(root.querySelector("[data-phase='debrief']")?.textContent).toContain(
        session.read().scene.copy.success,
      );
      expect(action("continue-campaign").textContent).toBe("다음 작전");
      action("continue-campaign").click();
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
});
