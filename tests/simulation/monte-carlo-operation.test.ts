import { describe, expect, it } from "vitest";

import type {
  AgentProfile,
  CampaignOfficer,
  CampaignScene,
  ThreatKind,
} from "../../src/campaign";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import {
  BALANCED_HARNESS,
  OPERATION_FIXED_STEP_MS,
  type OperationSimulation,
  type OperationSnapshot,
} from "../../src/simulation/simulationTypes";

const floodedConvoy = completeCampaign.scenes.find(
  ({ identity }) => identity.id === "flooded-convoy",
) as CampaignScene;

const actionProfile: AgentProfile = {
  initiative: 1,
  caution: 0.2,
  discipline: 0.6,
  cooperation: 0.1,
  stressTolerance: 0.8,
  memoryCapacity: 8,
  sourceTrust: [],
};

const communicationProfile: AgentProfile = {
  initiative: 0.1,
  caution: 0.4,
  discipline: 0.7,
  cooperation: 1,
  stressTolerance: 0.8,
  memoryCapacity: 8,
  sourceTrust: [],
};

const verificationProfile: AgentProfile = {
  initiative: 0.4,
  caution: 0.85,
  discipline: 0.9,
  cooperation: 0.65,
  stressTolerance: 0.7,
  memoryCapacity: 10,
  sourceTrust: [],
};

function rosterWith(profile: AgentProfile): CampaignOfficer[] {
  return completeCampaign.officers.map((officer) => ({ ...officer, profile }));
}

function finish(profile: AgentProfile, seed: number): OperationSnapshot {
  return finishSimulation(floodedConvoy, profile, seed).snapshot();
}

function finishSimulation(
  scene: CampaignScene,
  profile: AgentProfile,
  seed: number,
): OperationSimulation {
  const simulation = createOperationSimulation(
    scene,
    rosterWith(profile),
    seed,
    BALANCED_HARNESS,
  );
  let snapshot = simulation.snapshot();
  while (snapshot.status === "running") {
    snapshot = simulation.advance(
      Math.min(OPERATION_FIXED_STEP_MS, snapshot.durationMs - snapshot.elapsedMs),
    );
  }
  return simulation;
}

function worldOutcome(snapshot: OperationSnapshot) {
  return {
    status: snapshot.status,
    threats: snapshot.threats.map(({ result }) => result),
    units: snapshot.units.map(({ tile, health }) => ({ tile, health })),
    civilianSafety: snapshot.metrics.civilianSafety,
    logistics: snapshot.metrics.logistics,
  };
}

function sceneOpeningWith(kind: ThreatKind): CampaignScene {
  return {
    ...floodedConvoy,
    beats: floodedConvoy.beats.map((beat, index) => index === 0
      ? {
          ...beat,
          threats: [{
            id: `opening-${kind}`,
            kind,
            lane: "north",
            severity: "high",
            telegraphDurationMs: 7_000,
          }],
        }
      : beat),
  };
}

function openingAction(kind: ThreatKind): string | undefined {
  const simulation = createOperationSimulation(
    sceneOpeningWith(kind),
    rosterWith(verificationProfile),
    23,
    BALANCED_HARNESS,
  );
  return simulation.events().find((event) =>
    event.kind === "decision" && event.data.officerId === "major-baek"
  )?.data.action as string | undefined;
}

describe("Monte Carlo operation autonomy", () => {
  it("turns different officer behavior into different world outcomes", () => {
    expect(worldOutcome(finish(actionProfile, 17))).not.toEqual(
      worldOutcome(finish(communicationProfile, 17)),
    );
  });

  it("does not invent an autonomous replan without verification and field action", () => {
    const orchardSiege = completeCampaign.scenes.find(
      ({ identity }) => identity.id === "orchard-siege",
    ) as CampaignScene;
    const simulation = finishSimulation(orchardSiege, communicationProfile, 19);

    expect(simulation.events().some(({ kind }) => kind === "autonomous-replan")).toBe(false);
  });

  it("responds differently to physical danger and misinformation", () => {
    expect(openingAction("artillery")).not.toBe(openingAction("misinformation"));
  });

  it("lets an autonomous broadcast spread locally observed danger", () => {
    const simulation = createOperationSimulation(
      sceneOpeningWith("artillery"),
      rosterWith(communicationProfile),
      29,
      BALANCED_HARNESS,
    );
    simulation.advance(5_000);

    expect(
      simulation.snapshot().officers
        .filter(({ id }) => id !== "major-baek")
        .some(({ beliefs }) => beliefs.some(({ subjectId }) => subjectId === "opening-artillery")),
    ).toBe(true);
  });

  it("lets verification behavior resolve a pending report sooner", () => {
    const reportStateAt = (profile: AgentProfile) => {
      const simulation = createOperationSimulation(
        floodedConvoy,
        rosterWith(profile),
        31,
        BALANCED_HARNESS,
      );
      simulation.advance(2_000);
      return simulation.snapshot().messages.find(
        ({ authoredReportId }) => authoredReportId === "convoy-baek-departure",
      )?.verificationState;
    };

    expect(reportStateAt(verificationProfile)).toBe("verified");
    expect(reportStateAt(communicationProfile)).toBe("pending");
  });

  it("samples whether a local officer notices a telegraphed threat", () => {
    const observations = Array.from({ length: 32 }, (_, seed) => {
      const simulation = createOperationSimulation(
        sceneOpeningWith("artillery"),
        completeCampaign.officers,
        seed,
        BALANCED_HARNESS,
      );
      return simulation.snapshot().officers.find(({ id }) => id === "major-baek")?.beliefs
        .some(({ subjectId }) => subjectId === "opening-artillery") ?? false;
    });

    expect(observations).toContain(true);
    expect(observations).toContain(false);
  });

  it("produces a distribution of combat and terminal outcomes across seeds", () => {
    const outcomes = Array.from({ length: 32 }, (_, seed) => {
      const snapshot = finishSimulation(
        floodedConvoy,
        actionProfile,
        seed,
      ).snapshot();
      return JSON.stringify({
        status: snapshot.status,
        threats: snapshot.threats.map(({ result }) => result),
        health: snapshot.units.map(({ health }) => health),
      });
    });

    expect(new Set(outcomes).size).toBeGreaterThan(1);
    expect(outcomes.some((outcome) => outcome.includes('"status":"success"'))).toBe(true);
    expect(outcomes.some((outcome) => outcome.includes('"status":"retry"'))).toBe(true);
  }, 15_000);

  it("lets verification behavior neutralize misinformation", () => {
    const simulation = createOperationSimulation(
      sceneOpeningWith("misinformation"),
      rosterWith(verificationProfile),
      23,
      BALANCED_HARNESS,
    );
    simulation.advance(7_000);

    expect(simulation.snapshot().threats[0]?.result).toBe("blocked");
  });

  it("moves the outcome distribution when the player issues a strong defense signal", () => {
    const blockedCount = (position?: Readonly<{ x: number; y: number }>) =>
      Array.from({ length: 32 }, (_, seed) => {
      const simulation = createOperationSimulation(
        floodedConvoy,
        completeCampaign.officers,
        seed,
        BALANCED_HARNESS,
      );
      let snapshot = simulation.snapshot();
      while (snapshot.status === "running") {
        if (position && snapshot.elapsedMs === 15_000) {
          simulation.intervene({
            kind: "issue-spatial-signal",
            signal: "defend",
            strength: 3,
            position,
          });
        }
        snapshot = simulation.advance(
          Math.min(OPERATION_FIXED_STEP_MS, snapshot.durationMs - snapshot.elapsedMs),
        );
      }
      return snapshot.threats[0]?.result === "blocked" ? 1 : 0;
    }).reduce<number>((total, blocked) => total + blocked, 0);

    const autonomousBlocks = blockedCount();
    const controlledBlocks = blockedCount({ x: 20, y: 2 });
    const misplacedBlocks = blockedCount({ x: 20, y: 11 });

    expect(controlledBlocks - autonomousBlocks).toBeGreaterThanOrEqual(8);
    expect(controlledBlocks).toBeGreaterThan(misplacedBlocks);
    expect(controlledBlocks).toBeLessThan(32);
  }, 25_000);
});
