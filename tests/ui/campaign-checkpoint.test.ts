import { describe, expect, it, vi } from "vitest";

import {
  createCampaignCheckpoint,
  createCampaignCheckpointStore,
} from "../../src/app/CampaignCheckpoint";
import { createProductionCampaignOperationFactory } from "../../src/application/campaign-operation";
import { createGameSession, type GameSessionResume } from "../../src/application/game-session";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

describe("campaign checkpoint module", () => {
  it("deduplicates snapshots and restores through its three-operation interface", () => {
    let saved: GameSessionResume | null = null;
    const save = vi.fn((resume: GameSessionResume) => {
      saved = structuredClone(resume);
    });
    const store = {
      load: () => saved,
      save,
      clear: () => { saved = null; },
    };
    const checkpoint = createCampaignCheckpoint(store);
    expect(checkpoint.restore()).toEqual({
      resume: undefined,
      recoveredFromFailure: false,
    });

    const snapshot = createGameSession(chuncheonCampaign, "checkpoint", undefined, {
      operationFactory: createProductionCampaignOperationFactory(chuncheonAutonomousBattle),
    }).read();
    checkpoint.capture(snapshot);
    checkpoint.capture(snapshot);
    expect(save).toHaveBeenCalledOnce();

    const restored = createCampaignCheckpoint(store).restore();
    expect(restored.recoveredFromFailure).toBe(false);
    expect(restored.resume).toEqual({
      progress: snapshot.progress,
      roleMemory: snapshot.roleMemory,
    });
  });

  it("clears malformed JSON and reports recovery without throwing", () => {
    const values = new Map([["progress:v1", "not-json"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const checkpoint = createCampaignCheckpoint(
      createCampaignCheckpointStore(storage, "progress:v1"),
    );

    expect(checkpoint.restore()).toEqual({
      resume: undefined,
      recoveredFromFailure: true,
    });
    expect(values.has("progress:v1")).toBe(false);
  });

  it("rejects and clears the retired officer-memory checkpoint shape", () => {
    const clear = vi.fn();
    const checkpoint = createCampaignCheckpoint({
      load: () => ({
        progress: {
          currentSceneId: chuncheonCampaign.startSceneId,
          completedSceneIds: [],
          completed: false,
        },
        officerMemory: [],
      }),
      save: () => undefined,
      clear,
    });

    expect(checkpoint.restore()).toEqual({
      resume: undefined,
      recoveredFromFailure: true,
    });
    expect(clear).toHaveBeenCalledOnce();
  });
});
