import { describe, expect, it } from "vitest";

import {
  bridgeDefenseOfficers,
  bridgeDefenseOperation,
} from "../../src/scenarios/bridgeDefenseOperation";
import {
  evaluateOperations,
  NO_INTERVENTION_POLICY,
} from "../../src/simulation/operationEvaluation";
import { BALANCED_HARNESS } from "../../src/simulation/simulationTypes";

const poorHarness = {
  informationReach: 0.05,
  authorityClarity: 0.05,
  verificationDepth: 0.05,
  feedbackCompression: 0.05,
} as const;

describe("bridge-defense Monte Carlo gate", () => {
  it(
    "separates balanced and poor no-input outcomes over 200 identical seeds",
    () => {
      const common = {
        scene: bridgeDefenseOperation,
        roster: bridgeDefenseOfficers,
        seedRange: { start: 0, count: 200 },
        policy: NO_INTERVENTION_POLICY,
      } as const;
      const balanced = evaluateOperations({
        ...common,
        harness: BALANCED_HARNESS,
      });
      const poor = evaluateOperations({ ...common, harness: poorHarness });

      expect(balanced).toMatchObject({
        runCount: 200,
        unclassifiedFailureCount: 0,
      });
      expect(poor).toMatchObject({
        runCount: 200,
        unclassifiedFailureCount: 0,
      });
      expect(poor.failureReasons.map(({ value }) => value)).toEqual([
        "vehicle-not-arrived",
        "point-not-preserved",
        "threat-not-neutralized",
      ]);
      expect(balanced.successRate).toBeGreaterThan(0);
      expect(balanced.successRate).toBeLessThan(1);
      expect(poor.successRate).toBeGreaterThan(0);
      expect(poor.successRate).toBeLessThan(1);
      expect(balanced.successRate).toBeGreaterThan(poor.successRate);
      expect(balanced.damageTaken.mean).toBeLessThan(poor.damageTaken.mean ?? 0);
      expect(balanced.threatsBlocked.mean).toBeGreaterThan(poor.threatsBlocked.mean ?? 0);
      expect(balanced.worldOutcomeDiversity).toBeGreaterThan(1);
      expect(poor.worldOutcomeDiversity).toBeGreaterThan(1);
    },
    90_000,
  );
});
