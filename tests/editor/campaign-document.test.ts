import { describe, expect, it } from "vitest";

import {
  createLocalStorageCampaignRepository,
  type CampaignDefinition,
  type CampaignKeyValueStore,
  type CampaignScene,
} from "../../src/campaign";
import {
  createCampaignDocument,
} from "../../src/authoring/campaign-workshop";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

const sceneIds = [
  "signal-school",
  "flooded-convoy",
  "misaddressed-artillery",
  "inspection-ambush",
  "night-switchboard",
  "orchard-siege",
  "greenhouse-epilogue",
];

class MemoryStorage implements CampaignKeyValueStore {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failRemove = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read denied");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("write denied");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove) throw new Error("remove denied");
    this.values.delete(key);
  }
}

const repository = (storage: MemoryStorage, key = "test-campaign") =>
  createLocalStorageCampaignRepository(completeCampaign, storage, key);

function editedScene(
  document: ReturnType<typeof createCampaignDocument>,
  sceneId = sceneIds[0],
): CampaignScene {
  const scene = document.scene(sceneId);
  if (!scene) throw new Error(`Missing scene ${sceneId}.`);
  (scene.copy as { title: string }).title = `edited ${sceneId}`;
  return scene;
}

describe("campaign document", () => {
  it("enumerates all seven scenes and replaces each through one API", () => {
    const document = createCampaignDocument(completeCampaign);

    expect(document.listScenes().map(({ identity }) => identity.id)).toEqual(
      sceneIds,
    );
    sceneIds.forEach((sceneId) => {
      const result = document.replaceScene(sceneId, editedScene(document, sceneId));
      expect(result.ok).toBe(true);
      expect(document.scene(sceneId)?.copy.title).toBe(`edited ${sceneId}`);
    });
  });

  it("round-trips an edit through pretty JSON and storage reload", () => {
    const storage = new MemoryStorage();
    const options = { repository: repository(storage) };
    const first = createCampaignDocument(completeCampaign, options);
    expect(first.replaceScene(sceneIds[1], editedScene(first, sceneIds[1])).ok).toBe(
      true,
    );

    const exported = first.exportJson();
    expect(exported).toBe(`${JSON.stringify(JSON.parse(exported), null, 2)}\n`);
    const imported = createCampaignDocument(completeCampaign);
    expect(imported.importJson(exported).ok).toBe(true);
    expect(imported.snapshot()).toEqual(first.snapshot());

    expect(first.save().ok).toBe(true);
    const reloaded = createCampaignDocument(completeCampaign, options);
    expect(reloaded.load().ok).toBe(true);
    expect(reloaded.snapshot()).toEqual(first.snapshot());
  });

  it("preserves the last valid state after invalid replacements and imports", () => {
    const document = createCampaignDocument(completeCampaign);
    document.replaceScene(sceneIds[0], editedScene(document));
    const valid = document.snapshot();

    const structurallyInvalid = document.replaceScene(sceneIds[0], {
      identity: { id: sceneIds[0] },
    });
    expect(structurallyInvalid).toMatchObject({ ok: false });
    if (structurallyInvalid.ok) throw new Error("Expected replacement to fail.");
    expect(structurallyInvalid.diagnostics.every(({ kind }) => kind === "shape")).toBe(
      true,
    );
    expect(document.snapshot()).toEqual(valid);

    const semanticallyInvalid = editedScene(document);
    (semanticallyInvalid.transitions[0] as { targetSceneId: string }).targetSceneId =
      "missing-scene";
    const replacement = document.replaceScene(sceneIds[0], semanticallyInvalid);
    expect(replacement).toMatchObject({ ok: false });
    if (replacement.ok) throw new Error("Expected replacement to fail.");
    expect(replacement.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "validation" }),
    );
    expect(document.snapshot()).toEqual(valid);

    expect(document.importJson("not json")).toMatchObject({
      ok: false,
      diagnostics: [{ kind: "json" }],
    });
    expect(document.snapshot()).toEqual(valid);
  });

  it("rejects a non-finite scene number and preserves the last valid state", () => {
    const document = createCampaignDocument(completeCampaign);
    const replacement = editedScene(document);
    (replacement.gameplayTuning as { startingResources: number }).startingResources =
      Number.POSITIVE_INFINITY;
    const before = document.snapshot();

    expect(document.replaceScene(sceneIds[0], replacement)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          kind: "shape",
          code: "invalid-shape",
          path: "$.scenes[0].gameplayTuning.startingResources",
        },
      ],
    });
    expect(document.snapshot()).toEqual(before);
  });

  it("keeps invalid saved data and falls back to the authored source", () => {
    const storage = new MemoryStorage();
    storage.values.set("test-campaign", "not json");
    const document = createCampaignDocument(completeCampaign, {
      repository: repository(storage),
    });

    expect(document.load()).toMatchObject({
      ok: false,
      diagnostics: [{ kind: "storage", code: "storage-read" }],
    });
    expect(document.snapshot()).toEqual(completeCampaign);
    expect(storage.values.get("test-campaign")).toBe("not json");
  });

  it("deep-clones sources, snapshots, scene views, and replacement inputs", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const document = createCampaignDocument(source);
    (source.scenes[0].copy as { title: string }).title = "source mutation";

    const snapshot = document.snapshot();
    (snapshot.scenes[0].copy as { title: string }).title = "snapshot mutation";
    const scenes = document.listScenes() as CampaignScene[];
    (scenes[0].copy as { title: string }).title = "list mutation";

    const replacement = editedScene(document);
    expect(document.replaceScene(sceneIds[0], replacement).ok).toBe(true);
    const acceptedTitle = document.scene(sceneIds[0])?.copy.title;
    (replacement.copy as { title: string }).title = "replacement mutation";

    expect(document.scene(sceneIds[0])?.copy.title).toBe(acceptedTitle);
    expect(document.scene(sceneIds[1])?.copy.title).toBe(
      completeCampaign.scenes[1].copy.title,
    );
  });

  it("restores the exact authored campaign and removes the override", () => {
    const storage = new MemoryStorage();
    const document = createCampaignDocument(completeCampaign, {
      repository: repository(storage),
    });
    document.replaceScene(sceneIds[0], editedScene(document));
    document.save();

    expect(document.restore()).toEqual({ ok: true, value: completeCampaign });
    expect(storage.values.has("test-campaign")).toBe(false);
  });

  it.each([
    ["read", "storage-read"],
    ["write", "storage-write"],
    ["remove", "storage-remove"],
  ] as const)("reports storage %s failures without changing state", (operation, code) => {
    const storage = new MemoryStorage();
    const document = createCampaignDocument(completeCampaign, {
      repository: repository(storage),
    });
    document.replaceScene(sceneIds[0], editedScene(document));
    const before = document.snapshot();
    storage.failRead = operation === "read";
    storage.failWrite = operation === "write";
    storage.failRemove = operation === "remove";

    const result =
      operation === "read"
        ? document.load()
        : operation === "write"
          ? document.save()
          : document.restore();

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ kind: "storage", code }],
    });
    expect(document.snapshot()).toEqual(before);
  });
});
