import type { CampaignDefinition } from "./types";

export type CampaignDiagnosticCode =
  | "duplicate-officer-id"
  | "duplicate-scene-id"
  | "duplicate-outcome-id"
  | "duplicate-guidance-id"
  | "duplicate-beat-id"
  | "duplicate-report-id"
  | "duplicate-threat-id"
  | "unknown-officer-reference"
  | "invalid-beat-time"
  | "out-of-order-beat-time"
  | "invalid-threat-telegraph-duration"
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
  const officerIds = new Set<string>();
  const guidanceIds = new Set<string>();
  const beatIds = new Set<string>();
  const reportIds = new Set<string>();
  const threatIds = new Set<string>();

  definition.officers.forEach((officer, officerIndex) => {
    if (officerIds.has(officer.id)) {
      diagnostics.push({
        code: "duplicate-officer-id",
        sceneId: definition.id,
        field: `officers[${officerIndex}].id`,
        message: `Officer identifier "${officer.id}" is duplicated.`,
      });
    }
    officerIds.add(officer.id);
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

    scene.guidance.forEach((guidance, guidanceIndex) => {
      if (guidanceIds.has(guidance.id)) {
        diagnostics.push({
          code: "duplicate-guidance-id",
          sceneId: scene.identity.id,
          field: `guidance[${guidanceIndex}].id`,
          message: `Guidance identifier "${guidance.id}" is duplicated.`,
        });
      }
      guidanceIds.add(guidance.id);
    });

    scene.beats.forEach((beat, beatIndex) => {
      if (beatIds.has(beat.id)) {
        diagnostics.push({
          code: "duplicate-beat-id",
          sceneId: scene.identity.id,
          field: `beats[${beatIndex}].id`,
          message: `Beat identifier "${beat.id}" is duplicated.`,
        });
      }
      beatIds.add(beat.id);

      if (!Number.isSafeInteger(beat.timeMs) || beat.timeMs < 0) {
        diagnostics.push({
          code: "invalid-beat-time",
          sceneId: scene.identity.id,
          field: `beats[${beatIndex}].timeMs`,
          message: `Beat time must be a non-negative safe integer, received ${beat.timeMs}.`,
        });
      }

      if (beatIndex > 0 && beat.timeMs <= scene.beats[beatIndex - 1].timeMs) {
        diagnostics.push({
          code: "out-of-order-beat-time",
          sceneId: scene.identity.id,
          field: `beats[${beatIndex}].timeMs`,
          message: "Beat times must be strictly increasing.",
        });
      }

      beat.reports.forEach((report, reportIndex) => {
        if (reportIds.has(report.id)) {
          diagnostics.push({
            code: "duplicate-report-id",
            sceneId: scene.identity.id,
            field: `beats[${beatIndex}].reports[${reportIndex}].id`,
            message: `Report identifier "${report.id}" is duplicated.`,
          });
        }
        reportIds.add(report.id);

        if (!officerIds.has(report.officerId)) {
          diagnostics.push({
            code: "unknown-officer-reference",
            sceneId: scene.identity.id,
            field: `beats[${beatIndex}].reports[${reportIndex}].officerId`,
            message: `Officer "${report.officerId}" is not declared in the campaign roster.`,
          });
        }
      });

      beat.threats.forEach((threat, threatIndex) => {
        if (threatIds.has(threat.id)) {
          diagnostics.push({
            code: "duplicate-threat-id",
            sceneId: scene.identity.id,
            field: `beats[${beatIndex}].threats[${threatIndex}].id`,
            message: `Threat identifier "${threat.id}" is duplicated.`,
          });
        }
        threatIds.add(threat.id);

        if (
          !Number.isSafeInteger(threat.telegraphDurationMs) ||
          threat.telegraphDurationMs <= 0
        ) {
          diagnostics.push({
            code: "invalid-threat-telegraph-duration",
            sceneId: scene.identity.id,
            field: `beats[${beatIndex}].threats[${threatIndex}].telegraphDurationMs`,
            message: "Threat telegraph duration must be a positive safe integer.",
          });
        }
      });
    });

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
