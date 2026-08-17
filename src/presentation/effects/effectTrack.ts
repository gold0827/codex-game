import type { WorldPosition } from "../battlefield/battlefieldFrame";
import { effectAssetManifest, type EffectKind } from "./effectAssets";

export type EffectCue = Readonly<{
  id: string;
  kind: EffectKind;
  position: WorldPosition;
  startsAtMs: number;
  endsAtMs: number;
}>;

export type EffectTrack = Readonly<{
  cues: readonly EffectCue[];
}>;

export type EffectSample = Readonly<{
  id: string;
  kind: EffectKind;
  label: string;
  glyph: string;
  color: string;
  position: WorldPosition;
  progress: number;
  radius: number;
  opacity: number;
}>;

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function sampleEffectTrack(
  track: EffectTrack,
  operationTimeMs: number,
  reducedMotion = false,
): readonly EffectSample[] {
  const sampledAtMs = Number.isFinite(operationTimeMs) ? Math.max(0, operationTimeMs) : 0;
  return track.cues.flatMap((cue) => {
    if (sampledAtMs < cue.startsAtMs || sampledAtMs >= cue.endsAtMs) return [];
    const durationMs = Math.max(1, cue.endsAtMs - cue.startsAtMs);
    const progress = clamp((sampledAtMs - cue.startsAtMs) / durationMs);
    const asset = effectAssetManifest.effects[cue.kind];
    const cycleProgress = ((sampledAtMs - cue.startsAtMs) % asset.durationMs) / asset.durationMs;
    const pulse = reducedMotion ? 0 : (Math.sin(cycleProgress * Math.PI * 2) + 1) / 2;
    return [{
      id: cue.id,
      kind: cue.kind,
      label: asset.label,
      glyph: asset.glyph,
      color: asset.color,
      position: cue.position,
      progress,
      radius: reducedMotion ? 13 : 11 + pulse * 5,
      opacity: reducedMotion ? 1 : 0.72 + pulse * 0.28,
    }];
  });
}
