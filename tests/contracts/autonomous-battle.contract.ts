import { describe, expect, it } from "vitest";
import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleObjectiveEvidence,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../../src/domain/operation/autonomousBattle";

export interface AutonomousBattleContractFixture {
  readonly definition: AutonomousBattleDefinition;
  readonly harness: AutonomousBattleHarnessPolicies;
  readonly interventionBudget: number;
}

const ratio = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

function evidenceSatisfied(evidence: AutonomousBattleObjectiveEvidence): boolean {
  if (evidence.kind === "number") {
    if (evidence.comparator === "at-least") return evidence.observed >= evidence.required;
    if (evidence.comparator === "at-most") return evidence.observed <= evidence.required;
    return evidence.observed === evidence.required;
  }
  if (evidence.kind === "boolean") return evidence.observed === evidence.required;
  return evidence.comparator === "equal"
    ? evidence.observed === evidence.required
    : evidence.observed !== evidence.required;
}

function traces(snapshot: AutonomousBattleSnapshot) {
  return snapshot.formations.flatMap(({ actors }) =>
    actors.flatMap(({ latestDecision }) => latestDecision === null ? [] : [latestDecision]),
  );
}

/** Shared behavioral checks for the test Adapter and every production implementation. */
export function runAutonomousBattleContract(
  adapterName: string,
  createSimulation: AutonomousBattleSimulationFactory,
  fixture: AutonomousBattleContractFixture,
): void {
  const create = (
    seed: string | number,
    interventionBudget = fixture.interventionBudget,
    definition = fixture.definition,
    harness = fixture.harness,
  ) => createSimulation(definition, { seed, harness, interventionBudget });

  describe(`${adapterName} autonomous battle contract`, () => {
    it("preserves arbitrary asymmetric formations and authored actor identity", () => {
      const snapshot = create("contract-shape").snapshot();

      expect(snapshot.formations.map(({ id }) => id)).toEqual(
        fixture.definition.formations.map(({ id }) => id),
      );
      expect(snapshot.formations.map(({ actors }) => actors.length)).toEqual(
        fixture.definition.formations.map(({ actors }) => actors.length),
      );
      snapshot.formations.forEach((formation, formationIndex) => {
        const authored = fixture.definition.formations[formationIndex]!;
        expect(formation.label).toBe(authored.label);
        expect(formation.controllable).toBe(
          authored.sideId === fixture.definition.playerControlledSideId,
        );
        formation.actors.forEach((actor, actorIndex) => {
          expect(actor).toMatchObject({
            id: authored.actors[actorIndex]!.id,
            label: authored.actors[actorIndex]!.label,
            role: authored.actors[actorIndex]!.role,
            profile: authored.actors[actorIndex]!.profile,
            variability: authored.actors[actorIndex]!.variability,
            condition: "effective",
            latestDecision: null,
          });
        });
      });
    });

    it("exposes one named five-stage trace with ordered time and semantic references", () => {
      const simulation = create("contract-trace");
      const first = simulation.advance(1_000);
      const firstTraces = traces(first);
      expect(firstTraces.length).toBeGreaterThan(0);

      firstTraces.forEach((trace) => {
        const times = [
          trace.startedAtMs,
          trace.information.atMs,
          trace.verification.atMs,
          trace.authority.atMs,
          trace.action.atMs,
          trace.feedback.atMs,
          trace.completedAtMs,
        ];
        expect(times).toEqual([...times].sort((left, right) => left - right));
        expect(trace.verification.observationId).toBe(trace.information.observationId);
        expect(["none", "prior-action"]).toContain(trace.feedback.source);
        if (trace.feedback.source === "none") expect(trace.feedback.state).toBe("missing");
        [
          trace.information.confidence,
          trace.verification.confidence,
          trace.authority.confidence,
          trace.action.confidence,
          trace.feedback.confidence,
        ].forEach((confidence) => expect(ratio(confidence)).toBe(true));
      });

      const firstIds = new Map(firstTraces.map((trace) => [trace.actorId, trace.id]));
      traces(simulation.advance(1_000)).forEach((trace) => {
        expect(trace.id).not.toBe(firstIds.get(trace.actorId));
        expect(["none", "prior-action"]).toContain(trace.feedback.source);
      });
    });

    it("owns harness policies, consequences, objective state, and typed scalar evidence", () => {
      const weakHarness: AutonomousBattleHarnessPolicies = {
        informationReach: 0.2,
        authorityClarity: 0.2,
        verificationDepth: 0.2,
        feedbackCompression: 0.2,
      };
      const snapshot = create("contract-state", fixture.interventionBudget, fixture.definition, weakHarness)
        .advance(1_000);

      expect(snapshot.harness.policies).toEqual(weakHarness);
      expect(snapshot.harness.consequences.length).toBeGreaterThan(0);
      snapshot.harness.consequences.forEach(({ severity }) => expect(ratio(severity)).toBe(true));
      snapshot.objectives.forEach((objective) => {
        expect(ratio(objective.progress)).toBe(true);
        expect(objective.evidence.length).toBeGreaterThan(0);
        objective.evidence.forEach((evidence) => {
          expect(evidence.label.length).toBeGreaterThan(0);
          if (evidence.kind === "number") {
            expect(["ratio", "count", "milliseconds", "score"]).toContain(evidence.unit);
          }
          expect(evidence.satisfied).toBe(evidenceSatisfied(evidence));
        });
      });
    });

    it("returns an accepted intervention receipt atomically with its snapshot", () => {
      const simulation = create("contract-intervention");
      const formation = fixture.definition.formations[0]!;
      const before = simulation.snapshot();
      const result = simulation.intervene({
        kind: "set-formation-intent",
        formationId: formation.id,
        intentId: "contract-intent",
      });

      expect(result.receipt.status).toBe("accepted");
      expect(result.snapshot).toEqual(simulation.snapshot());
      expect(result.snapshot.formations.find(({ id }) => id === formation.id)?.intentId)
        .toBe("contract-intent");
      expect(result.snapshot.interventionBudget).toMatchObject({
        spent: before.interventionBudget.spent + 1,
        remaining: before.interventionBudget.remaining - 1,
        count: before.interventionBudget.count + 1,
      });
      if (result.receipt.status === "accepted") {
        expect(result.snapshot.recentEvents.items).toContainEqual(expect.objectContaining({
          kind: "intervention-applied",
          receiptId: result.receipt.id,
        }));
      }
    });

    it("rejects insufficient budget and resolved operations without changing the snapshot", () => {
      const noBudget = create("contract-no-budget", 0);
      const formationId = fixture.definition.formations[0]!.id;
      const beforeBudget = noBudget.snapshot();
      const budgetResult = noBudget.intervene({
        kind: "set-formation-intent",
        formationId,
        intentId: "hold",
      });
      expect(budgetResult.receipt).toMatchObject({
        status: "rejected",
        reason: "insufficient-budget",
        cost: 0,
      });
      expect(budgetResult.snapshot).toEqual(beforeBudget);
      expect(noBudget.snapshot()).toEqual(beforeBudget);

      const resolved = create("contract-resolved");
      resolved.advance(fixture.definition.durationMs);
      const beforeResolved = resolved.snapshot();
      const resolvedResult = resolved.intervene({
        kind: "set-formation-intent",
        formationId,
        intentId: "hold",
      });
      expect(resolvedResult.receipt).toMatchObject({
        status: "rejected",
        reason: "operation-resolved",
        cost: 0,
      });
      expect(resolvedResult.snapshot).toEqual(beforeResolved);
      expect(resolved.snapshot()).toEqual(beforeResolved);
    });

    it("rejects intervention against a non-controllable formation atomically", () => {
      const simulation = create("contract-owned-side");
      const hostile = fixture.definition.formations.find(
        ({ sideId }) => sideId !== fixture.definition.playerControlledSideId,
      );
      if (!hostile) throw new Error("The contract fixture needs a non-controllable formation.");
      const before = simulation.snapshot();
      const result = simulation.intervene({
        kind: "set-formation-intent",
        formationId: hostile.id,
        intentId: "contract-hostile-intent",
      });

      expect(result.receipt).toMatchObject({
        status: "rejected",
        reason: "formation-not-controllable",
        cost: 0,
        affectedFormationIds: [hostile.id],
      });
      expect(result.snapshot).toEqual(before);
      expect(simulation.snapshot()).toEqual(before);
    });

    it("validates all targets before an atomic formation-level intervention", () => {
      const simulation = create("contract-atomic-guidance");
      const before = simulation.snapshot();
      expect(() => simulation.intervene({
        kind: "issue-guidance",
        guidanceId: "verify-first",
        recipientFormationIds: [fixture.definition.formations[0]!.id, "missing-formation"],
      })).toThrow(RangeError);
      expect(simulation.snapshot()).toEqual(before);

      const noBudget = create("contract-invalid-before-budget", 0);
      expect(() => noBudget.intervene({
        kind: "set-formation-intent",
        formationId: "missing-formation",
        intentId: "hold",
      })).toThrow(RangeError);
    });

    it("uses a discriminated resolution and resolves objective evidence consistently", () => {
      const simulation = create("contract-resolution");
      expect(simulation.snapshot().resolution).toEqual({ state: "running" });
      const terminal = simulation.advance(fixture.definition.durationMs);
      expect(terminal.resolution.state).toBe("resolved");
      if (terminal.resolution.state === "resolved") {
        expect(terminal.resolution.outcomeId.length).toBeGreaterThan(0);
        expect(["success", "failure"]).toContain(terminal.resolution.disposition);
        expect(terminal.resolution.resolvedAtMs).toBe(terminal.elapsedMs);
      }
      terminal.objectives.forEach((objective) => {
        expect(objective.state).not.toBe("active");
        objective.evidence.forEach((evidence) => {
          expect(evidence.satisfied).toBe(evidenceSatisfied(evidence));
        });
      });
    });

    it("keeps recent events bounded, ordered, and inside the closed event union", () => {
      const simulation = create("contract-events");
      for (let index = 0; index < 20; index += 1) simulation.advance(100);
      const { recentEvents } = simulation.snapshot();
      const kinds = new Set([
        "formation-activated",
        "formation-intent-changed",
        "actor-decision",
        "actor-condition-changed",
        "objective-state-changed",
        "harness-consequence",
        "intervention-applied",
        "operation-resolved",
      ]);

      expect(recentEvents.capacity).toBeGreaterThan(0);
      expect(recentEvents.items.length).toBeLessThanOrEqual(recentEvents.capacity);
      expect(recentEvents.items.every(({ kind }) => kinds.has(kind))).toBe(true);
      const sequences = recentEvents.items.map(({ sequence }) => sequence);
      expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
      expect(recentEvents.firstSequence).toBe(sequences[0] ?? recentEvents.nextSequence);
      expect(recentEvents.nextSequence).toBeGreaterThan(sequences.at(-1) ?? -1);
    });

    it("isolates supplied inputs, snapshots, atomic results, and receipts", () => {
      const mutableDefinition = structuredClone(fixture.definition);
      const mutableHarness = structuredClone(fixture.harness);
      const simulation = createSimulation(mutableDefinition, {
        seed: "contract-isolation",
        harness: mutableHarness,
        interventionBudget: fixture.interventionBudget,
      });
      (mutableDefinition as unknown as { formations: Array<{ label: string }> })
        .formations[0]!.label = "mutated input";
      (mutableHarness as { informationReach: number }).informationReach = 0;
      const result = simulation.intervene({
        kind: "set-formation-intent",
        formationId: fixture.definition.formations[0]!.id,
        intentId: "isolation-intent",
      });
      const returned = result.snapshot as unknown as {
        formations: Array<{ label: string; actors: Array<{ label: string }> }>;
      };
      returned.formations[0]!.label = "mutated snapshot";
      returned.formations[0]!.actors[0]!.label = "mutated actor";
      (result.receipt.affectedFormationIds as string[])[0] = "mutated receipt";

      const reread = simulation.snapshot();
      expect(reread.formations[0]!.label).toBe(fixture.definition.formations[0]!.label);
      expect(reread.formations[0]!.actors[0]!.label)
        .toBe(fixture.definition.formations[0]!.actors[0]!.label);
      expect(reread.harness.policies).toEqual(fixture.harness);
      expect(reread.recentEvents.items).not.toContainEqual(expect.objectContaining({
        affectedFormationIds: ["mutated receipt"],
      }));
    });

    it("replays the same calls for one seed and varies actor traces across seeds", () => {
      const first = create("contract-seed");
      const second = create("contract-seed");
      first.advance(1_000);
      second.advance(1_000);
      first.intervene({
        kind: "set-formation-intent",
        formationId: fixture.definition.formations[0]!.id,
        intentId: "hold",
      });
      second.intervene({
        kind: "set-formation-intent",
        formationId: fixture.definition.formations[0]!.id,
        intentId: "hold",
      });
      expect(first.snapshot()).toEqual(second.snapshot());

      const different = create("contract-other-seed").advance(1_000);
      expect(traces(first.snapshot())).not.toEqual(traces(different));
    });

    it("rejects invalid time, seed, budget, ratio, and duplicate identities", () => {
      expect(() => create("contract-errors").advance(-1)).toThrow(RangeError);
      expect(() => createSimulation(fixture.definition, {
        seed: "",
        harness: fixture.harness,
        interventionBudget: fixture.interventionBudget,
      })).toThrow(TypeError);
      expect(() => createSimulation(fixture.definition, {
        seed: Number.MAX_SAFE_INTEGER + 1,
        harness: fixture.harness,
        interventionBudget: fixture.interventionBudget,
      })).toThrow(RangeError);
      expect(() => create("contract-budget", -1)).toThrow(RangeError);

      const invalidHarness = { ...fixture.harness, informationReach: 2 };
      expect(() => create(
        "contract-ratio",
        fixture.interventionBudget,
        fixture.definition,
        invalidHarness,
      )).toThrow(RangeError);

      const duplicate = structuredClone(fixture.definition);
      const mutableFormations = duplicate.formations as unknown as Array<{
        actors: Array<{ id: string }>;
      }>;
      mutableFormations[1]!.actors[0]!.id = mutableFormations[0]!.actors[0]!.id;
      expect(() => create("contract-duplicate", fixture.interventionBudget, duplicate))
        .toThrow(RangeError);
    });

    it("does not expose legacy state or implementation mechanics", () => {
      const snapshot = create("contract-hidden").advance(1_000);
      expect(snapshot).not.toHaveProperty("status");
      expect(snapshot).not.toHaveProperty("outcomeId");
      expect(snapshot).not.toHaveProperty("officers");
      expect(snapshot).not.toHaveProperty("messages");
      expect(snapshot).not.toHaveProperty("threats");
      expect(snapshot).not.toHaveProperty("units");
      expect(snapshot).not.toHaveProperty("replay");
      expect(JSON.stringify(snapshot)).not.toMatch(/randomRoll|randomSeed|queue|fullHistory/);
    });
  });
}
