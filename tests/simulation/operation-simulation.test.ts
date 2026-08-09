import { describe, expect, it } from "vitest";

import type { CampaignOfficer, CampaignScene } from "../../src/campaign";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { createOperationSimulation } from "../../src/simulation/operationSimulation";
import {
  createSeededRandom,
  deriveRunSeed,
} from "../../src/simulation/seededRandom";
import {
  BALANCED_HARNESS,
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
  type OfficerIntent,
  type OperationSimulation,
} from "../../src/simulation/simulationTypes";

const playableScenes = completeCampaign.scenes.filter(
  ({ identity }) => identity.kind !== "epilogue",
);
const poorHarness: HarnessConfiguration = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
};

function runToEnd(
  scene: CampaignScene,
  seed: string | number,
  harness: HarnessConfiguration = BALANCED_HARNESS,
): OperationSimulation {
  const simulation = createOperationSimulation(
    scene,
    completeCampaign.officers,
    seed,
    harness,
  );
  simulation.advance(scene.encounterParameters.durationMs);
  return simulation;
}

describe("seeded random", () => {
  it("replays the same local sequence and stays inside its documented range", () => {
    const first = createSeededRandom("campaign:scene:attempt-7");
    const second = createSeededRandom("campaign:scene:attempt-7");
    const firstSequence = Array.from({ length: 20 }, () => first.next());
    const secondSequence = Array.from({ length: 20 }, () => second.next());

    expect(firstSequence).toEqual(secondSequence);
    expect(firstSequence.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(firstSequence).size).toBeGreaterThan(1);
  });

  it("derives unambiguous run seeds and validates every random boundary", () => {
    expect(deriveRunSeed("campaign", "scene", 7)).toBe("campaign:scene:7");
    expect(deriveRunSeed("campaign", "other-scene", 7)).not.toBe(
      deriveRunSeed("campaign", "scene", 7),
    );

    expect(() => createSeededRandom(1.5)).toThrow(RangeError);
    expect(() => createSeededRandom("")).toThrow(TypeError);
    expect(() => createSeededRandom(1).integer(0)).toThrow(RangeError);
    expect(() => createSeededRandom(1).pick([])).toThrow(RangeError);
  });
});

describe("operation simulation determinism", () => {
  it("is invariant to one advance or many irregular advances with the same total", () => {
    const scene = playableScenes[3] as CampaignScene;
    const single = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "segmentation-seed",
      BALANCED_HARNESS,
    );
    const segmented = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "segmentation-seed",
      BALANCED_HARNESS,
    );
    single.advance(scene.encounterParameters.durationMs);

    const chunks = [17, 83, 1, 499, 2_003, 41, 777, 9_111];
    let remaining = scene.encounterParameters.durationMs;
    let chunkIndex = 0;
    while (remaining > 0) {
      const amount = Math.min(chunks[chunkIndex % chunks.length] as number, remaining);
      segmented.advance(amount);
      remaining -= amount;
      chunkIndex += 1;
    }

    expect(segmented.snapshot()).toEqual(single.snapshot());
    expect(segmented.replay()).toEqual(single.replay());
  });

  it("uses no elapsed display time while the caller does not advance", () => {
    const simulation = createOperationSimulation(
      playableScenes[0] as CampaignScene,
      completeCampaign.officers,
      1,
      BALANCED_HARNESS,
    );
    const initialSnapshot = simulation.snapshot();
    const initialReplay = simulation.replay();

    expect(simulation.snapshot()).toEqual(initialSnapshot);
    expect(simulation.replay()).toEqual(initialReplay);
    expect(initialSnapshot.elapsedMs).toBe(0);
    expect(initialSnapshot.fixedStepMs).toBe(OPERATION_FIXED_STEP_MS);
  });

  it("replays identical state and random decisions for an identical seed", () => {
    const scene = playableScenes[1] as CampaignScene;
    const first = runToEnd(scene, 4481);
    const second = runToEnd(scene, 4481);

    expect(second.snapshot()).toEqual(first.snapshot());
    expect(second.replay()).toEqual(first.replay());
    expect(
      first.replay().filter(({ kind }) => kind === "random-choice").length,
    ).toBeGreaterThan(0);
  });

  it("allows seeds to vary plausible intents without changing dispositions", () => {
    const scene = playableScenes[0] as CampaignScene;
    const snapshots = Array.from({ length: 24 }, (_, seed) =>
      createOperationSimulation(
        scene,
        completeCampaign.officers,
        seed,
        BALANCED_HARNESS,
      ).snapshot(),
    );

    expect(
      new Set(
        snapshots.map((snapshot) =>
          snapshot.officers.map(({ intent }) => intent).join("|"),
        ),
      ).size,
    ).toBeGreaterThan(1);
    snapshots.forEach((snapshot) => {
      expect(snapshot.officers.map(({ disposition }) => disposition)).toEqual([
        "action",
        "verification",
        "communication",
      ]);
    });
  });
});

describe("officer autonomy and limited information", () => {
  it("keeps disposition-specific intent sets and favors each stable bias", () => {
    const allowed: Readonly<Record<string, readonly OfficerIntent[]>> = {
      action: ["advance-locally", "engage-threat", "secure-objective"],
      verification: ["cross-check-report", "inspect-source", "hold-for-evidence"],
      communication: ["route-report", "broadcast-update", "compress-feedback"],
    };
    const preferred: Readonly<Record<string, OfficerIntent>> = {
      action: "advance-locally",
      verification: "cross-check-report",
      communication: "route-report",
    };
    const counts = new Map<string, number>();

    Array.from({ length: 60 }, (_, seed) => seed).forEach((seed) => {
      const snapshot = createOperationSimulation(
        playableScenes[0] as CampaignScene,
        completeCampaign.officers,
        seed,
        BALANCED_HARNESS,
      ).snapshot();
      snapshot.officers.forEach(({ disposition, intent }) => {
        expect(allowed[disposition]).toContain(intent);
        const key = `${disposition}:${intent}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    Object.entries(preferred).forEach(([disposition, intent]) => {
      const preferredCount = counts.get(`${disposition}:${intent}`) ?? 0;
      const alternateCounts = (allowed[disposition] as readonly OfficerIntent[])
        .filter((candidate) => candidate !== intent)
        .map((candidate) => counts.get(`${disposition}:${candidate}`) ?? 0);
      expect(preferredCount).toBeGreaterThanOrEqual(Math.max(...alternateCounts));
    });
  });

  it("does not give officers reports that information reach did not deliver", () => {
    const isolatedHarness = { ...BALANCED_HARNESS, informationReach: 0 };
    const simulation = createOperationSimulation(
      playableScenes[0] as CampaignScene,
      completeCampaign.officers,
      11,
      isolatedHarness,
    );
    simulation.advance(5_000);
    const snapshot = simulation.snapshot();
    const source = snapshot.officers.find(({ id }) => id === "major-baek");
    const otherOfficers = snapshot.officers.filter(({ id }) => id !== "major-baek");

    expect(source?.beliefs.map(({ subjectId }) => subjectId)).toContain(
      "school-baek-ready",
    );
    otherOfficers.forEach((officer) => {
      expect(officer.beliefs.map(({ subjectId }) => subjectId)).not.toContain(
        "school-baek-ready",
      );
    });
    expect(snapshot.messages[0]?.recipientOfficerIds).toEqual([]);
  });

  it("exposes intent, confidence, current belief, and pending decision", () => {
    const snapshot = createOperationSimulation(
      playableScenes[0] as CampaignScene,
      completeCampaign.officers,
      12,
      BALANCED_HARNESS,
    ).snapshot();

    snapshot.officers.forEach((officer) => {
      expect(officer.intent).toBeTruthy();
      expect(officer.confidence).toBeGreaterThan(0);
      expect(officer.confidence).toBeLessThanOrEqual(1);
      expect(officer.pendingDecision?.intent).toBe(officer.intent);
    });
    expect(snapshot.officers.find(({ id }) => id === "major-baek")?.currentBelief).not.toBeNull();
  });
});

describe("reports and harness tradeoffs", () => {
  it("queues authored reports with delayed delivery and unchanged copy", () => {
    const scene = playableScenes[0] as CampaignScene;
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      21,
      BALANCED_HARNESS,
    );
    const queued = simulation.snapshot().messages[0];
    expect(queued).toMatchObject({
      authoredReportId: "school-baek-ready",
      sourceOfficerId: "major-baek",
      createdAtMs: 0,
      deliveryState: "queued",
      text: scene.beats[0]?.reports[0]?.text,
    });
    expect(queued?.deliveryAtMs).toBeGreaterThan(queued?.createdAtMs ?? 0);

    simulation.advance((queued?.deliveryAtMs ?? 0) - 1);
    expect(simulation.snapshot().messages[0]?.deliveryState).toBe("queued");
    simulation.advance(OPERATION_FIXED_STEP_MS);
    expect(simulation.snapshot().messages[0]?.deliveryState).toBe("delivered");
  });

  it("makes wider reach increase fan-out and delivery delay", () => {
    const scene = playableScenes[0] as CampaignScene;
    const narrow = createOperationSimulation(
      scene,
      completeCampaign.officers,
      31,
      { ...BALANCED_HARNESS, informationReach: 0.25 },
    ).snapshot().messages[0];
    const wide = createOperationSimulation(
      scene,
      completeCampaign.officers,
      31,
      { ...BALANCED_HARNESS, informationReach: 0.8 },
    ).snapshot().messages[0];

    expect(wide?.recipientOfficerIds.length).toBeGreaterThan(
      narrow?.recipientOfficerIds.length ?? 0,
    );
    expect(wide?.deliveryAtMs).toBeGreaterThan(narrow?.deliveryAtMs ?? 0);
  });

  it.each([
    ["informationReach", { ...BALANCED_HARNESS, informationReach: 1 }, "information-saturation"],
    ["authorityClarity-low", { ...BALANCED_HARNESS, authorityClarity: 0 }, "ambiguous-authority"],
    ["verificationDepth", { ...BALANCED_HARNESS, verificationDepth: 1 }, "verification-congestion"],
    ["feedbackCompression", { ...BALANCED_HARNESS, feedbackCompression: 0 }, "noisy-feedback"],
    ["authorityClarity-high", { ...BALANCED_HARNESS, authorityClarity: 1 }, "over-centralization"],
  ] as const)("explains the distinct %s tradeoff", (_name, harness, consequence) => {
    const simulation = createOperationSimulation(
      playableScenes[0] as CampaignScene,
      completeCampaign.officers,
      41,
      harness,
    );

    expect(simulation.snapshot().consequences).toContain(consequence);
    expect(
      simulation
        .replay()
        .some(
          (entry) =>
            entry.kind === "harness-consequence" &&
            entry.data.consequence === consequence,
        ),
    ).toBe(true);
  });

  it("makes deep verification more reliable but congested when over-provisioned", () => {
    const scene = playableScenes[0] as CampaignScene;
    const moderate = createOperationSimulation(
      scene,
      completeCampaign.officers,
      51,
      { ...BALANCED_HARNESS, verificationDepth: 0.5 },
    );
    const congested = createOperationSimulation(
      scene,
      completeCampaign.officers,
      51,
      { ...BALANCED_HARNESS, verificationDepth: 1 },
    );
    moderate.advance(4_000);
    congested.advance(4_000);

    expect(moderate.snapshot().messages[0]?.verificationState).toBe("verified");
    expect(congested.snapshot().messages[0]?.verificationState).toBe("pending");
    expect(congested.snapshot().metrics.signalBacklog).toBeGreaterThan(
      moderate.snapshot().metrics.signalBacklog,
    );
  });
});

describe("threats, intervention, and outcome", () => {
  it("never damages an objective before the authored telegraph ends", () => {
    const scene = playableScenes[1] as CampaignScene;
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      61,
      poorHarness,
    );
    const threatBeat = scene.beats.find(({ threats }) => threats.length > 0);
    const authoredThreat = threatBeat?.threats[0];
    expect(threatBeat).toBeDefined();
    expect(authoredThreat).toBeDefined();

    simulation.advance(threatBeat?.timeMs ?? 0);
    const telegraphed = simulation.snapshot();
    expect(telegraphed.threats[0]).toMatchObject({
      id: authoredThreat?.id,
      state: "telegraphed",
      result: null,
      kind: authoredThreat?.kind,
      lane: authoredThreat?.lane,
      severity: authoredThreat?.severity,
    });
    expect(telegraphed.metrics.civilianSafety).toBe(100);

    simulation.advance((authoredThreat?.telegraphDurationMs ?? 0) - OPERATION_FIXED_STEP_MS);
    expect(simulation.snapshot().threats[0]?.state).toBe("telegraphed");
    expect(simulation.snapshot().metrics.civilianSafety).toBe(100);
    simulation.advance(OPERATION_FIXED_STEP_MS);
    expect(simulation.snapshot().threats[0]?.state).toBe("resolved");
    expect(simulation.snapshot().metrics.civilianSafety).toBeLessThan(100);
  });

  it("supports all three intervention commands and records their costs", () => {
    const scene = playableScenes[0] as CampaignScene;
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      71,
      { ...BALANCED_HARNESS, informationReach: 0.1 },
    );

    simulation.intervene({
      kind: "route-report",
      reportId: "school-baek-ready",
      recipientOfficerId: "captain-han",
    });
    simulation.intervene({ kind: "authorize-officer", officerId: "captain-han" });
    simulation.intervene({
      kind: "prioritize-verification",
      reportId: "school-baek-ready",
    });
    const snapshot = simulation.snapshot();

    expect(snapshot.metrics).toMatchObject({
      interventionCount: 3,
      autonomyScore: 55,
      logistics: 94,
    });
    expect(snapshot.officers.find(({ id }) => id === "captain-han")?.authorized).toBe(true);
    expect(snapshot.messages.some(({ id }) => id.startsWith("intervention-route-"))).toBe(true);
    expect(snapshot.messages[0]?.prioritized).toBe(true);
    expect(simulation.replay().filter(({ kind }) => kind === "intervention")).toHaveLength(3);

    simulation.advance(scene.encounterParameters.durationMs);
    expect(simulation.snapshot().metrics.autonomyScore).toBe(55);
  });

  it("runs the final compound crisis through cross-check, authority, and autonomous replan", () => {
    const scene = playableScenes.at(-1) as CampaignScene;
    const simulation = runToEnd(scene, "final-autonomy");
    const replay = simulation.replay();

    expect(simulation.snapshot()).toMatchObject({
      sceneId: "orchard-siege",
      status: "success",
      outcomeId: "success",
      metrics: { interventionCount: 0, autonomyScore: 100 },
    });
    expect(replay.find(({ kind }) => kind === "cross-check")).toMatchObject({
      timeMs: 22_400,
      data: {
        sourceOfficerIds: ["captain-han", "lieutenant-kim"],
        reportIds: ["orchard-han-contradiction", "orchard-kim-four-alerts"],
      },
    });
    expect(replay.find(({ kind }) => kind === "authority-reassigned")?.timeMs).toBe(22_400);
    expect(replay.find(({ kind }) => kind === "autonomous-replan")?.timeMs).toBe(22_400);
    expect(replay.at(-1)).toMatchObject({
      kind: "outcome",
      data: { autonomousReplan: true, interventionCount: 0, outcomeId: "success" },
    });
  });

  const matrix = playableScenes.flatMap((scene) => [
    {
      sceneId: scene.identity.id,
      scene,
      seed: 101,
      harnessName: "balanced",
      harness: BALANCED_HARNESS,
      expected: "success",
    },
    {
      sceneId: scene.identity.id,
      scene,
      seed: 907,
      harnessName: "balanced",
      harness: BALANCED_HARNESS,
      expected: "success",
    },
    {
      sceneId: scene.identity.id,
      scene,
      seed: 101,
      harnessName: "poor",
      harness: poorHarness,
      expected: "retry",
    },
  ]);

  it.each(matrix)(
    "$sceneId seed=$seed harness=$harnessName -> $expected",
    ({ scene, seed, harness, expected }) => {
      const simulation = runToEnd(scene, seed, harness);
      const snapshot = simulation.snapshot();
      const declaredOutcomeIds = scene.transitions.map(({ outcomeId }) => outcomeId);

      expect(snapshot.elapsedMs).toBe(scene.encounterParameters.durationMs);
      expect(snapshot.status).toBe(expected);
      expect(declaredOutcomeIds).toContain(snapshot.outcomeId);
      expect(simulation.replay().at(-1)).toMatchObject({
        kind: "outcome",
        timeMs: scene.encounterParameters.durationMs,
      });
    },
  );

  it("keeps terminal state and replay stable across later commands", () => {
    const scene = playableScenes[2] as CampaignScene;
    const simulation = runToEnd(scene, 81);
    const terminalSnapshot = simulation.snapshot();
    const terminalReplay = simulation.replay();

    expect(simulation.advance(99_999)).toEqual(terminalSnapshot);
    expect(
      simulation.intervene({ kind: "authorize-officer", officerId: "major-baek" }),
    ).toEqual(terminalSnapshot);
    expect(simulation.replay()).toEqual(terminalReplay);
  });
});

describe("operation state isolation", () => {
  it("isolates supplied scene, roster, seed configuration, snapshots, and replay", () => {
    const sourceScene = structuredClone(playableScenes[0]) as CampaignScene;
    const sourceRoster = structuredClone(
      completeCampaign.officers,
    ) as CampaignOfficer[];
    const sourceHarness = { ...BALANCED_HARNESS };
    const originalReportText = sourceScene.beats[0]?.reports[0]?.text;
    const simulation = createOperationSimulation(
      sourceScene,
      sourceRoster,
      "mutation-seed",
      sourceHarness,
    );

    (sourceScene.identity as { id: string }).id = "mutated-scene";
    (sourceScene.beats[0]?.reports[0] as { text: string }).text = "mutated report";
    (sourceRoster[0] as { disposition: "verification" }).disposition = "verification";
    sourceHarness.informationReach = 0;

    const returnedSnapshot = simulation.snapshot() as unknown as {
      sceneId: string;
      officers: Array<{ beliefs: Array<{ assertion: string }> }>;
      messages: Array<{ text: string; recipientOfficerIds: string[] }>;
      metrics: { civilianSafety: number };
    };
    returnedSnapshot.sceneId = "returned-mutation";
    returnedSnapshot.messages[0].text = "returned report mutation";
    returnedSnapshot.messages[0].recipientOfficerIds.push("invented-officer");
    returnedSnapshot.metrics.civilianSafety = 0;

    const returnedReplay = simulation.replay() as unknown as Array<{
      description: string;
    }>;
    returnedReplay[0].description = "returned replay mutation";
    returnedReplay.push({ description: "invented replay" });

    expect(simulation.snapshot().sceneId).toBe("signal-school");
    expect(simulation.snapshot().messages[0]?.text).toBe(originalReportText);
    expect(simulation.snapshot().metrics.civilianSafety).toBe(100);
    expect(simulation.snapshot().officers[0]?.disposition).toBe("action");
    expect(simulation.replay()[0]?.description).not.toBe("returned replay mutation");
    expect(simulation.replay().some(({ description }) => description === "invented replay")).toBe(false);
  });

  it("rejects invalid factory, time, and intervention inputs without partial mutation", () => {
    const scene = playableScenes[0] as CampaignScene;
    expect(() =>
      createOperationSimulation(scene, completeCampaign.officers, 1, {
        ...BALANCED_HARNESS,
        informationReach: 2,
      }),
    ).toThrow(RangeError);
    const epilogue = completeCampaign.scenes.at(-1) as CampaignScene;
    expect(() =>
      createOperationSimulation(epilogue, completeCampaign.officers, 1, BALANCED_HARNESS),
    ).toThrow(RangeError);

    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      1,
      BALANCED_HARNESS,
    );
    const initialSnapshot = simulation.snapshot();
    const initialReplay = simulation.replay();
    expect(() => simulation.advance(-1)).toThrow(RangeError);
    expect(() =>
      simulation.intervene({ kind: "authorize-officer", officerId: "missing" }),
    ).toThrow(RangeError);
    expect(simulation.snapshot()).toEqual(initialSnapshot);
    expect(simulation.replay()).toEqual(initialReplay);
  });
});
