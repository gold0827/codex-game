import type { GameSession, GameSnapshot } from "../application/game-session";
import type { GameAudio } from "../ui/GameAudio";

export type GameFrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type GameEffects = Readonly<{
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
  let destroyed = false;

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
    const phaseBefore = session.read().phase;
    if (elapsed > 0) session.advance(elapsed);
    if (session.read().phase !== phaseBefore || previousRenderTime === null ||
        timestamp - previousRenderTime >= renderIntervalMs) {
      previousRenderTime = timestamp;
      render();
    }
    syncFrameLoop();
  }

  return {
    observe: (snapshot) => {
      const soundtrackId = snapshot.scene.presentation.soundtrackId;
      if (soundtrackId !== previousSoundtrackId) {
        audio.setSoundtrack(soundtrackId);
        previousSoundtrackId = soundtrackId;
      }
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
        ?.focus({ preventScroll: true });
    },
    destroy: () => {
      destroyed = true;
      cancelFrame();
      audio.dispose();
    },
  };
}
