import { describe, expect, it } from "vitest";

import type { CampaignScene } from "../../src/campaign/types";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import {
  NO_INTERVENTION_POLICY,
  compareOperationPolicies,
  createScriptedPolicy,
  evaluateOperations,
} from "../../src/simulation/operationEvaluation";
import {
  BALANCED_HARNESS,
  type HarnessConfiguration,
} from "../../src/simulation/simulationTypes";

const playableScenes = completeCampaign.scenes.filter(
  ({ identity }) => identity.kind !== "epilogue",
);
const scene = playableScenes[0] as CampaignScene;
const poorHarness: HarnessConfiguration = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
};

function evaluate(count: number) {
  return evaluateOperations({
    scene,
    roster: completeCampaign.officers,
    seedRange: { start: 100, count },
    harness: BALANCED_HARNESS,
    policy: NO_INTERVENTION_POLICY,
  });
}

describe("operation evaluation", () => {
  it("returns byte-stable JSON and the required structured distributions", () => {
    const first = evaluate(16);
    const second = evaluate(16);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first).toMatchObject({
      schemaVersion: 1,
      sceneId: scene.identity.id,
      policyId: "no-intervention",
      seedRange: { start: 100, count: 16 },
      runCount: 16,
      interventionCount: {
        observedCount: 16,
        missingCount: 0,
        minimum: 0,
        maximum: 0,
      },
    });
    expect(first.actionDistribution.length).toBeGreaterThan(0);
    expect(first.routeDistribution.length).toBeGreaterThan(0);
    expect(first.firstReactionTimeMs.observedCount).toBe(16);
    expect(first.intentDiversity.uniqueIntentCount).toBeGreaterThan(1);
    expect(first.runs.map(({ seed }) => seed)).toEqual(
      Array.from({ length: 16 }, (_, index) => 100 + index),
    );
  }, 10_000);

  it("classifies failures and accounts separately for unclassified failures", () => {
    const result = evaluateOperations({
      scene,
      roster: completeCampaign.officers,
      seedRange: { start: 0, count: 8 },
      harness: poorHarness,
      policy: NO_INTERVENTION_POLICY,
    });

    expect(result.successCount).toBe(0);
    expect(result.failureReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "point-not-preserved", count: 8 }),
        expect.objectContaining({
          value: "threat-not-neutralized",
          count: 8,
        }),
        expect.objectContaining({ value: "report-not-routed", count: 8 }),
      ]),
    );
    expect(result.unclassifiedFailureCount).toBe(0);
  });

  it(
    "keeps the optimal physical outcome fallible and distinct from poor settings",
    () => {
      const common = {
        scene,
        roster: completeCampaign.officers,
        seedRange: { start: 0, count: 32 },
        policy: NO_INTERVENTION_POLICY,
      };
      const optimal = evaluateOperations({ ...common, harness: BALANCED_HARNESS });
      const poor = evaluateOperations({ ...common, harness: poorHarness });

      expect(optimal.successCount).toBeGreaterThan(0);
      expect(optimal.successCount).toBeLessThan(optimal.runCount);
      expect(optimal.successCount).toBeGreaterThan(poor.successCount);
      expect(optimal.failureReasons).not.toEqual(poor.failureReasons);
      expect(optimal.unclassifiedFailureCount).toBe(0);
      expect(poor.unclassifiedFailureCount).toBe(0);
    },
    30_000,
  );

  it("runs paired policies over identical seeds without exposing replay entries", () => {
    const scripted = createScriptedPolicy("authorize-at-start", [
      {
        atMs: 0,
        intervention: {
          kind: "authorize-officer",
          officerId: completeCampaign.officers[0]?.id ?? "",
        },
      },
    ]);
    const result = compareOperationPolicies({
      scene,
      roster: completeCampaign.officers,
      seedRange: { start: 41, count: 24 },
      harness: BALANCED_HARNESS,
      baselinePolicy: NO_INTERVENTION_POLICY,
      comparisonPolicy: scripted,
    });

    expect(result.baseline.runs.map(({ seed }) => seed)).toEqual(
      result.comparison.runs.map(({ seed }) => seed),
    );
    expect(result.pairs.map(({ seed }) => seed)).toEqual(
      Array.from({ length: 24 }, (_, index) => 41 + index),
    );
    expect(result.comparison.interventionCount).toMatchObject({
      minimum: 1,
      maximum: 1,
      mean: 1,
    });
    expect(result.interventionCountDelta).toMatchObject({
      minimum: 1,
      maximum: 1,
      mean: 1,
    });
    expect(JSON.stringify(result)).not.toContain("description");
    expect(JSON.stringify(result)).not.toContain("events");
    expect(JSON.stringify(result)).not.toContain("replay");
  }, 10_000);

  it(
    "executes a 500-plus seed batch",
    () => {
      const result = evaluate(512);

      expect(result.runCount).toBe(512);
      expect(result.runs).toHaveLength(512);
      expect(result.interventionCount.observedCount).toBe(512);
    },
    90_000,
  );

  it("rejects seed ranges and scripted times that cannot replay exactly", () => {
    expect(() =>
      evaluateOperations({
        scene,
        roster: completeCampaign.officers,
        seedRange: { start: 0, count: 0 },
        harness: BALANCED_HARNESS,
        policy: NO_INTERVENTION_POLICY,
      }),
    ).toThrow(/positive safe count/);
    expect(() =>
      createScriptedPolicy("unaligned", [
        {
          atMs: 1,
          intervention: {
            kind: "authorize-officer",
            officerId: completeCampaign.officers[0]?.id ?? "",
          },
        },
      ]),
    ).toThrow(/fixed-step time/);
  });
});
