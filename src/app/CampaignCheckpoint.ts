import type {
  GameSessionResume,
  GameSnapshot,
} from "../application/game-session";

export type CampaignCheckpointStore = Readonly<{
  load: () => unknown;
  save: (resume: GameSessionResume) => void;
  clear: () => void;
}>;

export type CampaignCheckpointStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}>;

export type CampaignCheckpoint = Readonly<{
  restore: () => Readonly<{
    resume: GameSessionResume | undefined;
    recoveredFromFailure: boolean;
  }>;
  capture: (snapshot: GameSnapshot) => void;
  clear: () => void;
}>;

type CampaignCheckpointOptions = Readonly<{
  onFailure?: () => void;
}>;

function resumeFrom(value: unknown): GameSessionResume | undefined {
  if (value === null || value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new TypeError("Campaign checkpoint must be an object.");
  }
  const supplied = value as Partial<GameSessionResume>;
  if (!supplied.progress || !Array.isArray(supplied.officerMemory)) {
    throw new TypeError("Campaign checkpoint is missing progress or officer memory.");
  }
  return structuredClone(supplied as GameSessionResume);
}

function snapshotResume(snapshot: GameSnapshot): GameSessionResume {
  return {
    progress: structuredClone(snapshot.progress),
    officerMemory: structuredClone(snapshot.officerMemory),
  };
}

export function createCampaignCheckpointStore(
  storage: CampaignCheckpointStorage,
  key: string,
): CampaignCheckpointStore {
  return {
    load: () => {
      const source = storage.getItem(key);
      return source === null ? null : JSON.parse(source) as unknown;
    },
    save: (resume) => storage.setItem(key, JSON.stringify(resume)),
    clear: () => storage.removeItem(key),
  };
}

export function createCampaignCheckpoint(
  store: CampaignCheckpointStore | undefined,
  options: CampaignCheckpointOptions = {},
): CampaignCheckpoint {
  let serialized: string | null = null;

  const fail = (): void => {
    serialized = null;
    try {
      store?.clear();
    } catch {
      // A broken storage adapter must not block a new campaign.
    }
    options.onFailure?.();
  };

  return {
    restore: () => {
      try {
        const resume = resumeFrom(store?.load());
        serialized = resume ? JSON.stringify(resume) : null;
        return { resume, recoveredFromFailure: false };
      } catch {
        fail();
        return { resume: undefined, recoveredFromFailure: true };
      }
    },
    capture: (snapshot) => {
      if (!store) return;
      const resume = snapshotResume(snapshot);
      const nextSerialized = JSON.stringify(resume);
      if (nextSerialized === serialized) return;
      try {
        store.save(resume);
        serialized = nextSerialized;
      } catch {
        options.onFailure?.();
      }
    },
    clear: () => {
      serialized = null;
      try {
        store?.clear();
      } catch {
        options.onFailure?.();
      }
    },
  };
}
