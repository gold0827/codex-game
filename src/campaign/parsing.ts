import type { CampaignDefinition } from "./types";
import {
  validateCampaignDefinition,
  type CampaignDiagnosticCode,
} from "./validation";

export type CampaignParseDiagnosticKind = "json" | "shape" | "validation";

export interface CampaignParseDiagnostic {
  readonly kind: CampaignParseDiagnosticKind;
  readonly code: "malformed-json" | "invalid-shape" | CampaignDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type CampaignParseResult =
  | Readonly<{ ok: true; value: CampaignDefinition }>
  | Readonly<{
      ok: false;
      diagnostics: readonly CampaignParseDiagnostic[];
    }>;

type JsonRecord = Record<string, unknown>;

const officerDispositions = ["action", "verification", "communication"];
const sceneKinds = ["tutorial", "operation", "epilogue"];
const reportTones = ["confident", "cautious", "urgent", "relieved", "deadpan"];
const threatKinds = ["communications", "flood", "artillery", "ambush", "misinformation", "obstruction"];
const threatLanes = ["north", "center", "south", "command"];
const threatSeverities = ["low", "medium", "high", "critical"];

function shapeDiagnostic(
  diagnostics: CampaignParseDiagnostic[],
  path: string,
  expected: string,
): void {
  diagnostics.push({
    kind: "shape",
    code: "invalid-shape",
    path,
    message: `${path} must be ${expected}.`,
  });
}

function recordAt(
  value: unknown, path: string, diagnostics: CampaignParseDiagnostic[],
): JsonRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    shapeDiagnostic(diagnostics, path, "an object");
    return undefined;
  }
  return value as JsonRecord;
}

function arrayAt(
  value: unknown, path: string, diagnostics: CampaignParseDiagnostic[],
): unknown[] | undefined {
  if (!Array.isArray(value)) {
    shapeDiagnostic(diagnostics, path, "an array");
    return undefined;
  }
  return value;
}

function propertyPath(path: string, key: string): string {
  return `${path}.${key}`;
}

function expectType(
  record: JsonRecord,
  key: string,
  type: "string" | "number" | "boolean",
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const value = record[key];
  if (typeof value !== type || (type === "number" && !Number.isFinite(value))) {
    shapeDiagnostic(diagnostics, propertyPath(path, key), type === "number" ? "a finite number" : `a ${type}`);
  }
}

function expectStrings(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  keys.forEach((key) => expectType(record, key, "string", path, diagnostics));
}

function expectMember(
  record: JsonRecord,
  key: string,
  members: readonly string[],
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || !members.includes(value)) {
    shapeDiagnostic(
      diagnostics,
      propertyPath(path, key),
      `one of ${members.map((member) => `"${member}"`).join(", ")}`,
    );
    return undefined;
  }
  return value;
}

function checkArray(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
  checkItem: (
    value: unknown,
    itemPath: string,
    diagnostics: CampaignParseDiagnostic[],
  ) => void,
): void {
  const arrayPath = propertyPath(path, key);
  const values = arrayAt(record[key], arrayPath, diagnostics);
  values?.forEach((value, index) => {
    checkItem(value, `${arrayPath}[${index}]`, diagnostics);
  });
}

function checkOfficer(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const officer = recordAt(value, path, diagnostics);
  if (!officer) return;
  expectStrings(officer, ["id", "name", "rank", "role"], path, diagnostics);
  expectMember(officer, "disposition", officerDispositions, path, diagnostics);
  if (officer.profile !== undefined) {
    const profilePath = propertyPath(path, "profile");
    const profile = recordAt(officer.profile, profilePath, diagnostics);
    if (!profile) return;
    [
      "initiative",
      "caution",
      "discipline",
      "cooperation",
      "stressTolerance",
      "memoryCapacity",
    ].forEach((key) => expectType(profile, key, "number", profilePath, diagnostics));
    checkArray(profile, "sourceTrust", profilePath, diagnostics, (entry, entryPath, entryDiagnostics) => {
      const trust = recordAt(entry, entryPath, entryDiagnostics);
      if (!trust) return;
      expectType(trust, "officerId", "string", entryPath, entryDiagnostics);
      expectType(trust, "trust", "number", entryPath, entryDiagnostics);
    });
  }
}

function checkGuidance(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const guidance = recordAt(value, path, diagnostics);
  if (!guidance) return;
  expectStrings(guidance, ["id", "instruction"], path, diagnostics);
  const action = expectMember(
    guidance,
    "action",
    ["pause", "inspect", "route", "resume"],
    path,
    diagnostics,
  );
  const targetPath = propertyPath(path, "target");
  const target = recordAt(guidance.target, targetPath, diagnostics);
  if (!target || !action) return;

  if (action === "pause" || action === "resume") {
    expectMember(target, "kind", ["operation-clock"], targetPath, diagnostics);
    expectMember(
      guidance,
      "completionEvent",
      [action === "pause" ? "operation-paused" : "operation-resumed"],
      path,
      diagnostics,
    );
  } else if (action === "inspect") {
    expectMember(target, "kind", ["officer"], targetPath, diagnostics);
    expectType(target, "officerId", "string", targetPath, diagnostics);
    expectMember(
      guidance,
      "completionEvent",
      ["officer-inspected"],
      path,
      diagnostics,
    );
  } else {
    expectMember(target, "kind", ["report-recipient"], targetPath, diagnostics);
    expectStrings(target, ["reportId", "recipientOfficerId"], targetPath, diagnostics);
    expectMember(
      guidance,
      "completionEvent",
      ["report-routed"],
      path,
      diagnostics,
    );
  }
}

function checkReport(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const report = recordAt(value, path, diagnostics);
  if (!report) return;
  expectStrings(report, ["id", "officerId", "text"], path, diagnostics);
  expectMember(report, "tone", reportTones, path, diagnostics);
}

function checkThreat(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const threat = recordAt(value, path, diagnostics);
  if (!threat) return;
  expectType(threat, "id", "string", path, diagnostics);
  expectMember(threat, "kind", threatKinds, path, diagnostics);
  expectMember(threat, "lane", threatLanes, path, diagnostics);
  expectMember(threat, "severity", threatSeverities, path, diagnostics);
  expectType(threat, "telegraphDurationMs", "number", path, diagnostics);
}

function checkBeat(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const beat = recordAt(value, path, diagnostics);
  if (!beat) return;
  expectStrings(beat, ["id", "headline", "description"], path, diagnostics);
  expectType(beat, "timeMs", "number", path, diagnostics);
  checkArray(beat, "reports", path, diagnostics, checkReport);
  checkArray(beat, "threats", path, diagnostics, checkThreat);
}

function checkPosition(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const position = recordAt(value, path, diagnostics);
  if (!position) return;
  expectType(position, "x", "number", path, diagnostics);
  expectType(position, "y", "number", path, diagnostics);
}

function checkMapTopology(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const topology = recordAt(value, path, diagnostics);
  if (!topology) return;
  expectType(topology, "width", "number", path, diagnostics);
  expectType(topology, "height", "number", path, diagnostics);
  checkArray(topology, "blocked", path, diagnostics, checkPosition);
  checkArray(topology, "terrain", path, diagnostics, (value, itemPath) => {
    const tile = recordAt(value, itemPath, diagnostics);
    if (!tile) return;
    checkPosition(tile.position, propertyPath(itemPath, "position"), diagnostics);
    expectType(tile, "movementCost", "number", itemPath, diagnostics);
  });
  (["spawns", "destinations"] as const).forEach((collection) => {
    checkArray(topology, collection, path, diagnostics, (value, itemPath) => {
      const location = recordAt(value, itemPath, diagnostics);
      if (!location) return;
      expectType(location, "id", "string", itemPath, diagnostics);
      checkPosition(location.position, propertyPath(itemPath, "position"), diagnostics);
    });
  });
}

function checkScene(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const scene = recordAt(value, path, diagnostics);
  if (!scene) return;

  const identityPath = propertyPath(path, "identity");
  const identity = recordAt(scene.identity, identityPath, diagnostics);
  if (identity) {
    expectType(identity, "id", "string", identityPath, diagnostics);
    expectMember(identity, "kind", sceneKinds, identityPath, diagnostics);
  }

  const copyPath = propertyPath(path, "copy");
  const copy = recordAt(scene.copy, copyPath, diagnostics);
  if (copy) {
    expectStrings(
      copy,
      ["title", "subtitle", "briefing", "lesson", "success", "failure"],
      copyPath,
      diagnostics,
    );
  }

  const presentationPath = propertyPath(path, "presentation");
  const presentation = recordAt(scene.presentation, presentationPath, diagnostics);
  if (presentation) {
    expectStrings(
      presentation,
      ["mapId", "backdropId", "soundtrackId", "accentColor"],
      presentationPath,
      diagnostics,
    );
  }

  if (scene.mapTopology !== undefined) {
    checkMapTopology(
      scene.mapTopology,
      propertyPath(path, "mapTopology"),
      diagnostics,
    );
  }

  checkArray(scene, "guidance", path, diagnostics, checkGuidance);
  checkArray(scene, "beats", path, diagnostics, checkBeat);
  checkArray(
    scene, "objectives", path, diagnostics, (objectiveValue, objectivePath) => {
      const objective = recordAt(objectiveValue, objectivePath, diagnostics);
      if (!objective) return;
      expectStrings(objective, ["id", "description"], objectivePath, diagnostics);
      expectType(objective, "required", "boolean", objectivePath, diagnostics);
    },
  );
  checkArray(
    scene, "transitions", path, diagnostics, (transitionValue, transitionPath) => {
      const transition = recordAt(transitionValue, transitionPath, diagnostics);
      if (!transition) return;
      expectStrings(transition, ["outcomeId", "targetSceneId"], transitionPath, diagnostics);
    },
  );

  const encounterPath = propertyPath(path, "encounterParameters");
  const encounter = recordAt(scene.encounterParameters, encounterPath, diagnostics);
  if (encounter) {
    ["durationMs", "threatBudget", "reinforcementIntervalMs"].forEach((key) =>
      expectType(encounter, key, "number", encounterPath, diagnostics),
    );
  }

  const tuningPath = propertyPath(path, "gameplayTuning");
  const tuning = recordAt(scene.gameplayTuning, tuningPath, diagnostics);
  if (tuning) {
    ["startingResources", "interventionBudget", "simulationSpeed"].forEach((key) =>
      expectType(tuning, key, "number", tuningPath, diagnostics),
    );
  }
}

function shapeDiagnostics(value: unknown): CampaignParseDiagnostic[] {
  const diagnostics: CampaignParseDiagnostic[] = [];
  const definition = recordAt(value, "$", diagnostics);
  if (!definition) return diagnostics;
  expectStrings(definition, ["id", "title", "startSceneId"], "$", diagnostics);
  expectType(definition, "version", "number", "$", diagnostics);
  checkArray(definition, "officers", "$", diagnostics, checkOfficer);
  checkArray(definition, "scenes", "$", diagnostics, checkScene);
  return diagnostics;
}

export function parseCampaignValue(value: unknown): CampaignParseResult {
  const diagnostics = shapeDiagnostics(value);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  let campaign: CampaignDefinition;
  try {
    campaign = structuredClone(value) as CampaignDefinition;
    const validation = validateCampaignDefinition(campaign);
    if (!validation.valid) {
      return {
        ok: false,
        diagnostics: validation.diagnostics.map((diagnostic) => ({
          kind: "validation",
          code: diagnostic.code,
          path: `${diagnostic.sceneId}.${diagnostic.field}`,
          message: diagnostic.message,
        })),
      };
    }
  } catch {
    return {
      ok: false,
      diagnostics: [
        {
          kind: "shape",
          code: "invalid-shape",
          path: "$",
          message: "The campaign value cannot be cloned or validated.",
        },
      ],
    };
  }
  return { ok: true, value: campaign };
}

export function parseCampaignJson(source: string): CampaignParseResult {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          kind: "json",
          code: "malformed-json",
          path: "$",
          message:
            error instanceof Error ? error.message : "Campaign JSON is malformed.",
        },
      ],
    };
  }
  return parseCampaignValue(value);
}
