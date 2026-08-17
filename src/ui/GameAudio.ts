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
  setMasterVolume?: (volume: number) => void;
  setMusicVolume?: (volume: number) => void;
  setEffectsVolume?: (volume: number) => void;
  dispose: () => void;
}>;
