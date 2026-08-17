import type {
  OfficerLesson,
  OperationLaunch,
  OperationResult,
} from "../campaign/campaignRun";
import { createOperationSimulation } from "../domain/operation/operationEngine";
import type {
  HarnessConfiguration,
  OperationSimulation,
  OperationSnapshot,
} from "../simulation/simulationTypes";

export type CampaignOperation = Readonly<{
  simulation: OperationSimulation;
  result: () => OperationResult;
}>;

function lessonChoices(launch: OperationLaunch): OfficerLesson[] {
  return launch.officers.map(({ id: officerId }) => ({
    id: `${launch.scene.identity.id}:${officerId}:lesson`,
    officerId,
    summary: launch.scene.copy.lesson,
  }));
}

function terminalResult(
  launch: OperationLaunch,
  snapshot: OperationSnapshot,
): OperationResult {
  if (snapshot.status === "running" || snapshot.outcomeId === null) {
    throw new RangeError("An operation result is only available after the operation terminates.");
  }
  if (snapshot.sceneId !== launch.scene.identity.id) {
    throw new RangeError("The operation snapshot does not belong to its campaign launch.");
  }
  return {
    sceneId: snapshot.sceneId,
    status: snapshot.status,
    outcomeId: snapshot.outcomeId,
    lessonChoices: snapshot.status === "success" ? lessonChoices(launch) : [],
  };
}

export function createCampaignOperation(
  suppliedLaunch: OperationLaunch,
  harness: HarnessConfiguration,
): CampaignOperation {
  const launch = structuredClone(suppliedLaunch);
  const simulation = createOperationSimulation(
    launch.scene,
    launch.officers,
    launch.seed,
    harness,
    launch.memory.map(({ officerId, lessons }) => ({
      officerId,
      level: lessons.length,
    })),
  );
  return {
    simulation,
    result: () => terminalResult(launch, simulation.snapshot()),
  };
}
