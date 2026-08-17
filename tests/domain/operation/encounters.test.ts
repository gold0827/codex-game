import { describe, expect, it } from "vitest";
import type { AgentProfile, CampaignMapTopology } from "../../../src/campaign";
import { createEncounterSimulation } from "../../../src/domain/operation/internal/encounters";
import type {
  EncounterActorDefinition,
  EncounterDefinition,
} from "../../../src/domain/operation/internal/encounterTypes";

const topology: CampaignMapTopology = {
  width: 7,
  height: 5,
  blocked: [],
  terrain: [],
  spawns: [],
  destinations: [],
};

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  initiative: 0.5,
  caution: 0.5,
  discipline: 0.5,
  cooperation: 0.5,
  stressTolerance: 0.5,
  memoryCapacity: 4,
  sourceTrust: [],
  ...overrides,
});

const actor = (
  id: string,
  overrides: Partial<EncounterActorDefinition> = {},
): EncounterActorDefinition => ({
  id,
  team: id.startsWith("hostile") ? "hostile" : "officer",
  position: { x: 0, y: 0 },
  disposition: "action",
  profile: profile(),
  weapon: { range: 3, accuracy: 1, damage: 20, suppression: 0.8 },
  ...overrides,
});

const encounter = (
  actors: readonly EncounterActorDefinition[],
  overrides: Partial<EncounterDefinition> = {},
): EncounterDefinition => ({
  id: "headless-encounter",
  topology,
  cover: [],
  actors,
  ...overrides,
});

describe("spatial encounter runtime", () => {
  it("blocks attacks outside range or without line of sight", () => {
    const outsideRange = createEncounterSimulation(encounter([
      actor("officer", { position: { x: 0, y: 0 } }),
      actor("hostile", { position: { x: 6, y: 0 } }),
    ]), "range");
    const occluded = createEncounterSimulation(encounter([
      actor("officer", { position: { x: 0, y: 1 } }),
      actor("hostile", { position: { x: 2, y: 1 } }),
    ], {
      topology: { ...topology, blocked: [{ x: 1, y: 1 }] },
    }), "los");

    expect(outsideRange.execute({ kind: "attack", actorId: "officer", targetId: "hostile" })).toEqual([
      expect.objectContaining({ kind: "attack-blocked", reason: "out-of-range" }),
    ]);
    expect(occluded.execute({ kind: "attack", actorId: "officer", targetId: "hostile" })).toEqual([
      expect.objectContaining({ kind: "attack-blocked", reason: "no-line-of-sight" }),
    ]);
    expect(outsideRange.events().some(({ kind }) => kind === "unit-suppressed")).toBe(false);
    expect(occluded.events().some(({ kind }) => kind === "unit-suppressed")).toBe(false);
    expect(outsideRange.snapshot().actors.find(({ id }) => id === "hostile")?.health).toBe(100);
    expect(occluded.snapshot().actors.find(({ id }) => id === "hostile")?.health).toBe(100);
  });

  it("reduces suppression for an actor occupying cover", () => {
    const simulation = createEncounterSimulation(encounter([
      actor("officer", { position: { x: 1, y: 1 } }),
      actor("hostile", { position: { x: 2, y: 1 } }),
    ], { cover: [{ x: 2, y: 1 }] }), "cover");

    const events = simulation.execute({ kind: "attack", actorId: "officer", targetId: "hostile" });

    expect(events).toContainEqual(expect.objectContaining({
      kind: "unit-suppressed",
      actorId: "hostile",
      suppression: 0.44,
    }));
  });

  it.each([
    ["retreat", profile({ caution: 1, discipline: 0.8, cooperation: 0.1 }), "unit-retreated"],
    ["misidentification", profile({ caution: 0.1, discipline: 0, cooperation: 0.1 }), "target-misidentified"],
    ["ally following", profile({ caution: 0.1, discipline: 0.9, cooperation: 1 }), "ally-followed"],
  ] as const)("emits hit, suppression, and personality-driven %s events", (_case, targetProfile, reactionKind) => {
    const simulation = createEncounterSimulation(encounter([
      actor("hostile-attacker", { position: { x: 1, y: 1 } }),
      actor("officer-target", { position: { x: 2, y: 1 }, profile: targetProfile }),
      actor("officer-ally", { position: { x: 2, y: 3 } }),
    ]), `panic-${reactionKind}`);

    const events = simulation.execute({
      kind: "attack",
      actorId: "hostile-attacker",
      targetId: "officer-target",
    });

    expect(events.map(({ kind }) => kind)).toEqual(expect.arrayContaining([
      "unit-hit",
      "unit-suppressed",
      reactionKind,
    ]));
  });

  it("lets disciplined, stress-tolerant actors recover autonomously", () => {
    const simulation = createEncounterSimulation(encounter([
      actor("hostile-attacker", { position: { x: 1, y: 1 } }),
      actor("officer-target", {
        position: { x: 2, y: 1 },
        profile: profile({ caution: 1, discipline: 1, stressTolerance: 1 }),
      }),
    ]), "recover");
    simulation.execute({ kind: "attack", actorId: "hostile-attacker", targetId: "officer-target" });

    expect(simulation.advance(2_000)).toContainEqual(expect.objectContaining({
      kind: "panic-recovered",
      actorId: "officer-target",
    }));
    expect(simulation.snapshot().actors.find(({ id }) => id === "officer-target")?.panicReaction).toBeNull();
  });

  it("is reproducible for the same seed and invariant to advance segmentation", () => {
    const definition = encounter([
      actor("hostile-attacker", { position: { x: 1, y: 1 }, weapon: { range: 3, accuracy: 0.7, damage: 20, suppression: 0.8 } }),
      actor("officer-target", {
        position: { x: 2, y: 1 },
        profile: profile({ caution: 1, discipline: 1, stressTolerance: 1 }),
      }),
    ]);
    const single = createEncounterSimulation(definition, "stable-seed");
    const segmented = createEncounterSimulation(definition, "stable-seed");
    single.execute({ kind: "attack", actorId: "hostile-attacker", targetId: "officer-target" });
    segmented.execute({ kind: "attack", actorId: "hostile-attacker", targetId: "officer-target" });

    single.advance(2_000);
    Array.from({ length: 20 }).forEach(() => segmented.advance(100));

    expect(segmented.snapshot()).toEqual(single.snapshot());
    expect(segmented.events()).toEqual(single.events());
  });
});
