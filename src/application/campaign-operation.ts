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

export const DEFAULT_HARNESS: AutonomousBattleHarnessPolicies = Object.freeze({
  informationReach: 0.68,
  authorityClarity: 0.72,
  verificationDepth: 0.68,
  feedbackCompression: 0.7,
});

export type CampaignOperation = Readonly<{
  read: () => AutonomousBattleSnapshot;
  advance: (deltaMs: number) => AutonomousBattleSnapshot;
  intervene: (
    intervention: AutonomousBattleIntervention,
  ) => AutonomousBattleInterventionResult;
  result: () => OperationResult;
}>;

export type CampaignOperationFactory = (
  launch: OperationLaunch,
  harness: AutonomousBattleHarnessPolicies,
) => CampaignOperation;

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

export function createCampaignOperationFactory(
  suppliedDefinition: AutonomousBattleDefinition,
  simulationFactory: AutonomousBattleSimulationFactory,
): CampaignOperationFactory {
  const definition = clone(suppliedDefinition);

  return (suppliedLaunch, suppliedHarness) => {
    const launch = clone(suppliedLaunch);
    const simulation = simulationFactory(clone(definition), {
      seed: launch.seed,
      harness: clone(suppliedHarness),
      interventionBudget: launch.scene.gameplayTuning.interventionBudget,
    });
    const read = (): AutonomousBattleSnapshot =>
      assertBattle(simulation.snapshot(), definition.id);

    return {
      read,
      advance: (deltaMs) => assertBattle(simulation.advance(deltaMs), definition.id),
      intervene: (intervention) => {
        const result = simulation.intervene(intervention);
        assertBattle(result.snapshot, definition.id);
        return result;
      },
      result: () => {
        const snapshot = read();
        if (snapshot.resolution.state === "running") {
          throw new RangeError(
            "A campaign operation result is only available after the operation resolves.",
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

export function createProductionCampaignOperationFactory(
  definition: AutonomousBattleDefinition,
): CampaignOperationFactory {
  return createCampaignOperationFactory(definition, createAutonomousBattleSimulation);
}
