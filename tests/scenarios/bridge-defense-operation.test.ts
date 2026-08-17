import { describe, expect, it } from "vitest";

import {
  validateCampaignDefinition,
  type CampaignScene,
} from "../../src/campaign";
import {
  bridgeDefenseCampaign,
  bridgeDefenseMap,
  bridgeDefenseMapSkin,
  bridgeDefenseOfficers,
  bridgeDefenseOperation,
} from "../../src/scenarios/bridgeDefenseOperation";
import { createOperationSimulation } from "../../src/simulation/operationSimulation";
import { BALANCED_HARNESS } from "../../src/simulation/simulationTypes";

const poorHarness = {
  informationReach: 0.05,
  authorityClarity: 0.05,
  verificationDepth: 0.05,
  feedbackCompression: 0.05,
} as const;

describe("bridge-defense vertical slice content", () => {
  it("authors the 24x16 bridge, two detours, four officers, and messenger", () => {
    expect(validateCampaignDefinition(bridgeDefenseCampaign).valid).toBe(true);
    expect(bridgeDefenseMap).toMatchObject({ width: 24, height: 16 });
    expect(bridgeDefenseMapSkin.crossings).toEqual([
      expect.objectContaining({ kind: "detour", position: { x: 11, y: 3 } }),
      expect.objectContaining({ kind: "bridge", position: { x: 11, y: 7 } }),
      expect.objectContaining({ kind: "detour", position: { x: 11, y: 13 } }),
    ]);
    expect(bridgeDefenseOperation.presentation.mapId).toBe(bridgeDefenseMapSkin.id);
    expect(bridgeDefenseOfficers).toHaveLength(4);
    expect(bridgeDefenseOfficers).toContainEqual(
      expect.objectContaining({ id: "warrant-park", role: expect.stringContaining("전령") }),
    );
  });

  it("authors one real artillery threat, one false report, and bridge/civilian objectives", () => {
    const scene: CampaignScene = bridgeDefenseOperation;
    const threats = scene.beats.flatMap(({ threats }) => threats);

    expect(threats.filter(({ kind }) => kind === "artillery")).toHaveLength(1);
    expect(threats.filter(({ kind }) => kind === "misinformation")).toHaveLength(1);
    expect(bridgeDefenseOperation.objectives.map(({ id }) => id)).toEqual([
      "preserve-haein-bridge",
      "preserve-civilian-column",
    ]);
    expect(bridgeDefenseOperation.gameplayTuning.interventionBudget).toBe(6);
  });

  it("starts no-input officers on different goals and spatial paths", () => {
    const simulation = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      "bridge-no-input",
      BALANCED_HARNESS,
    );
    const snapshot = simulation.snapshot();

    expect(new Set(snapshot.units.map(({ objectiveId }) => objectiveId))).toEqual(
      new Set(["preserve-haein-bridge", "preserve-civilian-column"]),
    );
    expect(new Set(snapshot.spatial.actors.map(({ destination }) => JSON.stringify(destination))).size)
      .toBe(4);
    expect(new Set(snapshot.spatial.actors.map(({ path }) => JSON.stringify(path))).size)
      .toBe(4);
  });

  it("changes visible behavior and outcome for the same seed when the harness changes", () => {
    const balanced = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      "bridge-harness-pair",
      BALANCED_HARNESS,
    );
    const poor = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      "bridge-harness-pair",
      poorHarness,
    );

    balanced.advance(bridgeDefenseOperation.encounterParameters.durationMs);
    poor.advance(bridgeDefenseOperation.encounterParameters.durationMs);

    expect(balanced.snapshot()).toMatchObject({
      status: "success",
      metrics: { civilianSafety: 100, objectiveProgress: 1 },
      threats: [
        expect.objectContaining({ result: "blocked" }),
        expect.objectContaining({ result: "blocked" }),
      ],
    });
    expect(poor.snapshot()).toMatchObject({
      status: "retry",
      threats: [
        expect.objectContaining({ result: "damaged-objective" }),
        expect.objectContaining({ result: "damaged-objective" }),
      ],
    });
    expect(poor.snapshot().metrics.civilianSafety).toBeLessThan(
      balanced.snapshot().metrics.civilianSafety,
    );
  });
});
