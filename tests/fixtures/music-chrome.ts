import { productionSoundtrackCatalog } from "../../src/app/musicCatalog";
import { createGameSession } from "../../src/application/game-session";
import { createBrowserAudio } from "../../src/platform/browser/adapters";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import "../../src/styles/main.css";
import { mountGameApp } from "../../src/ui/GameApp";

const root = document.querySelector<HTMLElement>("#fixture-root");
if (!root) throw new Error("Music Chrome fixture root is missing.");

const music = document.createElement("audio");
music.dataset.fixtureMusic = "true";
document.body.append(music);
const audio = createBrowserAudio(productionSoundtrackCatalog, {
  createMusicElement: () => music,
  audioContextConstructor: null,
});
const session = createGameSession(completeCampaign, "music-chrome-fixture");
const app = mountGameApp(root, completeCampaign, session, { audio });

const sourceBeforeInteraction = music.currentSrc || music.src;
const pausedBeforeInteraction = music.paused;
root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]')?.click();

await new Promise<void>((resolve) => {
  if (music.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    resolve();
    return;
  }
  const timeout = window.setTimeout(resolve, 4_000);
  music.addEventListener("loadeddata", () => {
    window.clearTimeout(timeout);
    resolve();
  }, { once: true });
});

const mute = root.querySelector<HTMLButtonElement>('[data-action="toggle-mute"]');
mute?.click();
const pausedWhileMuted = music.paused;
mute?.click();
await music.play().catch(() => undefined);

const result = {
  phase: session.read().phase,
  soundtrackId: session.read().scene.presentation.soundtrackId,
  sourceBeforeInteraction,
  pausedBeforeInteraction,
  currentSource: music.currentSrc || music.src,
  readyState: music.readyState,
  loop: music.loop,
  volume: music.volume,
  pausedWhileMuted,
  playingAfterUnmute: !music.paused,
};
const passed = result.phase === "operation" &&
  result.soundtrackId === "two-blinks-march" &&
  result.sourceBeforeInteraction.endsWith("/assets/audio/bgm/two-blinks-march.ogg") &&
  result.pausedBeforeInteraction &&
  result.currentSource.endsWith("/assets/audio/bgm/two-blinks-march.ogg") &&
  result.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
  result.loop &&
  result.volume === 0.12 &&
  result.pausedWhileMuted &&
  result.playingAfterUnmute;

const output = document.createElement("pre");
output.id = "fixture-result";
output.textContent = JSON.stringify({ passed, ...result });
document.body.append(output);
document.body.dataset.fixtureStatus = passed ? "passed" : "failed";

if (!passed) console.error("Music Chrome fixture failed", result);
window.addEventListener("pagehide", () => app.destroy(), { once: true });
