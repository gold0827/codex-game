import {
  CAMPAIGN_SPATIAL_SIGNAL_KINDS,
  CAMPAIGN_SPATIAL_SIGNAL_STRENGTHS,
  type CampaignDefinition,
  type CampaignMapTopology,
  type CampaignOfficer,
  type CampaignScene,
} from "./types";

export type CampaignDiagnosticCode =
  | "duplicate-officer-id"
  | "duplicate-scene-id"
  | "duplicate-outcome-id"
  | "duplicate-guidance-id"
  | "invalid-guidance-signal"
  | "duplicate-beat-id"
  | "duplicate-report-id"
  | "duplicate-threat-id"
  | "unknown-officer-reference"
  | "unknown-report-reference"
  | "invalid-officer-profile"
  | "duplicate-source-trust"
  | "invalid-beat-time"
  | "out-of-order-beat-time"
  | "invalid-threat-telegraph-duration"
  | "missing-playable-map"
  | "insufficient-map-locations"
  | "invalid-playable-duration"
  | "missing-playable-transition"
  | "invalid-simulation-speed"
  | "invalid-map-dimensions"
  | "invalid-map-position"
  | "invalid-terrain-cost"
  | "duplicate-map-location"
  | "blocked-map-location"
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

export type PlayableCampaignScene = CampaignScene & Readonly<{
  mapTopology: CampaignMapTopology;
}>;

export function playableSceneDiagnostics(
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
): readonly CampaignDiagnostic[] {
  const diagnostics: CampaignDiagnostic[] = [];
  const sceneId = scene.identity.id;
  const add = (
    code: CampaignDiagnosticCode,
    field: string,
    message: string,
  ): void => {
    diagnostics.push({ code, sceneId, field, message });
  };

  if (!scene.mapTopology) {
    add(
      "missing-playable-map",
      "mapTopology",
      "A playable scene requires authored map topology.",
    );
  } else {
    (["spawns", "destinations"] as const).forEach((collection) => {
      if (scene.mapTopology![collection].length < roster.length) {
        add(
          "insufficient-map-locations",
          `mapTopology.${collection}`,
          `A playable scene requires one unique ${collection} location per campaign officer.`,
        );
      }
    });
  }

  const durationMs = scene.encounterParameters.durationMs;
  const validDuration = Number.isSafeInteger(durationMs) && durationMs > 0;
  if (!validDuration) {
    add(
      "invalid-playable-duration",
      "encounterParameters.durationMs",
      "A playable scene duration must be a positive safe integer.",
    );
  }

  scene.beats.forEach((beat, beatIndex) => {
    const validBeatTime = Number.isSafeInteger(beat.timeMs) && beat.timeMs >= 0 &&
      validDuration && beat.timeMs <= durationMs;
    if (!validBeatTime) {
      add(
        "invalid-beat-time",
        `beats[${beatIndex}].timeMs`,
        `Beat time must be a non-negative safe integer inside the playable duration, received ${beat.timeMs}.`,
      );
    }
    beat.threats.forEach((threat, threatIndex) => {
      const validTelegraph = Number.isSafeInteger(threat.telegraphDurationMs) &&
        threat.telegraphDurationMs > 0 && validBeatTime &&
        threat.telegraphDurationMs <= durationMs - beat.timeMs;
      if (!validTelegraph) {
        add(
          "invalid-threat-telegraph-duration",
          `beats[${beatIndex}].threats[${threatIndex}].telegraphDurationMs`,
          "A threat cannot complete its telegraph before the operation ends unless it has a positive safe duration inside the playable window.",
        );
      }
    });
  });

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

export function assertPlayableCampaignScene(
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
): asserts scene is PlayableCampaignScene {
  if (scene.identity.kind === "epilogue") {
    throw new RangeError("Operation simulation requires a playable scene.");
  }
  const diagnostics = playableSceneDiagnostics(scene, roster);
  if (diagnostics.length > 0) {
    const first = diagnostics[0] as CampaignDiagnostic;
    throw new RangeError(`${first.field}: ${first.message}`);
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
    if (officer.profile) {
      const traitFields = [
        "initiative",
        "caution",
        "discipline",
        "cooperation",
        "stressTolerance",
      ] as const;
      traitFields.forEach((field) => {
        const value = officer.profile?.[field];
        if (!Number.isFinite(value) || value === undefined || value < 0 || value > 1) {
          diagnostics.push({
            code: "invalid-officer-profile",
            sceneId: definition.id,
            field: `officers[${officerIndex}].profile.${field}`,
            message: `Officer profile ${field} must be between zero and one.`,
          });
        }
      });
      if (!Number.isSafeInteger(officer.profile.memoryCapacity) || officer.profile.memoryCapacity < 1) {
        diagnostics.push({
          code: "invalid-officer-profile",
          sceneId: definition.id,
          field: `officers[${officerIndex}].profile.memoryCapacity`,
          message: "Officer memory capacity must be a positive safe integer.",
        });
      }
      const trustedOfficerIds = new Set<string>();
      officer.profile.sourceTrust.forEach((entry, trustIndex) => {
        if (trustedOfficerIds.has(entry.officerId)) {
          diagnostics.push({
            code: "duplicate-source-trust",
            sceneId: definition.id,
            field: `officers[${officerIndex}].profile.sourceTrust[${trustIndex}].officerId`,
            message: `Source trust for officer "${entry.officerId}" is duplicated.`,
          });
        }
        trustedOfficerIds.add(entry.officerId);
        if (!Number.isFinite(entry.trust) || entry.trust < 0 || entry.trust > 1) {
          diagnostics.push({
            code: "invalid-officer-profile",
            sceneId: definition.id,
            field: `officers[${officerIndex}].profile.sourceTrust[${trustIndex}].trust`,
            message: "Officer source trust must be between zero and one.",
          });
        }
      });
    }
  });

  definition.officers.forEach((officer, officerIndex) => {
    officer.profile?.sourceTrust.forEach((entry, trustIndex) => {
      if (!officerIds.has(entry.officerId)) {
        diagnostics.push({
          code: "unknown-officer-reference",
          sceneId: definition.id,
          field: `officers[${officerIndex}].profile.sourceTrust[${trustIndex}].officerId`,
          message: `Trusted officer "${entry.officerId}" is not declared in the campaign roster.`,
        });
      }
    });
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
    const sceneId = scene.identity.id;
    const seenOutcomeIds = new Set<string>();
    const sceneReportIds = new Set(
      scene.beats.flatMap((beat) => beat.reports.map((report) => report.id)),
    );

    const { mapTopology } = scene;
    const validDimensions =
      mapTopology !== undefined &&
      Number.isSafeInteger(mapTopology.width) &&
      mapTopology.width > 0 &&
      Number.isSafeInteger(mapTopology.height) &&
      mapTopology.height > 0;
    const positionIsValid = ({ x, y }: { readonly x: number; readonly y: number }): boolean =>
      mapTopology !== undefined && validDimensions &&
      Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
      x >= 0 && y >= 0 && x < mapTopology.width && y < mapTopology.height;
    if (mapTopology) {
    if (!validDimensions) {
      diagnostics.push({
        code: "invalid-map-dimensions",
        sceneId,
        field: "mapTopology",
        message: "Map width and height must be positive safe integers.",
      });
    }
    const positionKey = ({ x, y }: { readonly x: number; readonly y: number }): string => `${x},${y}`;
    const blockedKeys = new Set<string>();
    mapTopology.blocked.forEach((position, index) => {
      if (!positionIsValid(position)) {
        diagnostics.push({
          code: "invalid-map-position",
          sceneId,
          field: `mapTopology.blocked[${index}]`,
          message: `Blocked tile (${position.x}, ${position.y}) must be inside the map.`,
        });
      }
      const key = positionKey(position);
      if (blockedKeys.has(key)) {
        diagnostics.push({
          code: "duplicate-map-location",
          sceneId,
          field: `mapTopology.blocked[${index}]`,
          message: `Blocked tile (${position.x}, ${position.y}) is duplicated.`,
        });
      }
      blockedKeys.add(key);
    });
    const terrainKeys = new Set<string>();
    mapTopology.terrain.forEach((tile, index) => {
      if (!positionIsValid(tile.position)) {
        diagnostics.push({
          code: "invalid-map-position",
          sceneId,
          field: `mapTopology.terrain[${index}].position`,
          message: `Terrain tile (${tile.position.x}, ${tile.position.y}) must be inside the map.`,
        });
      }
      if (!Number.isSafeInteger(tile.movementCost) || tile.movementCost < 1) {
        diagnostics.push({
          code: "invalid-terrain-cost",
          sceneId,
          field: `mapTopology.terrain[${index}].movementCost`,
          message: "Terrain movement cost must be a positive safe integer.",
        });
      }
      const key = positionKey(tile.position);
      if (terrainKeys.has(key)) {
        diagnostics.push({
          code: "duplicate-map-location",
          sceneId,
          field: `mapTopology.terrain[${index}].position`,
          message: `Terrain tile (${tile.position.x}, ${tile.position.y}) is duplicated.`,
        });
      }
      if (blockedKeys.has(key)) {
        diagnostics.push({
          code: "blocked-map-location",
          sceneId,
          field: `mapTopology.terrain[${index}].position`,
          message: "A blocked tile cannot also declare traversable terrain.",
        });
      }
      terrainKeys.add(key);
    });
    const occupiedLocationKeys = new Set<string>();
    (["spawns", "destinations"] as const).forEach((collection) => {
      const ids = new Set<string>();
      mapTopology[collection].forEach((location, index) => {
        if (!positionIsValid(location.position)) {
          diagnostics.push({
            code: "invalid-map-position",
            sceneId,
            field: `mapTopology.${collection}[${index}].position`,
            message: `${collection} location "${location.id}" must be inside the map.`,
          });
        }
        if (ids.has(location.id)) {
          diagnostics.push({
            code: "duplicate-map-location",
            sceneId,
            field: `mapTopology.${collection}[${index}].id`,
            message: `${collection} identifier "${location.id}" is duplicated.`,
          });
        }
        ids.add(location.id);
        const key = positionKey(location.position);
        if (blockedKeys.has(key)) {
          diagnostics.push({
            code: "blocked-map-location",
            sceneId,
            field: `mapTopology.${collection}[${index}].position`,
            message: `${collection} location "${location.id}" cannot occupy a blocked tile.`,
          });
        }
        if (occupiedLocationKeys.has(key)) {
          diagnostics.push({
            code: "duplicate-map-location",
            sceneId,
            field: `mapTopology.${collection}[${index}].position`,
            message: `Map location (${location.position.x}, ${location.position.y}) is already occupied.`,
          });
        }
        occupiedLocationKeys.add(key);
      });
    });
    }

    if (scene.identity.kind !== "epilogue") {
      diagnostics.push(...playableSceneDiagnostics(scene, definition.officers));
    }

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

      if (
        guidance.action === "inspect" &&
        !officerIds.has(guidance.target.officerId)
      ) {
        diagnostics.push({
          code: "unknown-officer-reference",
          sceneId: scene.identity.id,
          field: `guidance[${guidanceIndex}].target.officerId`,
          message: `Officer "${guidance.target.officerId}" is not declared in the campaign roster.`,
        });
      }

      if (guidance.action === "route") {
        if (!sceneReportIds.has(guidance.target.reportId)) {
          diagnostics.push({
            code: "unknown-report-reference",
            sceneId: scene.identity.id,
            field: `guidance[${guidanceIndex}].target.reportId`,
            message: `Report "${guidance.target.reportId}" is not declared in this scene.`,
          });
        }

        if (!officerIds.has(guidance.target.recipientOfficerId)) {
          diagnostics.push({
            code: "unknown-officer-reference",
            sceneId: scene.identity.id,
            field: `guidance[${guidanceIndex}].target.recipientOfficerId`,
            message: `Officer "${guidance.target.recipientOfficerId}" is not declared in the campaign roster.`,
          });
        }
      }

      if (guidance.action === "signal") {
        if (!CAMPAIGN_SPATIAL_SIGNAL_KINDS.includes(guidance.target.signal)) {
          diagnostics.push({
            code: "invalid-guidance-signal",
            sceneId: scene.identity.id,
            field: `guidance[${guidanceIndex}].target.signal`,
            message: `Spatial signal "${String(guidance.target.signal)}" is not supported.`,
          });
        }
        if (!CAMPAIGN_SPATIAL_SIGNAL_STRENGTHS.includes(guidance.target.strength)) {
          diagnostics.push({
            code: "invalid-guidance-signal",
            sceneId: scene.identity.id,
            field: `guidance[${guidanceIndex}].target.strength`,
            message: "Spatial signal strength must be 1, 2, or 3.",
          });
        }
        if (!positionIsValid(guidance.target.position)) {
          diagnostics.push({
            code: "invalid-map-position",
            sceneId: scene.identity.id,
            field: `guidance[${guidanceIndex}].target.position`,
            message: `Spatial signal tile (${guidance.target.position.x}, ${guidance.target.position.y}) must be inside the map.`,
          });
        }
      }
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

      if (scene.identity.kind === "epilogue" &&
          (!Number.isSafeInteger(beat.timeMs) || beat.timeMs < 0)) {
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

        if (scene.identity.kind === "epilogue" && (
          !Number.isSafeInteger(threat.telegraphDurationMs) ||
          threat.telegraphDurationMs <= 0
        )) {
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
