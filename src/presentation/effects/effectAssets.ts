import type { GameAudioCue } from "../../ui/GameAudio";

export const EFFECT_KINDS = [
  "movement",
  "report",
  "verification",
  "attack",
  "hit",
  "suppression",
  "panic",
  "retreat",
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

export type EffectAsset = Readonly<{
  label: string;
  glyph: string;
  color: string;
  durationMs: number;
  audioCue: Extract<GameAudioCue, EffectKind>;
}>;

export const effectAssetManifest = Object.freeze({
  version: 1,
  effects: Object.freeze({
    movement: { label: "이동", glyph: "→", color: "#f2d477", durationMs: 800, audioCue: "movement" },
    report: { label: "보고 전달", glyph: "↗", color: "#65d4d0", durationMs: 900, audioCue: "report" },
    verification: { label: "검증", glyph: "✓", color: "#7de1d8", durationMs: 1_200, audioCue: "verification" },
    attack: { label: "공격", glyph: "!", color: "#ffb36b", durationMs: 500, audioCue: "attack" },
    hit: { label: "피격", glyph: "×", color: "#ff8177", durationMs: 600, audioCue: "hit" },
    suppression: { label: "제압", glyph: "≋", color: "#d7b2ff", durationMs: 1_000, audioCue: "suppression" },
    panic: { label: "공황", glyph: "?", color: "#ff78bf", durationMs: 1_200, audioCue: "panic" },
    retreat: { label: "후퇴", glyph: "←", color: "#aeb9c7", durationMs: 1_000, audioCue: "retreat" },
  } satisfies Record<EffectKind, EffectAsset>),
} as const);

