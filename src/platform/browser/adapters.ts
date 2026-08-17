type BrowserAudioCue = "click" | "report" | "threat" | "success" | "failure";

type AudioContextConstructor = new () => AudioContext;

const cueNotes: Readonly<Record<BrowserAudioCue, readonly [number, number, number]>> = {
  click: [520, 0.025, 0.025],
  report: [740, 0.045, 0.035],
  threat: [145, 0.12, 0.055],
  success: [660, 0.16, 0.045],
  failure: [190, 0.2, 0.05],
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

export function createBrowserAudio() {
  let context: AudioContext | null = null;
  let isMuted = false;

  const contextConstructor = (): AudioContextConstructor | null => {
    const audioWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
    return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
  };

  const cue = (name: BrowserAudioCue): void => {
    if (isMuted) return;
    try {
      const Constructor = contextConstructor();
      if (!Constructor) return;
      context ??= new Constructor();
      const [frequency, duration, volume] = cueNotes[name];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      oscillator.type = name === "threat" || name === "failure" ? "square" : "sine";
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
    muted: () => isMuted,
    setMuted: (muted: boolean) => { isMuted = muted; },
    dispose: () => {
      const closing = context;
      context = null;
      if (closing) void closing.close().catch(() => undefined);
    },
  };
}
import {
  createLocalStorageCampaignRepository,
  type CampaignDefinition,
  type CampaignRepository,
} from "../../campaign";
