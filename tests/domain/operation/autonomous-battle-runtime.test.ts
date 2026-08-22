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
  },
  variability: { decisionNoise: 0.25, executionNoise: 0.25 },
  ...overrides,
});

const definition = (
  actors = [actor("friendly-1"), actor("friendly-2")],
): AutonomousBattleDefinition => ({
  id: "runtime-contract-battle",
  durationMs: 2_000,
  playerControlledSideId: "friendly",
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
  objectives: [{
    id: "hold",
    label: "작전 의도 유지",
    required: true,
    measurement: "controlled-readiness",
    criterion: { comparator: "at-least", required: 0.5 },
  }],
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
  interventionBudget: 4,
});

const createRuntime = (
  suppliedDefinition: AutonomousBattleDefinition,
  seed: string | number,
  harness: AutonomousBattleHarnessPolicies = balancedHarness,
  interventionBudget = 4,
) => createAutonomousBattleSimulation(suppliedDefinition, {
  seed,
  harness,
  interventionBudget,
});

const actorTrace = (snapshot: AutonomousBattleSnapshot, actorId: string) => {
  const found = snapshot.formations.flatMap(({ actors }) => actors).find(({ id }) => id === actorId);
  if (!found) throw new Error(`Missing test actor ${actorId}.`);
  return {
    condition: found.condition,
    selectedBehaviorId: found.latestDecision?.action.behaviorId ?? null,
    decisionConfidence: found.latestDecision?.action.confidence ?? 0,
    feedbackSource: found.latestDecision?.feedback.source ?? "none",
    feedbackState: found.latestDecision?.feedback.state ?? "missing",
  };
};

const objectiveObserved = (snapshot: AutonomousBattleSnapshot, objectiveId: string): number => {
  const evidence = snapshot.objectives.find(({ id }) => id === objectiveId)?.evidence[0];
  if (!evidence || evidence.kind !== "number") {
    throw new Error(`Missing numeric evidence for ${objectiveId}.`);
  }
  return evidence.observed;
};

describe("autonomous battle headless runtime", () => {
  it("rejects hostile formation intervention atomically", () => {
    const simulation = createRuntime(definition(), "hostile-intervention");
    const before = simulation.snapshot();
    const result = simulation.intervene({
      kind: "set-formation-intent",
      formationId: "hostile-main",
      intentId: "retreat",
    });

    expect(result.receipt).toMatchObject({
      status: "rejected",
      reason: "formation-not-controllable",
      cost: 0,
      affectedFormationIds: ["hostile-main"],
    });
    expect(result.snapshot).toEqual(before);
    expect(simulation.snapshot()).toEqual(before);
  });

  it("produces distinct side-aware objective facts from authored measurements", () => {
    const objectives: AutonomousBattleDefinition["objectives"] = [
      {
        id: "delay",
        label: "적 압력에 맞선 지연",
        required: true,
        measurement: "contested-delay",
        criterion: { comparator: "at-least", required: 0.45 },
      },
      {
        id: "readiness",
        label: "아군 준비도",
        required: true,
        measurement: "controlled-readiness",
        criterion: { comparator: "at-least", required: 0.55 },
      },
      {
        id: "preservation",
        label: "아군 전투력 보존",
        required: true,
        measurement: "controlled-effective-preservation",
        criterion: { comparator: "at-least", required: 0.7 },
      },
    ];
    const strongHostile = definition();
    const weakHostile = structuredClone(strongHostile);
    const weakActors = weakHostile.formations.find(({ id }) => id === "hostile-main")!
      .actors as AutonomousBattleActorDefinition[];
    weakActors.forEach((hostile) => {
      (hostile.profile as { initiative: number; discipline: number; cooperation: number })
        .initiative = 0;
      (hostile.profile as { initiative: number; discipline: number; cooperation: number })
        .discipline = 0;
      (hostile.profile as { initiative: number; discipline: number; cooperation: number })
        .cooperation = 0;
      (hostile.variability as { decisionNoise: number; executionNoise: number }).decisionNoise = 1;
      (hostile.variability as { decisionNoise: number; executionNoise: number }).executionNoise = 1;
    });
    const authoredStrong = { ...strongHostile, objectives };
    const authoredWeak = { ...weakHostile, objectives };
    const strong = createRuntime(authoredStrong, "side-aware", balancedHarness).advance(2_000);
    const weak = createRuntime(authoredWeak, "side-aware", balancedHarness).advance(2_000);
    const facts = objectives.map(({ id }) => objectiveObserved(strong, id));

    expect(new Set(facts).size).toBe(3);
    expect(objectiveObserved(strong, "delay"))
      .toBeLessThan(objectiveObserved(weak, "delay"));
  });

  it("makes a limited formation intervention observable in later objective facts", () => {
    const baseline = createRuntime(definition(), "coordination-effect");
    const intervened = createRuntime(definition(), "coordination-effect");
    const receipt = intervened.intervene({
      kind: "issue-guidance",
      guidanceId: "verify-and-coordinate",
      recipientFormationIds: ["friendly-forward"],
    }).receipt;
    const baselineTerminal = baseline.advance(2_000);
    const intervenedTerminal = intervened.advance(2_000);

    expect(receipt.status).toBe("accepted");
    expect(objectiveObserved(intervenedTerminal, "hold"))
      .toBeGreaterThan(objectiveObserved(baselineTerminal, "hold"));
  });

  it("is invariant to advance-call segmentation across accumulated fixed steps", () => {
    const single = createRuntime(definition(), "segmentation");
    const segmented = createRuntime(definition(), "segmentation");

    single.advance(2_000);
    [125, 250, 375, 500, 750].forEach((deltaMs) => segmented.advance(deltaMs));

    expect(segmented.snapshot()).toEqual(single.snapshot());
  });

  it("isolates each actor random stream from other authored actor collections", () => {
    const alone = createRuntime(
      definition([actor("stable-actor")]),
      "actor-stream",
    );
    const withPeers = createRuntime(
      definition([actor("stable-actor"), actor("new-peer-a"), actor("new-peer-b")]),
      "actor-stream",
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
      const simulation = createRuntime(definition(), seed, harness);
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

  it("keeps the five stage draw order stable across harness comparisons", () => {
    const low = createRuntime(definition(), "stable-stage-draws", {
      informationReach: 0,
      authorityClarity: 0,
      verificationDepth: 0,
      feedbackCompression: 0,
    });
    const high = createRuntime(definition(), "stable-stage-draws", {
      informationReach: 1,
      authorityClarity: 1,
      verificationDepth: 1,
      feedbackCompression: 1,
    });

    [250, 250, 500, 250].forEach((deltaMs) => {
      const lowConditions = low.advance(deltaMs).formations.flatMap(({ actors }) =>
        actors.map(({ id, condition }) => ({ id, condition })),
      );
      const highConditions = high.advance(deltaMs).formations.flatMap(({ actors }) =>
        actors.map(({ id, condition }) => ({ id, condition })),
      );
      expect(highConditions).toEqual(lowConditions);
    });
  });

  it("feeds an actor's prior autonomous action result into its next decision without intervention", () => {
    const traces = (feedbackCompression: number) => Array.from({ length: 32 }, (_, seed) => {
      const simulation = createRuntime(definition(), seed, {
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
      },
      variability: { decisionNoise: 1, executionNoise: 1 },
    });
    const snapshots = Array.from({ length: 32 }, (_, seed) => {
      const simulation = createRuntime(definition([steady, volatile]), seed);
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
    expect(() => createRuntime(invalid, "duplicate"))
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

    expect(() => createRuntime(definition(), "missing-harness", missing))
      .toThrow(/must define exactly/);
    expect(() => createRuntime(definition(), "additional-harness", additional))
      .toThrow(/must define exactly/);
  });
});
