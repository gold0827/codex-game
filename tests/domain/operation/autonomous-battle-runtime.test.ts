import { describe, expect, it } from "vitest";
import type {
  AutonomousBattleActorDefinition,
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSnapshot,
} from "../../../src/domain/operation/autonomousBattle";
import { createAutonomousBattleSimulation } from "../../../src/domain/operation/operationEngine";
import { runAutonomousBattleContract } from "../../contracts/autonomous-battle.contract";

const actor = (
  id: string,
  overrides: Partial<AutonomousBattleActorDefinition> = {},
): AutonomousBattleActorDefinition => ({
  id,
  label: id,
  role: "test-role",
  profile: {
    initiative: 0.6,
    caution: 0.6,
    discipline: 0.6,
    cooperation: 0.6,
    stressTolerance: 0.6,
    memoryCapacity: 3,
    sourceTrust: [],
  },
  variability: { decisionNoise: 0.25, executionNoise: 0.25 },
  ...overrides,
});

const definition = (
  actors = [actor("friendly-1"), actor("friendly-2")],
): AutonomousBattleDefinition => ({
  id: "runtime-contract-battle",
  durationMs: 2_000,
  formations: [
    {
      id: "friendly-forward",
      label: "전방 편성",
      sideId: "friendly",
      initialLocationId: "forward",
      initialIntentId: "delay",
      entry: { kind: "present" },
      actors,
    },
    {
      id: "hostile-main",
      label: "적 주력",
      sideId: "hostile",
      initialLocationId: "approach",
      initialIntentId: "advance",
      entry: { kind: "present" },
      actors: [actor("hostile-1"), actor("hostile-2"), actor("hostile-3")],
    },
    {
      id: "friendly-reserve",
      label: "예비 편성",
      sideId: "friendly",
      initialLocationId: "rear",
      initialIntentId: "support",
      entry: { kind: "elapsed", atMs: 1_000 },
      actors: [actor("reserve-1")],
    },
  ],
  objectives: [{ id: "hold", label: "작전 의도 유지", required: true }],
});

const balancedHarness: AutonomousBattleHarnessPolicies = {
  informationReach: 0.6,
  authorityClarity: 0.6,
  verificationDepth: 0.6,
  feedbackCompression: 0.6,
};

runAutonomousBattleContract("headless runtime", createAutonomousBattleSimulation, {
  definition: definition(),
  harness: balancedHarness,
});

const actorTrace = (snapshot: AutonomousBattleSnapshot, actorId: string) => {
  const found = snapshot.formations.flatMap(({ actors }) => actors).find(({ id }) => id === actorId);
  if (!found) throw new Error(`Missing test actor ${actorId}.`);
  return {
    condition: found.condition,
    selectedBehaviorId: found.selectedBehaviorId,
    decisionConfidence: found.decisionConfidence,
  };
};

describe("autonomous battle headless runtime", () => {
  it("is invariant to advance-call segmentation across accumulated fixed steps", () => {
    const single = createAutonomousBattleSimulation(definition(), "segmentation", balancedHarness);
    const segmented = createAutonomousBattleSimulation(definition(), "segmentation", balancedHarness);

    single.advance(2_000);
    [125, 250, 375, 500, 750].forEach((deltaMs) => segmented.advance(deltaMs));

    expect(segmented.snapshot()).toEqual(single.snapshot());
  });

  it("isolates each actor random stream from other authored actor collections", () => {
    const alone = createAutonomousBattleSimulation(
      definition([actor("stable-actor")]),
      "actor-stream",
      balancedHarness,
    );
    const withPeers = createAutonomousBattleSimulation(
      definition([actor("stable-actor"), actor("new-peer-a"), actor("new-peer-b")]),
      "actor-stream",
      balancedHarness,
    );

    [250, 500, 250].forEach((deltaMs) => {
      expect(actorTrace(withPeers.advance(deltaMs), "stable-actor"))
        .toEqual(actorTrace(alone.advance(deltaMs), "stable-actor"));
    });
  });

  it("uses every harness policy inside observable actor decision stages", () => {
    const traces = (
      field: keyof AutonomousBattleHarnessPolicies,
      value: number,
    ) => Array.from({ length: 24 }, (_, seed) => {
      const harness = { ...balancedHarness, [field]: value };
      const simulation = createAutonomousBattleSimulation(definition(), seed, harness);
      simulation.intervene({
        kind: "issue-guidance",
        guidanceId: "test-guidance",
        recipientFormationIds: ["friendly-forward"],
      });
      simulation.advance(250);
      return actorTrace(simulation.advance(250), "friendly-1");
    });

    (["informationReach", "authorityClarity", "verificationDepth", "feedbackCompression"] as const)
      .forEach((field) => {
        expect(traces(field, 0), field).not.toEqual(traces(field, 1));
      });
  });

  it("feeds an actor's prior autonomous action result into its next decision without intervention", () => {
    const traces = (feedbackCompression: number) => Array.from({ length: 32 }, (_, seed) => {
      const simulation = createAutonomousBattleSimulation(definition(), seed, {
        informationReach: 1,
        authorityClarity: 1,
        verificationDepth: 1,
        feedbackCompression,
      });
      simulation.advance(250);
      return actorTrace(simulation.advance(250), "friendly-1");
    });

    const withoutFeedback = traces(0);
    const compressedFeedback = traces(1);
    expect(compressedFeedback).not.toEqual(withoutFeedback);
    expect(compressedFeedback.some(({ selectedBehaviorId }) => selectedBehaviorId === "feedback-repeat"))
      .toBe(true);
  });

  it("lets authored profile and execution variability affect autonomous decisions", () => {
    const steady = actor("steady", {
      profile: {
        initiative: 1,
        caution: 1,
        discipline: 1,
        cooperation: 1,
        stressTolerance: 1,
        memoryCapacity: 4,
        sourceTrust: [],
      },
      variability: { decisionNoise: 0, executionNoise: 0 },
    });
    const volatile = actor("volatile", {
      profile: {
        initiative: 0,
        caution: 0,
        discipline: 0,
        cooperation: 0,
        stressTolerance: 0,
        memoryCapacity: 0,
        sourceTrust: [],
      },
      variability: { decisionNoise: 1, executionNoise: 1 },
    });
    const snapshots = Array.from({ length: 32 }, (_, seed) => {
      const simulation = createAutonomousBattleSimulation(definition([steady, volatile]), seed, balancedHarness);
      return simulation.advance(250);
    });

    expect(snapshots.every((snapshot) => actorTrace(snapshot, "steady").condition === "effective")).toBe(true);
    expect(snapshots.some((snapshot) => actorTrace(snapshot, "volatile").condition === "suppressed")).toBe(true);
    expect(snapshots.some((snapshot) =>
      actorTrace(snapshot, "steady").decisionConfidence !==
      actorTrace(snapshot, "volatile").decisionConfidence,
    )).toBe(true);
  });

  it("rejects duplicate global actor identities before creating derived streams", () => {
    const invalid = definition([actor("hostile-1")]);
    expect(() => createAutonomousBattleSimulation(invalid, "duplicate", balancedHarness))
      .toThrow(/globally unique/);
  });

  it("requires exactly the four autonomous harness policy axes", () => {
    const missing = {
      informationReach: 0.5,
      authorityClarity: 0.5,
      verificationDepth: 0.5,
    } as unknown as AutonomousBattleHarnessPolicies;
    const additional = {
      ...balancedHarness,
      directOutcomeBonus: 1,
    } as unknown as AutonomousBattleHarnessPolicies;

    expect(() => createAutonomousBattleSimulation(definition(), "missing-harness", missing))
      .toThrow(/must define exactly/);
    expect(() => createAutonomousBattleSimulation(definition(), "additional-harness", additional))
      .toThrow(/must define exactly/);
  });
});
