import { describe, expect, it } from "vitest";

import { createSeededRandom, deriveRandomStreamSeed } from "../../../../src/simulation/seededRandom";
import { OFFICER_ACTION_KINDS } from "../../../../src/domain/operation/internal/agent/actions";
import { createBoundedMemory } from "../../../../src/domain/operation/internal/agent/memory";
import { createOfficerMind } from "../../../../src/domain/operation/internal/agent/officerMind";
import { defaultAgentProfile, perceive } from "../../../../src/domain/operation/internal/agent/perception";

const context = {
  objectiveId: "objective-a",
  positionId: "8,4",
  fallbackAreaId: "fallback-center",
  supportOfficerId: "officer-b",
  normalizedDistance: 0.7,
  risk: 0.35,
  memoryPressure: 0,
  signalLoad: 0.2,
} as const;

describe("OfficerMind utility decisions", () => {
  it("turns a perception into a trace and a one-to-three-second commitment", () => {
    const profile = defaultAgentProfile("action");
    const perception = perceive({
      observation: { observedAtMs: 0, facts: [] },
      receivedReports: [],
      profile,
      memory: createBoundedMemory(profile.memoryCapacity),
      nowMs: 0,
    });
    const mind = createOfficerMind(
      "officer-a",
      profile,
      createSeededRandom(deriveRandomStreamSeed("run-17", "officer:officer-a:decision")),
    );

    const commitment = mind.consider({
      perception,
      context,
      nowMs: 0,
      currentCommitment: null,
    });
    if (!commitment) throw new Error("OfficerMind did not create its initial commitment.");

    expect(OFFICER_ACTION_KINDS).toEqual([
      "move", "investigate", "defend", "verify", "broadcast", "support", "retreat",
    ]);
    expect(commitment.trace.selectedAction.target.id).toBeTruthy();
    expect(commitment.trace.topReason).toBeTruthy();
    expect(commitment.trace.abandonedAlternative.action.kind)
      .not.toBe(commitment.trace.selectedAction.kind);
    expect(commitment.endsAtMs - commitment.startedAtMs).toBeGreaterThanOrEqual(1_000);
    expect(commitment.endsAtMs - commitment.startedAtMs).toBeLessThanOrEqual(3_000);
    expect(mind.consider({
      perception,
      context,
      nowMs: commitment.endsAtMs - 1,
      currentCommitment: commitment,
    })).toBeNull();
  });

  it("uses deterministic actor-specific streams and individual cadences", () => {
    const profile = defaultAgentProfile("communication");
    const create = (actorId: string) => createOfficerMind(
      actorId,
      profile,
      createSeededRandom(deriveRandomStreamSeed("same-run", `officer:${actorId}:decision`)),
    );
    const first = create("officer-a");
    const replayed = create("officer-a");
    const peer = create("officer-b");

    expect(replayed.cadenceMs).toBe(first.cadenceMs);
    expect(peer.cadenceMs).not.toBe(first.cadenceMs);
  });
});
