import type {
  OfficerLesson,
  OperationLaunch,
  OperationResult,
} from "../campaign/campaignRun";
import {
  createAutonomousBattleSimulation,
  type AutonomousBattleDefinition,
  type AutonomousBattleHarnessPolicies,
  type AutonomousBattleIntervention,
  type AutonomousBattleInterventionResult,
  type AutonomousBattleSimulationFactory,
  type AutonomousBattleSnapshot,
} from "../domain/operation/operationEngine";

export type AutonomousCampaignOperation = Readonly<{
  read: () => AutonomousBattleSnapshot;
  advance: (deltaMs: number) => AutonomousBattleSnapshot;
  intervene: (
    intervention: AutonomousBattleIntervention,
  ) => AutonomousBattleInterventionResult;
  result: () => OperationResult;
}>;

export type AutonomousCampaignOperationFactory = (
  launch: OperationLaunch,
  harness: AutonomousBattleHarnessPolicies,
) => AutonomousCampaignOperation;

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function assertBattle(
  snapshot: AutonomousBattleSnapshot,
  battleId: string,
): AutonomousBattleSnapshot {
  if (snapshot.battleId !== battleId) {
    throw new RangeError(
      `Autonomous operation snapshot "${snapshot.battleId}" does not belong to battle "${battleId}".`,
    );
  }
  return snapshot;
}

function lessonChoices(launch: OperationLaunch): OfficerLesson[] {
  return launch.officers.map(({ id: officerId }) => ({
    id: `${launch.scene.identity.id}:${officerId}:lesson`,
    officerId,
    summary: launch.scene.copy.lesson,
  }));
}

/**
 * Binds campaign-neutral autonomous content to a simulation Adapter.
 *
 * Application callers learn one deep Interface while app composition remains
 * responsible for choosing the content definition and production Adapter.
 */
export function createAutonomousCampaignOperationFactory(
  suppliedDefinition: AutonomousBattleDefinition,
  simulationFactory: AutonomousBattleSimulationFactory,
): AutonomousCampaignOperationFactory {
  const definition = clone(suppliedDefinition);

  return (suppliedLaunch, suppliedHarness) => {
    const launch = clone(suppliedLaunch);
    const harness = clone(suppliedHarness);
    const simulation = simulationFactory(clone(definition), {
      seed: launch.seed,
      harness,
      interventionBudget: launch.scene.gameplayTuning.interventionBudget,
    });

    const read = (): AutonomousBattleSnapshot =>
      assertBattle(simulation.snapshot(), definition.id);

    return {
      read,
      advance(deltaMs) {
        return assertBattle(simulation.advance(deltaMs), definition.id);
      },
      intervene(intervention) {
        const result = simulation.intervene(intervention);
        assertBattle(result.snapshot, definition.id);
        return result;
      },
      result() {
        const snapshot = read();
        if (snapshot.resolution.state === "running") {
          throw new RangeError(
            "An autonomous campaign result is only available after the operation resolves.",
          );
        }

        return {
          sceneId: launch.scene.identity.id,
          status: snapshot.resolution.disposition === "success" ? "success" : "retry",
          outcomeId: snapshot.resolution.outcomeId,
          lessonChoices: snapshot.resolution.disposition === "success"
            ? lessonChoices(launch)
            : [],
        };
      },
    };
  };
}

/** Production Adapter binder; app composition still supplies the content. */
export function createProductionAutonomousCampaignOperationFactory(
  definition: AutonomousBattleDefinition,
): AutonomousCampaignOperationFactory {
  return createAutonomousCampaignOperationFactory(
    definition,
    createAutonomousBattleSimulation,
  );
}
