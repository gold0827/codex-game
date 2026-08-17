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

function silentAudio(cues: string[] = []): GameAudio {
  let muted = false;
  return {
    cue: (cue) => { cues.push(cue); },
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
    app = mountGameApp(root, completeCampaign, session, {
      frameScheduler: scheduler,
      audio: silentAudio(audioCues),
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
    expect(audioCues).toContain("movement");
    expect(session.read().phase).toBe("operation");
    expect(root.querySelector("[data-phase='operation']")).not.toBeNull();
    expect(action("pause").textContent).toBe("일시정지");
    expect(root.querySelectorAll("[data-action^='speed-']")).toHaveLength(3);
    expect(root.querySelector("[data-region='event-flow']")).not.toBeNull();
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
    const refreshedStrength = root.querySelector<HTMLSelectElement>("[data-signal-strength]");
    if (!refreshedStrength) throw new Error("spatial signal strength must remain mounted");
    expect(refreshedStrength.querySelector<HTMLOptionElement>('option[value="3"]')?.disabled).toBe(true);
    refreshedStrength.value = "3";
    refreshedStrength.dispatchEvent(new Event("change", { bubbles: true }));
    expect(action("issue-spatial-signal").disabled).toBe(true);
  });

  it("releases the persistent battlefield frame loop when destroyed", () => {
    startAttempt();
    expect(scheduler.pending()).toBeGreaterThan(0);

    app.destroy();

    expect(scheduler.pending()).toBe(0);
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
    const playedScenes: string[] = [];
    const operationCount = completeCampaign.scenes.filter(
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
      lessonChoices[0]?.click();
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
