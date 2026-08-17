import type { GameSession, GameSnapshot } from "../application/game-session";
import type { GameAudio } from "../ui/GameAudio";
import type { ThreatImpactViewModel } from "./gameViewModel";
import { effectAssetManifest } from "./effects/effectAssets";
import { createEffectCueProjector } from "./effects/effectCueProjector";
import type { EffectTrack } from "./effects/effectTrack";

export type GameFrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type GameEffects = Readonly<{
  threatImpacts: ReadonlyMap<string, ThreatImpactViewModel>;
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
  let knownThreatIds = new Set<string>();
  let knownEffectCueIds = new Set<string>();
  let destroyed = false;
  const threatImpacts = new Map<string, ThreatImpactViewModel>();
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
    threatImpacts,
    get effectTrack() { return effectTrack; },
    observe: (snapshot) => {
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
      const operation = snapshot.operation;
      operation?.threats.forEach((threat) => {
        const objective = operation.objectives.find(({ id }) => id === threat.target);
        const unit = operation.units.find(({ lane }) => lane === threat.lane);
        const observed = objective
          ? { label: "목표", value: objective.progress }
          : unit
            ? { label: "체력", value: unit.health }
            : null;
        if (!observed) return;
        const previous = threatImpacts.get(threat.id);
        threatImpacts.set(threat.id, {
          label: observed.label,
          before: previous?.before ?? observed.value,
          after: observed.value,
        });
      });
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
