import type { CampaignDefinition, CampaignScene } from "./types";
import { assertValidCampaignDefinition } from "./validation";

export type CampaignProgressSnapshot = Readonly<{
  currentSceneId: string;
  completedSceneIds: readonly string[];
  completed: boolean;
}>;

export type CampaignProgress = Readonly<{
  definition: () => CampaignDefinition;
  currentScene: () => CampaignScene;
  snapshot: () => CampaignProgressSnapshot;
  recordOutcome: (outcomeId: string) => CampaignProgressSnapshot;
  reset: () => CampaignProgressSnapshot;
}>;

export class CampaignProgressError extends Error {
  readonly sceneId: string;
  readonly field: string;

  constructor(sceneId: string, field: string, message: string) {
    super(message);
    this.name = "CampaignProgressError";
    this.sceneId = sceneId;
    this.field = field;
  }
}

export function createCampaignProgress(
  definition: CampaignDefinition,
): CampaignProgress {
  const internalDefinition = structuredClone(definition);
  assertValidCampaignDefinition(internalDefinition);

  const scenesById = new Map(
    internalDefinition.scenes.map((scene) => [scene.identity.id, scene]),
  );
  let currentSceneId = internalDefinition.startSceneId;
  let completedSceneIds: string[] = [];

  const internalCurrentScene = (): CampaignScene => {
    const scene = scenesById.get(currentSceneId);
    if (!scene) {
      throw new CampaignProgressError(
        currentSceneId,
        "identity.id",
        `Campaign state references missing scene "${currentSceneId}".`,
      );
    }
    return scene;
  };

  const snapshot = (): CampaignProgressSnapshot => ({
    currentSceneId,
    completedSceneIds: [...completedSceneIds],
    completed: internalCurrentScene().identity.kind === "epilogue",
  });

  const recordOutcome = (outcomeId: string): CampaignProgressSnapshot => {
    const scene = internalCurrentScene();
    const transition = scene.transitions.find(
      (candidate) => candidate.outcomeId === outcomeId,
    );

    if (!transition) {
      throw new CampaignProgressError(
        scene.identity.id,
        "transitions",
        `Outcome "${outcomeId}" is not declared by scene "${scene.identity.id}".`,
      );
    }

    if (
      transition.targetSceneId !== currentSceneId &&
      !completedSceneIds.includes(currentSceneId)
    ) {
      completedSceneIds.push(currentSceneId);
    }
    currentSceneId = transition.targetSceneId;
    return snapshot();
  };

  const reset = (): CampaignProgressSnapshot => {
    currentSceneId = internalDefinition.startSceneId;
    completedSceneIds = [];
    return snapshot();
  };

  return {
    definition: () => structuredClone(internalDefinition),
    currentScene: () => structuredClone(internalCurrentScene()),
    snapshot,
    recordOutcome,
    reset,
  };
}
