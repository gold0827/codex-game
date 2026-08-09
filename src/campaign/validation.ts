import type { CampaignDefinition } from "./types";

export type CampaignDiagnosticCode =
  | "duplicate-scene-id"
  | "duplicate-outcome-id"
  | "missing-transition-target"
  | "unreachable-scene"
  | "invalid-start-scene"
  | "non-terminal-epilogue"
  | "no-reachable-epilogue";

export interface CampaignDiagnostic {
  readonly code: CampaignDiagnosticCode;
  readonly sceneId: string;
  readonly field: string;
  readonly message: string;
}

export type CampaignValidationResult = Readonly<{
  valid: boolean;
  diagnostics: readonly CampaignDiagnostic[];
}>;

export class CampaignValidationError extends Error {
  readonly diagnostics: readonly CampaignDiagnostic[];

  constructor(diagnostics: readonly CampaignDiagnostic[]) {
    super(
      `Campaign definition is invalid: ${diagnostics
        .map(({ sceneId, field, message }) => `${sceneId}.${field}: ${message}`)
        .join("; ")}`,
    );
    this.name = "CampaignValidationError";
    this.diagnostics = diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }
}

export function validateCampaignDefinition(
  definition: CampaignDefinition,
): CampaignValidationResult {
  const diagnostics: CampaignDiagnostic[] = [];
  const scenesById = new Map<string, (typeof definition.scenes)[number]>();
  const duplicateSceneIds = new Set<string>();

  definition.scenes.forEach((scene) => {
    const sceneId = scene.identity.id;
    if (scenesById.has(sceneId)) {
      duplicateSceneIds.add(sceneId);
      diagnostics.push({
        code: "duplicate-scene-id",
        sceneId,
        field: "identity.id",
        message: `Scene identifier "${sceneId}" is duplicated.`,
      });
      return;
    }

    scenesById.set(sceneId, scene);
  });

  const startScene = scenesById.get(definition.startSceneId);
  if (!startScene || duplicateSceneIds.has(definition.startSceneId)) {
    diagnostics.push({
      code: "invalid-start-scene",
      sceneId: definition.startSceneId,
      field: "startSceneId",
      message: `Start scene "${definition.startSceneId}" does not identify one unique scene.`,
    });
  }

  definition.scenes.forEach((scene) => {
    const seenOutcomeIds = new Set<string>();

    scene.transitions.forEach((transition, transitionIndex) => {
      if (seenOutcomeIds.has(transition.outcomeId)) {
        diagnostics.push({
          code: "duplicate-outcome-id",
          sceneId: scene.identity.id,
          field: `transitions[${transitionIndex}].outcomeId`,
          message: `Outcome "${transition.outcomeId}" is declared more than once.`,
        });
      }
      seenOutcomeIds.add(transition.outcomeId);

      if (!scenesById.has(transition.targetSceneId)) {
        diagnostics.push({
          code: "missing-transition-target",
          sceneId: scene.identity.id,
          field: `transitions[${transitionIndex}].targetSceneId`,
          message: `Transition target "${transition.targetSceneId}" does not exist.`,
        });
      }
    });

    if (scene.identity.kind === "epilogue" && scene.transitions.length > 0) {
      diagnostics.push({
        code: "non-terminal-epilogue",
        sceneId: scene.identity.id,
        field: "transitions",
        message: "An epilogue must be terminal and cannot declare transitions.",
      });
    }
  });

  if (startScene && !duplicateSceneIds.has(definition.startSceneId)) {
    const reachableSceneIds = new Set<string>();
    const pendingSceneIds = [definition.startSceneId];

    while (pendingSceneIds.length > 0) {
      const sceneId = pendingSceneIds.shift();
      if (sceneId === undefined || reachableSceneIds.has(sceneId)) {
        continue;
      }

      reachableSceneIds.add(sceneId);
      const scene = scenesById.get(sceneId);
      scene?.transitions.forEach(({ targetSceneId }) => {
        if (scenesById.has(targetSceneId) && !reachableSceneIds.has(targetSceneId)) {
          pendingSceneIds.push(targetSceneId);
        }
      });
    }

    scenesById.forEach((_scene, sceneId) => {
      if (!reachableSceneIds.has(sceneId)) {
        diagnostics.push({
          code: "unreachable-scene",
          sceneId,
          field: "identity.id",
          message: `Scene "${sceneId}" is unreachable from the start scene.`,
        });
      }
    });

    const hasReachableEpilogue = [...reachableSceneIds].some(
      (sceneId) => scenesById.get(sceneId)?.identity.kind === "epilogue",
    );
    if (!hasReachableEpilogue) {
      diagnostics.push({
        code: "no-reachable-epilogue",
        sceneId: definition.startSceneId,
        field: "startSceneId",
        message: "The start scene cannot reach an epilogue.",
      });
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

export function assertValidCampaignDefinition(
  definition: CampaignDefinition,
): void {
  const result = validateCampaignDefinition(definition);
  if (!result.valid) {
    throw new CampaignValidationError(result.diagnostics);
  }
}
