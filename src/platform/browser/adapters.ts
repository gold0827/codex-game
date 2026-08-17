import {
  createLocalStorageCampaignRepository,
  type CampaignDefinition,
  type CampaignRepository,
} from "../../campaign";

type BrowserAudioCue =
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

export type BrowserSoundtrack = Readonly<{
  id: string;
  src: string;
  volume?: number;
}>;

type AudioContextConstructor = new () => AudioContext;

type BrowserAudioOptions = Readonly<{
  createMusicElement?: () => HTMLAudioElement;
  audioContextConstructor?: AudioContextConstructor | null;
}>;

const cueNotes: Readonly<Record<BrowserAudioCue, readonly [number, number, number]>> = {
  click: [520, 0.025, 0.025],
  report: [740, 0.045, 0.035],
  threat: [145, 0.12, 0.055],
  success: [660, 0.16, 0.045],
  failure: [190, 0.2, 0.05],
  movement: [430, 0.035, 0.018],
  verification: [820, 0.07, 0.028],
  attack: [240, 0.055, 0.04],
  hit: [110, 0.07, 0.05],
  suppression: [170, 0.11, 0.035],
  panic: [940, 0.08, 0.03],
  retreat: [310, 0.09, 0.025],
};

export function createBrowserFrameScheduler() {
  return {
    request: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
    cancel: (handle: number) => window.cancelAnimationFrame(handle),
  };
}

export function createBrowserStorage() {
  return {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    removeItem: (key: string) => window.localStorage.removeItem(key),
  };
}

export function createBrowserCampaignRepository(
  campaign: CampaignDefinition,
  storageKey?: string,
): CampaignRepository {
  return createLocalStorageCampaignRepository(campaign, createBrowserStorage(), storageKey);
}

export function createBrowserAudio(
  soundtracks: readonly BrowserSoundtrack[] = [],
  options: BrowserAudioOptions = {},
) {
  const soundtrackById = new Map(soundtracks.map((soundtrack) => [soundtrack.id, soundtrack]));
  const music = options.createMusicElement?.() ?? new Audio();
  let context: AudioContext | null = null;
  let isMuted = false;
  let isUnlocked = false;
  let activeSoundtrackId: string | null = null;
  let disposed = false;

  const contextConstructor = (): AudioContextConstructor | null => {
    if (options.audioContextConstructor !== undefined) {
      return options.audioContextConstructor;
    }
    const audioWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
    return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
  };

  const playMusic = (): void => {
    if (disposed || isMuted || !isUnlocked || activeSoundtrackId === null) return;
    try {
      const started = music.play();
      void started.catch(() => undefined);
    } catch {
      // Browser media failures must never block play.
    }
  };

  const setSoundtrack = (soundtrackId: string | null): void => {
    if (disposed || soundtrackId === activeSoundtrackId) return;
    const soundtrack = soundtrackId === null ? undefined : soundtrackById.get(soundtrackId);
    music.pause();
    activeSoundtrackId = soundtrack?.id ?? null;
    if (!soundtrack) {
      music.removeAttribute("src");
      return;
    }
    music.src = soundtrack.src;
    music.loop = true;
    music.preload = "auto";
    music.volume = soundtrack.volume ?? 0.16;
    music.muted = isMuted;
    music.currentTime = 0;
    playMusic();
  };

  const cue = (name: BrowserAudioCue): void => {
    if (disposed) return;
    isUnlocked = true;
    if (isMuted) return;
    playMusic();
    try {
      const Constructor = contextConstructor();
      if (!Constructor) return;
      context ??= new Constructor();
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      const [frequency, duration, volume] = cueNotes[name];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      oscillator.type = ["threat", "failure", "attack", "hit", "suppression", "panic"].includes(name)
        ? "square"
        : "sine";
      oscillator.frequency.setValueAtTime(frequency, startedAt);
      gain.gain.setValueAtTime(volume, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + duration);
    } catch {
      // Audio is optional and must never block play.
    }
  };

  return {
    cue,
    setSoundtrack,
    muted: () => isMuted,
    setMuted: (muted: boolean) => {
      if (disposed) return;
      isUnlocked = true;
      isMuted = muted;
      music.muted = muted;
      if (muted) music.pause();
      else playMusic();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      music.pause();
      music.removeAttribute("src");
      activeSoundtrackId = null;
      const closing = context;
      context = null;
      if (closing) void closing.close().catch(() => undefined);
    },
  };
}
