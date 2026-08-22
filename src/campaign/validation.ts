import type { CampaignDefinition, CampaignScene } from "./types";

export type CampaignDiagnosticCode =
  | "duplicate-role-id"
  | "duplicate-scene-id"
  | "duplicate-outcome-id"
  | "invalid-playable-duration"
  | "missing-playable-transition"
  | "invalid-simulation-speed"
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

function operationSceneDiagnostics(scene: CampaignScene): CampaignDiagnostic[] {
  const diagnostics: CampaignDiagnostic[] = [];
  const add = (
    code: CampaignDiagnosticCode,
    field: string,
    message: string,
  ): void => {
    diagnostics.push({ code, sceneId: scene.identity.id, field, message });
  };

  const durationMs = scene.encounterParameters.durationMs;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    add(
      "invalid-playable-duration",
      "encounterParameters.durationMs",
      "A playable scene duration must be a positive safe integer.",
    );
  }

  const hasRetry = scene.transitions.some(({ outcomeId }) => outcomeId === "retry");
  const hasNonRetry = scene.transitions.some(({ outcomeId }) => outcomeId !== "retry");
  if (!hasRetry || !hasNonRetry) {
    add(
      "missing-playable-transition",
      "transitions",
      "A playable scene must declare retry and non-retry outcomes.",
    );
  }

  if (!Number.isFinite(scene.gameplayTuning.simulationSpeed) ||
      scene.gameplayTuning.simulationSpeed <= 0) {
    add(
      "invalid-simulation-speed",
      "gameplayTuning.simulationSpeed",
      "A playable scene simulation speed must be a positive finite number.",
    );
  }

  return diagnostics;
}

export function validateCampaignDefinition(
  definition: CampaignDefinition,
): CampaignValidationResult {
  const diagnostics: CampaignDiagnostic[] = [];
  const scenesById = new Map<string, CampaignScene>();
  const duplicateSceneIds = new Set<string>();
  const roleIds = new Set<string>();

  definition.roles.forEach((role, roleIndex) => {
    if (roleIds.has(role.id)) {
      diagnostics.push({
        code: "duplicate-role-id",
        sceneId: definition.id,
        field: `roles[${roleIndex}].id`,
        message: `Role identifier "${role.id}" is duplicated.`,
      });
    }
    roleIds.add(role.id);
  });

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

    if (scene.identity.kind !== "epilogue") {
      diagnostics.push(...operationSceneDiagnostics(scene));
    }

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
      if (sceneId === undefined || reachableSceneIds.has(sceneId)) continue;

      reachableSceneIds.add(sceneId);
      scenesById.get(sceneId)?.transitions.forEach(({ targetSceneId }) => {
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
  if (!result.valid) throw new CampaignValidationError(result.diagnostics);
}
