import { describe, expect, it } from "vitest";

import {
  createBuiltInCampaignRepository,
  createInMemoryCampaignRepository,
  createLocalStorageCampaignRepository,
  type CampaignKeyValueStore,
  type CampaignRepository,
} from "../../src/campaign";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

function editedTitle(repository: CampaignRepository, title: string) {
  const campaign = repository.load();
  (campaign.scenes[0]!.copy as { title: string }).title = title;
  return campaign;
}

describe("campaign repositories", () => {
  it("exposes the immutable built-in campaign and restores defensive clones", () => {
    const repository = createBuiltInCampaignRepository(chuncheonCampaign);
    const loaded = repository.load();
    (loaded.scenes[0]!.copy as { title: string }).title = "외부 변이";

    expect(repository.load()).toEqual(chuncheonCampaign);
    expect(repository.restore()).toEqual(chuncheonCampaign);
    expect(() => repository.save(loaded)).toThrow(/read-only/);
  });

  it("persists and restores an in-memory override", () => {
    const repository = createInMemoryCampaignRepository(chuncheonCampaign);
    repository.save(editedTitle(repository, "메모리 수정"));

    expect(repository.load().scenes[0]!.copy.title).toBe("메모리 수정");
    expect(repository.restore()).toEqual(chuncheonCampaign);
    expect(repository.load()).toEqual(chuncheonCampaign);
  });

  it("persists and clears a local-storage override", () => {
    const values = new Map<string, string>();
    const storage: CampaignKeyValueStore = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const repository = createLocalStorageCampaignRepository(
      chuncheonCampaign,
      storage,
      "campaign-test",
    );
    repository.save(editedTitle(repository, "브라우저 수정"));

    expect(repository.load().scenes[0]!.copy.title).toBe("브라우저 수정");
    expect(values.has("campaign-test")).toBe(true);
    expect(repository.restore()).toEqual(chuncheonCampaign);
    expect(values.has("campaign-test")).toBe(false);
  });

  it("names the default local-storage document by current campaign version", () => {
    const values = new Map<string, string>();
    const storage: CampaignKeyValueStore = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const repository = createLocalStorageCampaignRepository(chuncheonCampaign, storage);

    repository.save(editedTitle(repository, "현재 스키마"));

    expect(values.has(
      `campaign-document:${chuncheonCampaign.id}:v${chuncheonCampaign.version}`,
    )).toBe(true);
  });
});
