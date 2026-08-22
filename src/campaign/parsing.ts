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

const sceneKinds = ["operation", "epilogue"];

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

function expectOnlyKeys(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const supported = new Set(keys);
  Object.keys(record).forEach((key) => {
    if (supported.has(key)) return;
    diagnostics.push({
      kind: "shape",
      code: "invalid-shape",
      path: propertyPath(path, key),
      message: `${propertyPath(path, key)} is not part of the campaign schema.`,
    });
  });
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
  expectOnlyKeys(officer, ["id", "name", "rank", "role"], path, diagnostics);
  expectStrings(officer, ["id", "name", "rank", "role"], path, diagnostics);
}

function checkScene(
  value: unknown,
  path: string,
  diagnostics: CampaignParseDiagnostic[],
): void {
  const scene = recordAt(value, path, diagnostics);
  if (!scene) return;
  expectOnlyKeys(
    scene,
    [
      "identity",
      "copy",
      "presentation",
      "objectives",
      "transitions",
      "encounterParameters",
      "gameplayTuning",
    ],
    path,
    diagnostics,
  );

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
    expectOnlyKeys(
      presentation,
      ["backdropId", "soundtrackId", "accentColor"],
      presentationPath,
      diagnostics,
    );
    expectStrings(
      presentation,
      ["backdropId", "soundtrackId", "accentColor"],
      presentationPath,
      diagnostics,
    );
  }

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
    expectType(encounter, "durationMs", "number", encounterPath, diagnostics);
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
