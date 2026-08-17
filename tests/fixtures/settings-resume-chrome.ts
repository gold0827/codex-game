import { mountProductionGame } from "../../src/app/createGameWorkbench";
import type { GameSession } from "../../src/application/game-session";
import "../../src/styles/main.css";
import { flowCampaign } from "./flow-campaign";

const root = document.querySelector<HTMLElement>("#fixture-root");
if (!root) throw new Error("Settings Chrome fixture root is missing.");

const fixturePhaseKey = `settings-resume-fixture:${flowCampaign.id}`;
const settingsKey = `player-settings:${flowCampaign.id}:v1`;
const progressKey = `campaign-progress:${flowCampaign.id}:v1`;
const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

function advanceToOperationTime(session: GameSession, operationElapsedMs: number): void {
  const simulationSpeed = session.read().scene.gameplayTuning.simulationSpeed;
  session.advance(operationElapsedMs / simulationSpeed);
}

function finishSuccessfulAttempt(session: GameSession): void {
  const routeStep = session.read().scene.guidance.find((step) => step.action === "route");
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
  const snapshot = session.read();
  const remaining = snapshot.scene.encounterParameters.durationMs
    - (snapshot.operation?.elapsedMs ?? 0);
  session.advance(remaining / snapshot.scene.gameplayTuning.simulationSpeed + 1);
}

const action = (name: string): HTMLButtonElement => {
  const button = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  if (!button) throw new Error(`Missing fixture action ${name}.`);
  return button;
};

const phase = sessionStorage.getItem(fixturePhaseKey);
if (phase === null) {
  localStorage.removeItem(settingsKey);
  localStorage.removeItem(progressKey);
}

const workbench = mountProductionGame(root, flowCampaign);
window.addEventListener("pagehide", () => workbench.destroy(), { once: true });

if (phase === null) {
  action("start-attempt").click();
  action("open-settings").click();
  const pausedBehindSettings = workbench.session().read().paused;
  const scale = root.querySelector<HTMLSelectElement>('[data-setting="uiScale"]');
  if (!scale) throw new Error("UI scale control is missing.");
  scale.value = "large";
  scale.dispatchEvent(new Event("change", { bubbles: true }));
  action("close-settings").click();
  const resumedAfterSettings = !workbench.session().read().paused;

  finishSuccessfulAttempt(workbench.session());
  const lesson = workbench.session().read().debrief?.lessonChoices[0];
  if (!lesson) throw new Error("Fixture expected a lesson choice.");
  workbench.session().dispatch({ type: "choose-lesson", lessonId: lesson.id });
  action("open-settings").click();
  scale.dispatchEvent(new Event("change", { bubbles: true }));

  sessionStorage.setItem(fixturePhaseKey, JSON.stringify({
    pausedBehindSettings,
    resumedAfterSettings,
    expectedSceneId: flowCampaign.scenes[1]?.identity.id,
  }));
  window.location.reload();
} else {
  const firstPass = JSON.parse(phase) as {
    pausedBehindSettings: boolean;
    resumedAfterSettings: boolean;
    expectedSceneId: string;
  };
  action("open-settings").click();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const dialog = root.querySelector<HTMLElement>(".settings-dialog")?.getBoundingClientRect();
  const result = {
    viewport: { width: innerWidth, height: innerHeight },
    pausedBehindSettings: firstPass.pausedBehindSettings,
    resumedAfterSettings: firstPass.resumedAfterSettings,
    phase: workbench.session().read().phase,
    sceneId: workbench.session().read().scene.identity.id,
    expectedSceneId: firstPass.expectedSceneId,
    uiScale: root.querySelector<HTMLElement>(".game-workbench")?.dataset.uiScale,
    editorHidden: root.querySelector('[data-action="open-editor"]') === null,
    documentFits: document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.scrollHeight <= innerHeight,
    dialogFits: Boolean(dialog && dialog.width <= innerWidth && dialog.height <= innerHeight),
    errors,
  };
  const passed = result.pausedBehindSettings
    && result.resumedAfterSettings
    && result.phase === "briefing"
    && result.sceneId === result.expectedSceneId
    && result.uiScale === "large"
    && result.editorHidden
    && result.documentFits
    && result.dialogFits
    && result.errors.length === 0;

  const output = document.createElement("pre");
  output.id = "fixture-result";
  output.style.cssText = "position:fixed;z-index:100;right:6px;bottom:6px;max-width:calc(100vw - 12px);margin:0;padding:4px 6px;background:#020;color:#bff;font:9px monospace;white-space:normal";
  output.textContent = `${passed ? "PASS" : "FAIL"} ${innerWidth}x${innerHeight} pause=${result.pausedBehindSettings} resume=${result.resumedAfterSettings} scene=${result.sceneId} scale=${result.uiScale} editorHidden=${result.editorHidden} documentFits=${result.documentFits} dialogFits=${result.dialogFits} errors=${result.errors.length}`;
  document.body.append(output);
  document.body.dataset.fixtureStatus = passed ? "passed" : "failed";
  sessionStorage.removeItem(fixturePhaseKey);
  if (!passed) console.error("Settings/resume Chrome fixture failed", result);
}
