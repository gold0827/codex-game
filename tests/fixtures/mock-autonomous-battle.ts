import type {
  AutonomousBattleFormationSnapshot,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../../src/domain/operation/autonomousBattle";
import { createSeededRandom, deriveRandomStreamSeed } from "../../src/simulation/seededRandom";

/** Test-only adapter. Its arbitrary behavior is intentionally not a gameplay proposal. */
export const createMockAutonomousBattle: AutonomousBattleSimulationFactory = (
  suppliedDefinition,
  seed,
  suppliedHarness,
) => {
  const ownedInput = structuredClone({
    definition: suppliedDefinition,
    harness: suppliedHarness,
  });
  const definition = ownedInput.definition;
  // The mock retains an isolated harness input only to exercise adapter wiring.
  void ownedInput.harness;
  let elapsedMs = 0;
  const formations: Array<{
    id: string;
    sideId: string;
    activeAtMs: number;
    locationId: string;
    intentId: string;
    actors: Array<{
      id: string;
      selectedBehaviorId: string | null;
      decisionConfidence: number;
    }>;
  }> = definition.formations.map((formation) => ({
    id: formation.id,
    sideId: formation.sideId,
    activeAtMs: formation.entry.kind === "present" ? 0 : formation.entry.atMs,
    locationId: formation.initialLocationId,
    intentId: formation.initialIntentId,
    actors: formation.actors.map((actor) => ({
      id: actor.id,
      selectedBehaviorId: null,
      decisionConfidence: 0,
    })),
  }));
  const randomByActor = new Map(
    definition.formations.flatMap((formation) => formation.actors.map((actor) => [
      actor.id,
      createSeededRandom(deriveRandomStreamSeed(seed, `mock-autonomous-battle:${actor.id}`)),
    ] as const)),
  );

  const snapshot = (): AutonomousBattleSnapshot => ({
    battleId: definition.id,
    elapsedMs,
    durationMs: definition.durationMs,
    status: elapsedMs >= definition.durationMs ? "resolved" : "running",
    outcomeId: elapsedMs >= definition.durationMs ? "mock-resolved" : null,
    formations: formations.map((formation): AutonomousBattleFormationSnapshot => ({
      id: formation.id,
      sideId: formation.sideId,
      active: elapsedMs >= formation.activeAtMs,
      locationId: formation.locationId,
      intentId: formation.intentId,
      actors: formation.actors.map((actor) => ({
        id: actor.id,
        formationId: formation.id,
        condition: "effective",
        selectedBehaviorId: actor.selectedBehaviorId,
        decisionConfidence: actor.decisionConfidence,
      })),
    })),
    objectives: definition.objectives.map((objective) => ({
      id: objective.id,
      progress: 0,
      completed: false,
    })),
  });

  return {
    snapshot,
    advance(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError("Mock battle delta must be a non-negative finite number.");
      }
      elapsedMs = Math.min(definition.durationMs, elapsedMs + deltaMs);
      formations.forEach((formation) => formation.actors.forEach((actor) => {
        const random = randomByActor.get(actor.id);
        if (!random) throw new Error(`Mock random stream is missing for actor ${actor.id}.`);
        actor.selectedBehaviorId = random.next() < 0.5 ? "mock-hold" : "mock-move";
        actor.decisionConfidence = random.next();
      }));
      return snapshot();
    },
    intervene(intervention) {
      if (intervention.kind === "set-formation-intent") {
        const formation = formations.find(({ id }) => id === intervention.formationId);
        if (!formation) throw new RangeError(`Unknown mock formation ${intervention.formationId}.`);
        formation.intentId = intervention.intentId;
      }
      return snapshot();
    },
  };
};
