import { parseCampaignJson, parseCampaignValue } from "./parsing";
import type { CampaignDefinition } from "./types";

export interface CampaignRepository {
  load(): CampaignDefinition;
  save(campaign: CampaignDefinition): void;
  restore(): CampaignDefinition;
}

export interface CampaignKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function validatedClone(value: unknown): CampaignDefinition {
  const parsed = parseCampaignValue(value);
  if (!parsed.ok) {
    throw new TypeError(parsed.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; "));
  }
  return structuredClone(parsed.value);
}

export function createBuiltInCampaignRepository(campaign: CampaignDefinition): CampaignRepository {
  const builtIn = validatedClone(campaign);
  return {
    load: () => structuredClone(builtIn),
    save: () => { throw new Error("The built-in campaign repository is read-only."); },
    restore: () => structuredClone(builtIn),
  };
}

export function createInMemoryCampaignRepository(campaign: CampaignDefinition): CampaignRepository {
  const builtIn = validatedClone(campaign);
  let override: CampaignDefinition | null = null;
  return {
    load: () => structuredClone(override ?? builtIn),
    save: (next) => { override = validatedClone(next); },
    restore: () => {
      override = null;
      return structuredClone(builtIn);
    },
  };
}

export function createLocalStorageCampaignRepository(
  campaign: CampaignDefinition,
  storage: CampaignKeyValueStore,
  storageKey = `campaign-document:${campaign.id}:v${campaign.version}`,
): CampaignRepository {
  const builtIn = validatedClone(campaign);
  return {
    load: () => {
      const source = storage.getItem(storageKey);
      if (source === null) return structuredClone(builtIn);
      const parsed = parseCampaignJson(source);
      if (!parsed.ok) {
        throw new TypeError(parsed.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; "));
      }
      return structuredClone(parsed.value);
    },
    save: (next) => storage.setItem(storageKey, `${JSON.stringify(validatedClone(next), null, 2)}\n`),
    restore: () => {
      storage.removeItem(storageKey);
      return structuredClone(builtIn);
    },
  };
}
