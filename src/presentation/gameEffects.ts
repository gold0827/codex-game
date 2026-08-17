import type { GameSession, GameSnapshot } from "../application/game-session";
import type { GameAudio } from "../ui/GameAudio";
import { effectAssetManifest } from "./effects/effectAssets";
import { createEffectCueProjector } from "./effects/effectCueProjector";
import type { EffectTrack } from "./effects/effectTrack";

export type GameFrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type GameEffects = Readonly<{
  effectTrack: EffectTrack;
  observe: (snapshot: GameSnapshot) => void;
  syncFrameLoop: () => void;
  restoreFocus: (focusKey?: string) => void;
  destroy: () => void;
}>;

export function createGameEffects(
  root: HTMLElement,
  session: GameSession,
  scheduler: GameFrameScheduler,
  audio: GameAudio,
  render: () => void,
): GameEffects {
  const renderIntervalMs = 100;
  let frameHandle: number | null = null;
  let previousFrameTime: number | null = null;
  let previousRenderTime: number | null = null;
  let previousPhase = session.read().phase;
  let previousSoundtrackId: string | null = null;
  let knownThreatIds = new Set<string>();
  let knownEffectCueIds = new Set<string>();
  let destroyed = false;
  const effectCueProjector = createEffectCueProjector();
  let effectTrack: EffectTrack = { cues: [] };

  const cancelFrame = (): void => {
    if (frameHandle !== null) scheduler.cancel(frameHandle);
    frameHandle = null;
    previousFrameTime = null;
  };

  const syncFrameLoop = (): void => {
    const snapshot = session.read();
    if (snapshot.phase !== "operation" || snapshot.paused || destroyed) {
      cancelFrame();
      return;
    }
    if (frameHandle === null) frameHandle = scheduler.request(onFrame);
  };

  function onFrame(timestamp: number): void {
    frameHandle = null;
    const elapsed = previousFrameTime === null ? 0 : Math.max(0, timestamp - previousFrameTime);
    previousFrameTime = timestamp;
    if (elapsed > 0) session.advance(elapsed);
    if (previousRenderTime === null || timestamp - previousRenderTime >= renderIntervalMs) {
      previousRenderTime = timestamp;
      render();
    }
    syncFrameLoop();
  }

  return {
    get effectTrack() { return effectTrack; },
    observe: (snapshot) => {
      const soundtrackId = snapshot.scene.presentation.soundtrackId;
      if (soundtrackId !== previousSoundtrackId) {
        audio.setSoundtrack(soundtrackId);
        previousSoundtrackId = soundtrackId;
      }
      const currentThreatIds = new Set(snapshot.operation?.threats.map(({ id }) => id));
      if ([...currentThreatIds].some((id) => !knownThreatIds.has(id))) audio.cue("threat");
      knownThreatIds = currentThreatIds;
      effectTrack = effectCueProjector.observe(snapshot);
      const effectCues = effectTrack.cues;
      const currentEffectCueIds = new Set(effectCues.map(({ id }) => id));
      const newEffectKinds = new Set(
        effectCues.filter(({ id }) => !knownEffectCueIds.has(id)).map(({ kind }) => kind),
      );
      newEffectKinds.forEach((kind) => audio.cue(effectAssetManifest.effects[kind].audioCue));
      knownEffectCueIds = currentEffectCueIds;
      if (previousPhase === "operation" && snapshot.phase === "debrief") {
        audio.cue(snapshot.debrief?.status === "success" ? "success" : "failure");
      }
      previousPhase = snapshot.phase;
    },
    syncFrameLoop,
    restoreFocus: (focusKey) => {
      if (!focusKey) return;
      [...root.querySelectorAll<HTMLElement>("[data-focus-key]")]
        .find((element) => element.dataset.focusKey === focusKey)
        ?.focus();
    },
    destroy: () => {
      destroyed = true;
      cancelFrame();
      effectCueProjector.reset();
      audio.dispose();
    },
  };
}
