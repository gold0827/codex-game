export type GameAudioCue =
  | "click"
  | "report"
  | "threat"
  | "success"
  | "failure"
  | "movement"
  | "verification"
  | "attack"
  | "hit"
  | "suppression"
  | "panic"
  | "retreat";
export type GameAudio = Readonly<{
  cue: (cue: GameAudioCue) => void;
  setSoundtrack: (soundtrackId: string | null) => void;
  muted: () => boolean;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}>;
