import { describe, expect, it } from "vitest";
import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSimulationFactory,
} from "../../src/domain/operation/autonomousBattle";

export interface AutonomousBattleContractFixture {
  readonly definition: AutonomousBattleDefinition;
  readonly harness: AutonomousBattleHarnessPolicies;
}

/** Shared behavioral checks for mocks now and real autonomous-battle adapters later. */
export function runAutonomousBattleContract(
  adapterName: string,
  createSimulation: AutonomousBattleSimulationFactory,
  fixture: AutonomousBattleContractFixture,
): void {
  describe(`${adapterName} autonomous battle contract`, () => {
    it("preserves scenario-authored asymmetric formation and actor collections", () => {
      const snapshot = createSimulation(fixture.definition, "contract-shape", fixture.harness).snapshot();

      expect(snapshot.formations.map(({ id }) => id)).toEqual(
        fixture.definition.formations.map(({ id }) => id),
      );
      expect(snapshot.formations.map(({ actors }) => actors.length)).toEqual(
        fixture.definition.formations.map(({ actors }) => actors.length),
      );
      expect(snapshot.formations.flatMap(({ actors }) => actors.map(({ id }) => id))).toEqual(
        fixture.definition.formations.flatMap(({ actors }) => actors.map(({ id }) => id)),
      );
    });

    it("replays the same advances deterministically for the same seed", () => {
      const first = createSimulation(fixture.definition, "contract-seed", fixture.harness);
      const second = createSimulation(fixture.definition, "contract-seed", fixture.harness);

      first.advance(1_000);
      second.advance(1_000);
      first.advance(2_000);
      second.advance(2_000);

      expect(first.snapshot()).toEqual(second.snapshot());
    });

    it("returns snapshots through the boundary after formation-level interventions", () => {
      const simulation = createSimulation(fixture.definition, "contract-intervention", fixture.harness);
      const formation = fixture.definition.formations[0];
      if (!formation) throw new Error("The contract fixture needs at least one formation.");

      const snapshot = simulation.intervene({
        kind: "set-formation-intent",
        formationId: formation.id,
        intentId: "contract-intent",
      });

      expect(snapshot.formations.find(({ id }) => id === formation.id)?.intentId).toBe(
        "contract-intent",
      );
    });

    it("rejects invalid elapsed time and unknown formation interventions", () => {
      const simulation = createSimulation(fixture.definition, "contract-errors", fixture.harness);

      expect(() => simulation.advance(-1)).toThrow(RangeError);
      expect(() => simulation.intervene({
        kind: "set-formation-intent",
        formationId: "missing-formation",
        intentId: "hold",
      })).toThrow(RangeError);
    });

    it("isolates returned snapshots from subsequent reads", () => {
      const simulation = createSimulation(fixture.definition, "contract-snapshot", fixture.harness);
      const returned = simulation.advance(1_000);
      const formation = returned.formations[0];
      const actor = formation?.actors[0];
      if (!formation || !actor) throw new Error("The contract fixture needs at least one actor.");

      (formation as { intentId: string }).intentId = "mutated-outside-adapter";
      (actor as { decisionConfidence: number }).decisionConfidence = -1;

      const reread = simulation.snapshot();
      expect(reread.formations[0]?.intentId).not.toBe("mutated-outside-adapter");
      expect(reread.formations[0]?.actors[0]?.decisionConfidence).not.toBe(-1);
    });

    it("allows different seeds to produce different actor probability traces", () => {
      const first = createSimulation(fixture.definition, "contract-seed-a", fixture.harness);
      const second = createSimulation(fixture.definition, "contract-seed-b", fixture.harness);

      const firstSnapshot = first.advance(1_000);
      const secondSnapshot = second.advance(1_000);
      const trace = (snapshot: typeof firstSnapshot) => snapshot.formations.flatMap(
        ({ actors }) => actors.map(({ id, selectedBehaviorId, decisionConfidence }) => ({
          id,
          selectedBehaviorId,
          decisionConfidence,
        })),
      );

      expect(trace(firstSnapshot)).not.toEqual(trace(secondSnapshot));
    });
  });
}
