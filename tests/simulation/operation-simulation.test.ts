import { describe, expect, it } from "vitest";

import type { CampaignOfficer, CampaignScene } from "../../src/campaign";
import { completeCampaign, firstSpatialMap } from "../../src/scenarios/completeCampaign";
import {
  createOperationRandomStreams,
  operationRandomStreamKey,
} from "../../src/domain/operation/internal/randomStreams";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
import {
  createSeededRandom,
  deriveRandomStreamSeed,
  deriveRunSeed,
} from "../../src/simulation/seededRandom";
import {
  BALANCED_HARNESS,
  OPERATION_FIXED_STEP_MS,
  type HarnessConfiguration,
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

describe("operation spatial execution", () => {
  it("executes the deterministic 24x16 fixture through the operation runtime", () => {
    const run = () => {
      const simulation = createOperationSimulation(
        playableScenes[0] as CampaignScene,
        completeCampaign.officers,
        "spatial-runtime-proof",
        BALANCED_HARNESS,
      );
      simulation.advance(4_000);
      return simulation.snapshot().spatial;
    };
    const first = run();

    expect(run()).toEqual(first);
    expect(first.topology).toMatchObject({ width: 24, height: 16 });
    expect(first.actors.map(({ position }) => position)).toEqual(
      [...firstSpatialMap.destinations]
        .map(({ position }, index) => ({
          actorId: completeCampaign.officers[index]!.id,
          position,
        }))
        .sort((left, right) => left.actorId.localeCompare(right.actorId))
        .map(({ position }) => position),
    );
    expect(first.actors.every(({ destination, path }) => destination === null && path.length === 0)).toBe(true);
  });

  it("projects each telegraphed hostile actor tile and current combat state into an immutable threat snapshot", () => {
    const scene = playableScenes.find(
      ({ identity }) => identity.id === "misaddressed-artillery",
    ) as CampaignScene;
    const createRun = () => createOperationSimulation(
      scene,
      completeCampaign.officers,
      101,
      poorHarness,
    );
    const first = createRun();
    const replay = createRun();

    first.advance(14_000);
    replay.advance(14_000);
    const telegraphed = first.snapshot().threats[0];

    expect(telegraphed).toMatchObject({
      id: "artillery-ceremonial-volley",
      state: "telegraphed",
      result: null,
      tile: { x: 23, y: 8 },
      health: 100,
      suppression: 0,
      panicReaction: null,
    });
    expect(replay.snapshot().threats).toEqual(first.snapshot().threats);

    const returned = first.snapshot() as unknown as {
      threats: Array<{ tile: { x: number }; health: number }>;
    };
    returned.threats[0]!.tile.x = 0;
    returned.threats[0]!.health = 0;
    expect(first.snapshot().threats[0]).toMatchObject({
      tile: { x: 23, y: 8 },
      health: 100,
    });

    first.advance(6_000);
    const resolved = first.snapshot().threats[0];
    const finalSuppression = first.events().filter((event) =>
      event.kind === "unit-suppressed" &&
      event.data.actorId === "threat:artillery-ceremonial-volley"
    ).at(-1);

    expect(resolved).toMatchObject({
      id: "artillery-ceremonial-volley",
      state: "resolved",
      result: "damaged-objective",
      tile: { x: 23, y: 8 },
      health: 100,
      suppression: 1,
      panicReaction: "misidentify",
    });
    expect(finalSuppression?.data.suppression).toBe(resolved?.suppression);
  });
});

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

  it("derives stable keyed stream seeds without delimiter collisions", () => {
    expect(deriveRandomStreamSeed("campaign:scene:attempt-7", "signal:report-1")).toBe(
      deriveRandomStreamSeed("campaign:scene:attempt-7", "signal:report-1"),
    );
    expect(deriveRandomStreamSeed("a:b", "c")).not.toBe(
      deriveRandomStreamSeed("a", "b:c"),
    );
    expect(() => deriveRandomStreamSeed("valid", "")).toThrow(TypeError);
  });

  it("keeps stable actor and subsystem streams independent when one consumes extra draws", () => {
    const control = createOperationRandomStreams("stream-isolation");
    const perturbed = createOperationRandomStreams("stream-isolation");
    const baekDecision = operationRandomStreamKey.officerDecision("major-baek");
    const hanDecision = operationRandomStreamKey.officerDecision("captain-han");
    const signal = operationRandomStreamKey.signal("school-baek-ready");

    expect(baekDecision).toBe("officer:major-baek:decision");
    expect(signal).toBe("signal:school-baek-ready");
    expect(operationRandomStreamKey.encounter("school-channel-saturation")).toBe(
      "encounter:school-channel-saturation",
    );

    Array.from({ length: 25 }, () => perturbed.stream(baekDecision).next());

    expect(
      Array.from({ length: 12 }, () => perturbed.stream(hanDecision).next()),
    ).toEqual(Array.from({ length: 12 }, () => control.stream(hanDecision).next()));
    expect(
      Array.from({ length: 12 }, () => perturbed.stream(signal).next()),
    ).toEqual(Array.from({ length: 12 }, () => control.stream(signal).next()));
  });
});

describe("operation simulation determinism", () => {
  it("records deterministic structured events and projects readable replay descriptions", () => {
    const scene = playableScenes[1] as CampaignScene;
    const first = runToEnd(scene, "event-seed");
    const second = runToEnd(scene, "event-seed");

    expect(first.events()).toEqual(second.events());
    expect(first.events().every((event, index) => event.id === `${scene.identity.id}:event-${index}`)).toBe(true);
    expect(first.events().every((event) => !Object.prototype.hasOwnProperty.call(event.data, "description"))).toBe(true);
    expect(first.replay().map(({ description }) => description)).toContain(
      `Operation ${scene.identity.id} started.`,
    );
  });

  it("is invariant to one advance or many irregular advances with the same total", () => {
    const scene = playableScenes[3] as CampaignScene;
    const single = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "segmentation-seed",
      poorHarness,
    );
    const segmented = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "segmentation-seed",
      poorHarness,
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
    expect(segmented.events()).toEqual(single.events());
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

  it("isolates distinct same-source report streams when one consumes an extra draw", () => {
    const scene = structuredClone(playableScenes[0]) as CampaignScene;
    const sourceReport = scene.beats[0]?.reports[0];
    if (!sourceReport) throw new Error("Missing report stream isolation fixture");
    const firstReport = { ...sourceReport, id: "stream-report-a" };
    const laterReport = { ...sourceReport, id: "stream-report-b" };
    const baseScene = {
      ...scene,
      beats: [{ ...scene.beats[0]!, reports: [firstReport, laterReport] }],
    };
    const perturbedScene = {
      ...scene,
      beats: [{
        ...scene.beats[0]!,
        reports: [firstReport, { ...firstReport }, laterReport],
      }],
    };

    const base = createOperationSimulation(
      baseScene,
      completeCampaign.officers,
      "audit-0",
      BALANCED_HARNESS,
    ).snapshot();
    const perturbed = createOperationSimulation(
      perturbedScene,
      completeCampaign.officers,
      "audit-0",
      BALANCED_HARNESS,
    ).snapshot();
    const recipientsFor = (
      snapshot: typeof base,
      reportId: string,
    ): readonly string[] | undefined => snapshot.messages.find(
      ({ authoredReportId }) => authoredReportId === reportId,
    )?.recipientOfficerIds;

    expect(recipientsFor(perturbed, laterReport.id)).toEqual(
      recipientsFor(base, laterReport.id),
    );
  });

  it("allows seeded noise to vary plausible actions without changing dispositions", () => {
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
          snapshot.officers.map(({ committedAction }) =>
            committedAction?.trace.selectedAction.kind,
          ).join("|"),
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
  it("produces meaningfully different personality distributions over 20 seeds", () => {
    const preferred = {
      action: "move",
      verification: "verify",
      communication: "broadcast",
    } as const;
    const counts = new Map<string, number>();

    Array.from({ length: 20 }, (_, seed) => seed).forEach((seed) => {
      const snapshot = createOperationSimulation(
        playableScenes[0] as CampaignScene,
        completeCampaign.officers,
        seed,
        BALANCED_HARNESS,
      ).snapshot();
      snapshot.officers.forEach(({ disposition, committedAction }) => {
        const action = committedAction?.trace.selectedAction.kind;
        expect(action).toBeTruthy();
        const key = `${disposition}:${action}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    Object.entries(preferred).forEach(([disposition, action]) => {
      expect(counts.get(`${disposition}:${action}`) ?? 0).toBeGreaterThanOrEqual(18);
    });
    expect(new Set(Object.values(preferred)).size).toBe(3);
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

  it("exposes intent, confidence, current belief, and committed action", () => {
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
      expect(officer.committedAction?.trace.selectedAction.kind).toBeTruthy();
      expect(officer.decisionCadenceMs).toBeGreaterThan(0);
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

});

describe("threats, intervention, and outcome", () => {
  it("runs spatial combat, personality panic, and autonomous recovery through operation events", () => {
    const scene = playableScenes.find(
      ({ identity }) => identity.id === "misaddressed-artillery",
    ) as CampaignScene;
    const simulation = runToEnd(scene, 101, poorHarness);
    const events = simulation.events();

    expect(events).toContainEqual(expect.objectContaining({
      kind: "unit-hit",
      data: expect.objectContaining({
        actorId: "threat:artillery-ceremonial-volley",
        targetId: "captain-han",
      }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      kind: "unit-suppressed",
      data: expect.objectContaining({ actorId: "captain-han" }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      kind: "unit-retreated",
      data: expect.objectContaining({ actorId: "captain-han" }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      kind: "panic-recovered",
      timeMs: 21_400,
      data: { actorId: "captain-han" },
    }));
    expect(simulation.snapshot().units.find(
      ({ officerId }) => officerId === "captain-han",
    )).toMatchObject({
      tile: { x: 21, y: 7 },
      panicReaction: null,
      suppression: 0.33,
    });
  });

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
    expect(simulation.snapshot().threats[0]?.result).not.toBeNull();
  });

  it.each([
    ["near the duration boundary", 200],
    ["at the duration boundary", 250],
  ])("rejects a threat authored %s without a complete telegraph interval", (_case, timeMs) => {
    const scene = structuredClone(playableScenes[0]) as CampaignScene;
    const sourceBeat = scene.beats.find(({ threats }) => threats.length > 0);
    expect(sourceBeat).toBeDefined();
    (scene.encounterParameters as { durationMs: number }).durationMs = 250;
    (sourceBeat as { timeMs: number }).timeMs = timeMs;
    (sourceBeat?.threats[0] as { telegraphDurationMs: number }).telegraphDurationMs = 100;
    (scene as unknown as { beats: CampaignScene["beats"] }).beats = [
      sourceBeat as CampaignScene["beats"][number],
    ];

    expect(() =>
      createOperationSimulation(scene, completeCampaign.officers, 61, poorHarness),
    ).toThrow(/cannot complete its telegraph/);
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
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "final-autonomy",
      BALANCED_HARNESS,
    );

    simulation.advance(22_300);
    expect(
      simulation.snapshot().officers.find(({ id }) => id === "major-baek")?.authorized,
    ).toBe(false);
    expect(simulation.replay().some(({ kind }) => kind === "authority-reassigned")).toBe(
      false,
    );

    simulation.advance(100);
    expect(
      simulation.snapshot().officers.find(({ id }) => id === "major-baek")?.authorized,
    ).toBe(true);
    expect(simulation.replay().find(({ kind }) => kind === "authority-reassigned")).toMatchObject({
      timeMs: 22_400,
      data: {
        officerId: "major-baek",
        previousAuthorized: false,
        newAuthorized: true,
      },
    });

    simulation.advance(scene.encounterParameters.durationMs);
    const replay = simulation.replay();

    expect(simulation.snapshot()).toMatchObject({
      sceneId: "orchard-siege",
      status: "retry",
      outcomeId: "retry",
      metrics: { interventionCount: 0, autonomyScore: 100 },
    });
    expect(replay.find(({ kind }) => kind === "cross-check")).toMatchObject({
      timeMs: 22_400,
      data: {
        sourceOfficerIds: ["captain-han", "lieutenant-kim"],
        reportIds: ["orchard-han-contradiction", "orchard-kim-four-alerts"],
      },
    });
    expect(replay.find(({ kind }) => kind === "autonomous-replan")?.timeMs).toBe(22_400);
    expect(replay.at(-1)).toMatchObject({
      kind: "outcome",
      data: { autonomousReplan: true, interventionCount: 0, outcomeId: "retry" },
    });
  });

  const terminalCases = playableScenes.flatMap((scene) => [
    { sceneId: scene.identity.id, scene, seed: 101, harnessName: "balanced", harness: BALANCED_HARNESS },
    { sceneId: scene.identity.id, scene, seed: 907, harnessName: "balanced", harness: BALANCED_HARNESS },
    { sceneId: scene.identity.id, scene, seed: 101, harnessName: "poor", harness: poorHarness },
  ]);

  it.each(terminalCases)(
    "$sceneId seed=$seed harness=$harnessName has an explainable terminal result",
    ({ scene, seed, harness }) => {
      const simulation = runToEnd(scene, seed, harness);
      const snapshot = simulation.snapshot();
      const declaredOutcomeIds = scene.transitions.map(({ outcomeId }) => outcomeId);
      const result = snapshot.result;
      const outcome = simulation.replay().at(-1);

      expect(snapshot.elapsedMs).toBe(scene.encounterParameters.durationMs);
      expect(snapshot.status).not.toBe("running");
      expect(declaredOutcomeIds).toContain(snapshot.outcomeId);
      expect(result).toMatchObject({ status: snapshot.status, outcomeId: snapshot.outcomeId });
      expect(result?.objectiveFacts.length).toBeGreaterThan(0);
      expect(result?.objectiveFacts.every(({ targetId }) => targetId.length > 0)).toBe(true);
      const requiredObjectiveIds = new Set(
        scene.objectives.filter(({ required }) => required).map(({ id }) => id),
      );
      const failedFactIds = result?.objectiveFacts
        .filter(({ passed, objectiveId }) =>
          !passed && (objectiveId === null || requiredObjectiveIds.has(objectiveId)))
        .map(({ id }) => id);
      expect(result?.failureCauses.map(({ factId }) => factId)).toEqual(failedFactIds);
      if (snapshot.status === "retry") {
        expect(result?.failureCauses.length).toBeGreaterThan(0);
      } else {
        expect(result?.failureCauses).toEqual([]);
      }
      expect(outcome).toMatchObject({
        kind: "outcome",
        timeMs: scene.encounterParameters.durationMs,
        data: {
          objectiveFactIds: result?.objectiveFacts.map(({ id }) => id),
          failureCauses: result?.failureCauses.map(({ code }) => code),
        },
      });
      expect(outcome?.data.causalActorIds).toBeInstanceOf(Array);
      expect(outcome?.data.causalTargetIds).toBeInstanceOf(Array);
      expect(outcome?.data.causalDecisionIds).toBeInstanceOf(Array);
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
    expect(() =>
      createOperationSimulation(scene, completeCampaign.officers, 1, BALANCED_HARNESS, [
        { officerId: completeCampaign.officers[0]!.id, level: 3 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      createOperationSimulation(scene, completeCampaign.officers, 1, BALANCED_HARNESS, [
        { officerId: "missing", level: 1 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      createOperationSimulation(scene, completeCampaign.officers, 1, BALANCED_HARNESS, [
        { officerId: completeCampaign.officers[0]!.id, level: 1 },
        { officerId: completeCampaign.officers[0]!.id, level: 2 },
      ]),
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
