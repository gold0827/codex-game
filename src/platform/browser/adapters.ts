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
  let activeSoundtrackVolume = 0.16;
  let masterVolume = 1;
  let musicVolume = 1;
  let effectsVolume = 1;
  let disposed = false;

  const normalizedVolume = (volume: number): number =>
    Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;

  const safelyUseMusic = (operation: () => void): boolean => {
    try {
      operation();
      return true;
    } catch {
      // HTMLMediaElement support and state vary by browser. Audio stays optional.
      return false;
    }
  };

  const clearMusic = (): void => {
    safelyUseMusic(() => music.pause());
    safelyUseMusic(() => music.removeAttribute("src"));
    safelyUseMusic(() => music.load());
  };

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

  const applyMusicVolume = (): void => {
    safelyUseMusic(() => {
      music.volume = normalizedVolume(activeSoundtrackVolume * masterVolume * musicVolume);
    });
  };

  const setSoundtrack = (soundtrackId: string | null): void => {
    if (disposed || soundtrackId === activeSoundtrackId) return;
    const soundtrack = soundtrackId === null ? undefined : soundtrackById.get(soundtrackId);
    activeSoundtrackId = soundtrack?.id ?? null;
    if (!soundtrack) {
      clearMusic();
      return;
    }
    safelyUseMusic(() => music.pause());
    const requestedVolume = soundtrack.volume ?? 0.16;
    activeSoundtrackVolume = Number.isFinite(requestedVolume)
      ? Math.min(1, Math.max(0, requestedVolume))
      : 0.16;
    const configured = safelyUseMusic(() => {
      music.src = soundtrack.src;
      music.loop = true;
      music.preload = "auto";
      applyMusicVolume();
      music.muted = isMuted;
      music.currentTime = 0;
    });
    if (!configured) {
      activeSoundtrackId = null;
      clearMusic();
      return;
    }
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
      gain.gain.setValueAtTime(volume * masterVolume * effectsVolume, startedAt);
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
      safelyUseMusic(() => {
        music.muted = muted;
      });
      if (muted) safelyUseMusic(() => music.pause());
      else playMusic();
    },
    setMasterVolume: (volume: number) => {
      masterVolume = normalizedVolume(volume);
      applyMusicVolume();
    },
    setMusicVolume: (volume: number) => {
      musicVolume = normalizedVolume(volume);
      applyMusicVolume();
    },
    setEffectsVolume: (volume: number) => {
      effectsVolume = normalizedVolume(volume);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearMusic();
      activeSoundtrackId = null;
      const closing = context;
      context = null;
      if (closing) {
        try {
          void closing.close().catch(() => undefined);
        } catch {
          // A failed context close must not interrupt the remaining UI teardown.
        }
      }
    },
  };
}
