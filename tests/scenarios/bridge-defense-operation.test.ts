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
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
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

  it("places readable obstacle props only on matching blocked and rough topology", () => {
    const obstacleKinds = ["tree", "rock", "barricade"] as const;
    const obstacles = bridgeDefenseMapSkin.landmarks.filter(({ kind }) =>
      (obstacleKinds as readonly string[]).includes(kind),
    );
    const blocked = new Set(bridgeDefenseMap.blocked.map(({ x, y }) => `${x},${y}`));
    const rough = new Set(bridgeDefenseMap.terrain.map(({ position: { x, y } }) => `${x},${y}`));
    const protectedTiles = new Set([
      ...bridgeDefenseMap.spawns,
      ...bridgeDefenseMap.destinations,
      ...bridgeDefenseMapSkin.crossings,
    ].map(({ position: { x, y } }) => `${x},${y}`));

    expect(obstacles).toHaveLength(10);
    expect(new Set(obstacles.map(({ kind }) => kind))).toEqual(new Set(obstacleKinds));
    expect(new Set(obstacles.map(({ position: { x, y } }) => `${x},${y}`)).size)
      .toBe(obstacles.length);
    for (const obstacle of obstacles) {
      const { x, y } = obstacle.position;
      const key = `${x},${y}`;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(bridgeDefenseMap.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(bridgeDefenseMap.height);
      expect(protectedTiles).not.toContain(key);
      expect(obstacle.kind === "rock" ? blocked : rough).toContain(key);
    }
  });

  it("leaves all crossings, signals, and authored officer routes clear of obstacle props", () => {
    const propTiles = new Set(bridgeDefenseMapSkin.landmarks
      .filter(({ kind }) => kind === "tree" || kind === "rock" || kind === "barricade")
      .map(({ position: { x, y } }) => `${x},${y}`));
    const simulation = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      "bridge-prop-routes",
      BALANCED_HARNESS,
    );
    const officerRouteTiles = simulation.snapshot().spatial.actors.flatMap(({ path }) => path);

    expect(bridgeDefenseMapSkin.crossings.map(({ id }) => id)).toEqual([
      "north-ford",
      "haein-bridge",
      "south-farm-track",
    ]);
    for (const { position: { x, y } } of bridgeDefenseMapSkin.crossings) {
      expect(propTiles).not.toContain(`${x},${y}`);
    }
    for (const { x, y } of officerRouteTiles) {
      expect(propTiles).not.toContain(`${x},${y}`);
    }
    expect(propTiles).not.toContain("11,7");
  });

  it("authors one real artillery threat, one false report, and bridge/civilian objectives", () => {
    const scene: CampaignScene = bridgeDefenseOperation;
    const threats = scene.beats.flatMap(({ threats }) => threats);

    expect(threats.filter(({ kind }) => kind === "artillery")).toHaveLength(1);
    expect(threats.filter(({ kind }) => kind === "misinformation")).toHaveLength(1);
    expect(bridgeDefenseOperation.objectives.map(({ id }) => id)).toEqual([
      "preserve-haein-bridge",
      "protect-civilian-column",
    ]);
    expect(bridgeDefenseOperation.gameplayTuning.interventionBudget).toBe(6);
  });

  it("tells the player what to change on retry using consistent Korean terms", () => {
    expect(bridgeDefenseOperation.copy.failure).toContain("다음 시도");
    expect(bridgeDefenseOperation.copy.failure).toContain("해인교");
    expect(bridgeDefenseOperation.copy.failure).toContain("북쪽");
    expect(bridgeDefenseOperation.copy.failure).toContain("남쪽");
    expect(JSON.stringify(bridgeDefenseOperation.copy)).not.toContain("attention");
  });

  it("teaches one exact bridge defense signal before returning control", () => {
    expect(bridgeDefenseOperation.guidance).toEqual([
      expect.objectContaining({ action: "pause" }),
      expect.objectContaining({
        action: "inspect",
        target: expect.objectContaining({ officerId: "captain-han" }),
      }),
      expect.objectContaining({
        action: "signal",
        target: {
          kind: "spatial-signal",
          signal: "defend",
          strength: 2,
          position: { x: 11, y: 7 },
        },
      }),
      expect.objectContaining({ action: "resume" }),
    ]);
    expect(bridgeDefenseOperation.guidance.filter(({ action }) => action === "signal"))
      .toHaveLength(1);
    expect(bridgeDefenseMapSkin.crossings).toContainEqual(
      expect.objectContaining({
        id: "haein-bridge",
        position: { x: 11, y: 7 },
      }),
    );
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
      new Set(["preserve-haein-bridge", "protect-civilian-column"]),
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
      11,
      BALANCED_HARNESS,
    );
    const poor = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      11,
      poorHarness,
    );

    balanced.advance(bridgeDefenseOperation.encounterParameters.durationMs);
    poor.advance(bridgeDefenseOperation.encounterParameters.durationMs);

    expect(balanced.snapshot()).toMatchObject({
      status: "success",
      metrics: { civilianSafety: 100, objectiveProgress: 1 },
      result: {
        failureCauses: [],
        objectiveFacts: expect.arrayContaining([
          expect.objectContaining({
            id: "point-preservation:preserve-haein-bridge",
            passed: true,
          }),
          expect.objectContaining({
            id: "civilian-survival:operation",
            objectiveId: "protect-civilian-column",
            passed: true,
          }),
        ]),
      },
      threats: [
        expect.objectContaining({ result: "blocked" }),
        expect.objectContaining({ result: "blocked" }),
      ],
    });
    expect(poor.snapshot()).toMatchObject({
      status: "retry",
      result: {
        failureCauses: expect.arrayContaining([
          expect.objectContaining({
            code: "threat-not-neutralized",
            objectiveId: "protect-civilian-column",
          }),
        ]),
      },
      threats: [
        expect.objectContaining({ result: "blocked" }),
        expect.objectContaining({ result: "damaged-objective" }),
      ],
    });
    expect(poor.snapshot().metrics.objectiveProgress).toBeLessThan(
      balanced.snapshot().metrics.objectiveProgress,
    );
  });
});
