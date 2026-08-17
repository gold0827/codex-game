export type GameAudioCue = "click" | "report" | "threat" | "success" | "failure";
export type GameAudio = Readonly<{
  cue: (cue: GameAudioCue) => void;
  muted: () => boolean;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}>;
