import { beforeEach, describe, expect, it } from "vitest";

import {
  createLocalStorageCampaignRepository,
  type CampaignKeyValueStore,
} from "../../src/campaign";
import {
  createCampaignDocument,
  mountCampaignWorkshop,
} from "../../src/authoring/campaign-workshop";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

class MemoryStorage implements CampaignKeyValueStore {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("campaign editor", () => {
  let root: HTMLElement;
  let storage: MemoryStorage;
  let campaignDocument: ReturnType<typeof createCampaignDocument>;
  let restartCount: number;

  const action = (name: string): HTMLButtonElement => {
    const result = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    if (!result) throw new Error(`Missing action: ${name}`);
    return result;
  };

  const input = <Element extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    path: string,
  ): Element => {
    const result = root.querySelector<Element>(`[data-field="${path}"]`);
    if (!result) throw new Error(`Missing field: ${path}`);
    return result;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.querySelector("#root")!;
    storage = new MemoryStorage();
    campaignDocument = createCampaignDocument(completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, storage),
    });
    restartCount = 0;
    mountCampaignWorkshop(root, campaignDocument, {
      onClose: () => undefined,
      onRestart: () => {
        restartCount += 1;
      },
    });
  });

  it("derives all scene choices and applies scalar and nested edits", () => {
    const selector = action("select-scene") as unknown as HTMLSelectElement;
    expect(selector.options).toHaveLength(completeCampaign.scenes.length);
    expect([...selector.options].map(({ value }) => value)).toEqual(
      completeCampaign.scenes.map((scene) => scene.identity.id),
    );
    expect(input<HTMLInputElement>("identity.id").readOnly).toBe(true);
    const kind = input<HTMLSelectElement>("identity.kind");
    expect([...kind.options].map(({ textContent }) => textContent)).toEqual([
      "훈련",
      "작전",
      "졸업",
    ]);
    expect([...kind.options].map(({ value }) => value)).toEqual([
      "tutorial",
      "operation",
      "epilogue",
    ]);

    input<HTMLInputElement>("copy.title").value = "수정된 첫 장면";
    input<HTMLInputElement>("presentation.mapId").value = "edited-map";
    const beats = structuredClone(completeCampaign.scenes[0]!.beats) as unknown as Array<{
      reports: Array<{ text: string }>;
    }>;
    beats[0]!.reports[0]!.text = "수정된 중첩 보고";
    input<HTMLTextAreaElement>("beats").value = JSON.stringify(beats);
    action("apply-scene").click();

    const changed = campaignDocument.scene(completeCampaign.scenes[0]!.identity.id)!;
    expect(changed.copy.title).toBe("수정된 첫 장면");
    expect(changed.presentation.mapId).toBe("edited-map");
    expect(root.querySelector("[data-field='encounterParameters.threatBudget']")).toBeNull();
    expect(root.querySelector("[data-field='encounterParameters.reinforcementIntervalMs']")).toBeNull();
    expect(changed.beats[0]!.reports[0]!.text).toBe("수정된 중첩 보고");

    const nextSelector = action("select-scene") as unknown as HTMLSelectElement;
    nextSelector.value = completeCampaign.scenes[1]!.identity.id;
    nextSelector.dispatchEvent(new Event("change"));
    expect(input<HTMLInputElement>("copy.title").value).toBe(
      completeCampaign.scenes[1]!.copy.title,
    );
  });

  it("keeps the last valid document for malformed JSON, non-finite numbers, and broken links", () => {
    const original = campaignDocument.snapshot();
    input<HTMLTextAreaElement>("guidance").value = "[{";
    action("apply-scene").click();
    expect(campaignDocument.snapshot()).toEqual(original);
    expect(root.querySelector("[role='alert']")?.textContent).toContain(
      "guidance: JSON 형식 오류",
    );

    input<HTMLInputElement>("gameplayTuning.simulationSpeed").value = "";
    action("apply-scene").click();
    expect(campaignDocument.snapshot()).toEqual(original);
    expect(root.querySelector("[role='alert']")?.textContent).toContain(
      "gameplayTuning.simulationSpeed: 숫자 오류",
    );

    const transitions = [{ outcomeId: "success", targetSceneId: "missing-scene" }];
    input<HTMLTextAreaElement>("transitions").value = JSON.stringify(transitions);
    action("apply-scene").click();
    expect(campaignDocument.snapshot()).toEqual(original);
    expect(root.querySelector("[role='alert']")?.textContent).toContain(
      "transitions[0].targetSceneId: 캠페인 연결 오류",
    );
  });

  it("saves, exports, imports, reloads, and restores the authored campaign", () => {
    input<HTMLInputElement>("copy.title").value = "저장될 제목";
    const beats = structuredClone(completeCampaign.scenes[0]!.beats) as unknown as Array<{
      reports: Array<{ text: string }>;
    }>;
    beats[0]!.reports[0]!.text = "저장될 중첩 보고";
    input<HTMLTextAreaElement>("beats").value = JSON.stringify(beats);
    action("apply-scene").click();
    action("save-campaign").click();

    const reloaded = createCampaignDocument(completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, storage),
    });
    expect(reloaded.load().ok).toBe(true);
    expect(reloaded.listScenes()[0]!.copy.title).toBe("저장될 제목");
    expect(reloaded.listScenes()[0]!.beats[0]!.reports[0]!.text).toBe("저장될 중첩 보고");

    action("export-campaign").click();
    const exchange = input<HTMLTextAreaElement>("campaign-json");
    const exported = JSON.parse(exchange.value) as {
      scenes: Array<{
        copy: { title: string };
        encounterParameters: Record<string, unknown>;
      }>;
    };
    expect(exported.scenes[0]!.copy.title).toBe("저장될 제목");
    expect(exported.scenes[0]!.encounterParameters).not.toHaveProperty("threatBudget");
    expect(exported.scenes[0]!.encounterParameters).not.toHaveProperty("reinforcementIntervalMs");
    exported.scenes[0]!.copy.title = "가져온 제목";
    const importedBeats = exported.scenes[0] as unknown as {
      beats: Array<{ reports: Array<{ text: string }> }>;
    };
    importedBeats.beats[0]!.reports[0]!.text = "가져온 중첩 보고";
    exchange.value = JSON.stringify(exported);
    action("import-campaign").click();
    expect(campaignDocument.listScenes()[0]!.copy.title).toBe("가져온 제목");
    expect(campaignDocument.listScenes()[0]!.beats[0]!.reports[0]!.text).toBe(
      "가져온 중첩 보고",
    );

    action("restore-campaign").click();
    expect(campaignDocument.snapshot()).toEqual(completeCampaign);
    expect(storage.values.size).toBe(0);
    expect(restartCount).toBe(1);
  });

  it("reports storage failures in Korean without changing the document", () => {
    const failingStorage: CampaignKeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
    };
    campaignDocument = createCampaignDocument(completeCampaign, {
      repository: createLocalStorageCampaignRepository(completeCampaign, failingStorage),
    });
    mountCampaignWorkshop(root, campaignDocument, {
      onClose: () => undefined,
      onRestart: () => undefined,
    });
    const original = campaignDocument.snapshot();
    action("save-campaign").click();
    expect(campaignDocument.snapshot()).toEqual(original);
    expect(root.querySelector("[role='alert']")?.textContent).toContain("저장소 오류");
  });
});
