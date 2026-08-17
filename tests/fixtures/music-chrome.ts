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
let effectOscillatorCount = 0;
class ObservedAudioContext extends AudioContext {
  override createOscillator(): OscillatorNode {
    effectOscillatorCount += 1;
    return super.createOscillator();
  }
}
const audio = createBrowserAudio(productionSoundtrackCatalog, {
  createMusicElement: () => music,
  audioContextConstructor: ObservedAudioContext,
});
const session = createGameSession(completeCampaign, "music-chrome-fixture");
const app = mountGameApp(root, completeCampaign, session, { audio });

const sourceBeforeInteraction = music.currentSrc || music.src;
const pausedBeforeInteraction = music.paused;
document.body.dataset.fixtureStatus = "ready";

const start = root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]');
if (!start) throw new Error("Music Chrome fixture start action is missing.");
start.addEventListener("click", () => {
  void (async () => {
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
    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const observePlayback = (): void => {
        if (!music.paused || performance.now() - startedAt >= 1_000) {
          resolve();
          return;
        }
        window.requestAnimationFrame(observePlayback);
      };
      observePlayback();
    });

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
      effectOscillatorCount,
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
      result.playingAfterUnmute &&
      result.effectOscillatorCount > 0;

    const output = document.createElement("pre");
    output.id = "fixture-result";
    output.textContent = JSON.stringify({ passed, ...result });
    document.body.append(output);
    document.body.dataset.fixtureStatus = passed ? "passed" : "failed";

    if (!passed) console.error("Music Chrome fixture failed", result);
  })();
}, { once: true });
window.addEventListener("pagehide", () => app.destroy(), { once: true });
