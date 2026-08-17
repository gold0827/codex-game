import { createGameSession } from "../../src/application/game-session";
import {
  bridgeDefenseCampaign,
  bridgeDefenseMapSkin,
} from "../../src/scenarios/bridgeDefenseOperation";
import "../../src/styles/main.css";
import { mountGameApp } from "../../src/ui/GameApp";

const root = document.querySelector<HTMLElement>("#fixture-root");
if (!root) throw new Error("Chrome fixture root is missing.");

const session = createGameSession(bridgeDefenseCampaign, "chrome-fixture");
const app = mountGameApp(root, bridgeDefenseCampaign, session, {
  frameScheduler: {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  },
});

root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]')?.click();
await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

const grid = root.querySelector<HTMLElement>(".operation-grid");
const battlefield = root.querySelector<HTMLElement>("[data-region='battlefield']");
const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
const gridWidth = grid?.getBoundingClientRect().width ?? 0;
const battlefieldWidth = battlefield?.getBoundingClientRect().width ?? 0;
const centralShare = gridWidth === 0 ? 0 : battlefieldWidth / gridWidth;

root.querySelector<HTMLButtonElement>('[data-action="pause"]')?.click();
root.querySelector<HTMLElement>('[data-officer-id="captain-han"]')
  ?.querySelector<HTMLButtonElement>('[data-action="inspect-officer"]')
  ?.click();
root.querySelector<HTMLButtonElement>('[data-action="resume"]')?.click();
const tutorialCompleted = session.read().tutorial.currentStep === null;
const remainingMs = (session.read().operation?.durationMs ?? 0) -
  (session.read().operation?.elapsedMs ?? 0);
session.advance(remainingMs);
app.render();

const result = {
  phase: session.read().phase,
  sceneId: session.read().scene.identity.id,
  mapId: battlefield?.dataset.mapId ?? null,
  centralShare: Math.round(centralShare * 1_000) / 1_000,
  canvasWidth: canvas?.width ?? 0,
  canvasHeight: canvas?.height ?? 0,
  officerCount: session.read().operation?.officers.length ?? 0,
  tutorialCompleted,
  debriefStatus: session.read().debrief?.status ?? null,
  debriefCopyVisible: root.textContent?.includes(
    bridgeDefenseCampaign.scenes[0].copy.success,
  ) ?? false,
};
const passed = result.phase === "debrief" &&
  result.sceneId === "haein-bridge-defense" &&
  result.mapId === bridgeDefenseMapSkin.id &&
  result.centralShare >= 0.7 &&
  result.canvasWidth > 0 &&
  result.canvasHeight > 0 &&
  result.officerCount === 4 &&
  result.tutorialCompleted &&
  result.debriefStatus === "success" &&
  result.debriefCopyVisible;

const output = document.createElement("pre");
output.id = "fixture-result";
output.textContent = JSON.stringify({ passed, ...result });
document.body.append(output);
document.body.dataset.fixtureStatus = passed ? "passed" : "failed";

if (!passed) console.error("Bridge defense Chrome fixture failed", result);

window.addEventListener("pagehide", () => app.destroy(), { once: true });
