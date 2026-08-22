import { describe, expect, it } from "vitest";

import {
  CampaignProgressError,
  CampaignValidationError,
  createCampaignProgress,
  parseCampaignJson,
  parseCampaignValue,
  validateCampaignDefinition,
  type CampaignDefinition,
  type CampaignDiagnosticCode,
  type CampaignScene,
  type CampaignTransition,
} from "../../src/campaign";

function createScene(
  id: string,
  kind: CampaignScene["identity"]["kind"],
  transitions: readonly CampaignTransition[],
): CampaignScene {
  return {
    identity: { id, kind },
    copy: {
      title: `${id} 제목`,
      subtitle: `${id} 부제`,
      briefing: `${id} 브리핑`,
      lesson: `${id} 교훈`,
      success: `${id} 성공`,
      failure: `${id} 실패`,
    },
    presentation: {
      backdropId: `${id}-backdrop`,
      soundtrackId: `${id}-soundtrack`,
      accentColor: "#778866",
    },
    objectives: [{ id: `${id}-objective`, description: `${id} 목표`, required: true }],
    transitions,
    encounterParameters: { durationMs: kind === "epilogue" ? 1 : 60_000 },
    gameplayTuning: {
      startingResources: kind === "epilogue" ? 0 : 72,
      interventionBudget: kind === "epilogue" ? 0 : 4,
      simulationSpeed: kind === "epilogue" ? 1 : 60,
    },
  };
}

function createDefinition(): CampaignDefinition {
  return {
    id: "campaign",
    title: "캠페인",
    version: 1,
    startSceneId: "first-operation",
    officers: [{
      id: "command-role",
      name: "지휘 역할",
      rank: "익명",
      role: "작전 목표 유지",
    }],
    scenes: [
      createScene("first-operation", "operation", [
        { outcomeId: "retry", targetSceneId: "first-operation" },
        { outcomeId: "complete", targetSceneId: "second-operation" },
      ]),
      createScene("second-operation", "operation", [
        { outcomeId: "retry", targetSceneId: "second-operation" },
        { outcomeId: "victory", targetSceneId: "epilogue" },
      ]),
      createScene("epilogue", "epilogue", []),
    ],
  };
}

function diagnosticFor(
  definition: CampaignDefinition,
  code: CampaignDiagnosticCode,
) {
  return validateCampaignDefinition(definition).diagnostics.find(
    (diagnostic) => diagnostic.code === code,
  );
}

describe("canonical campaign schema", () => {
  it("validates and parses the minimal progression document", () => {
    const definition = createDefinition();

    expect(validateCampaignDefinition(definition)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(parseCampaignJson(JSON.stringify(definition))).toEqual({
      ok: true,
      value: definition,
    });
  });

  it.each(["guidance", "beats", "mapTopology"])(
    "rejects the removed scene field %s instead of retaining compatibility data",
    (field) => {
      const source = structuredClone(createDefinition()) as unknown as {
        scenes: Array<Record<string, unknown>>;
      };
      source.scenes[0]![field] = [];

      expect(parseCampaignValue(source)).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            kind: "shape",
            code: "invalid-shape",
            path: `$.scenes[0].${field}`,
          }),
        ],
      });
    },
  );

  it("rejects the removed tutorial scene kind", () => {
    const source = structuredClone(createDefinition()) as unknown as {
      scenes: Array<{ identity: { kind: string } }>;
    };
    source.scenes[0]!.identity.kind = "tutorial";

    expect(parseCampaignValue(source)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ path: "$.scenes[0].identity.kind" })],
    });
  });

  it.each([
    ["officer disposition", (source: Record<string, unknown>): string => {
      const officers = source.officers as Array<Record<string, unknown>>;
      officers[0]!.disposition = "action";
      return "$.officers[0].disposition";
    }],
    ["officer profile", (source: Record<string, unknown>): string => {
      const officers = source.officers as Array<Record<string, unknown>>;
      officers[0]!.profile = {};
      return "$.officers[0].profile";
    }],
    ["presentation map id", (source: Record<string, unknown>): string => {
      const scenes = source.scenes as Array<{ presentation: Record<string, unknown> }>;
      scenes[0]!.presentation.mapId = "retired-map";
      return "$.scenes[0].presentation.mapId";
    }],
  ] as const)("rejects removed %s metadata", (_name, mutate) => {
    const source = structuredClone(createDefinition()) as unknown as Record<string, unknown>;
    const path = mutate(source);

    expect(parseCampaignValue(source)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ path })],
    });
  });

  it("returns diagnostics for malformed JSON and nested shapes", () => {
    expect(parseCampaignJson("{")).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "malformed-json", path: "$" })],
    });

    const source = structuredClone(createDefinition()) as unknown as {
      scenes: Array<{ objectives: unknown }>;
    };
    source.scenes[0]!.objectives = "invalid";
    expect(parseCampaignValue(source)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ path: "$.scenes[0].objectives" })],
    });
  });

  it("rejects duplicate scene, officer, and outcome identifiers", () => {
    const duplicateScene = createDefinition();
    (duplicateScene.scenes as CampaignScene[]).push(structuredClone(duplicateScene.scenes[0]!));
    expect(diagnosticFor(duplicateScene, "duplicate-scene-id")).toMatchObject({
      field: "identity.id",
    });

    const duplicateOfficer = createDefinition();
    (duplicateOfficer.officers as Array<(typeof duplicateOfficer.officers)[number]>).push({
      ...duplicateOfficer.officers[0]!,
    });
    expect(diagnosticFor(duplicateOfficer, "duplicate-officer-id")).toMatchObject({
      field: "officers[1].id",
    });

    const duplicateOutcome = createDefinition();
    (duplicateOutcome.scenes[0]!.transitions as CampaignTransition[]).push({
      outcomeId: "complete",
      targetSceneId: "epilogue",
    });
    expect(diagnosticFor(duplicateOutcome, "duplicate-outcome-id")).toMatchObject({
      field: "transitions[2].outcomeId",
    });
    expect(() => createCampaignProgress(duplicateOutcome)).toThrow(CampaignValidationError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid playable duration %s",
    (durationMs) => {
      const definition = createDefinition();
      (definition.scenes[0]!.encounterParameters as { durationMs: number }).durationMs = durationMs;
      expect(diagnosticFor(definition, "invalid-playable-duration")).toMatchObject({
        field: "encounterParameters.durationMs",
      });
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid simulation speed %s",
    (simulationSpeed) => {
      const definition = createDefinition();
      (definition.scenes[0]!.gameplayTuning as { simulationSpeed: number }).simulationSpeed =
        simulationSpeed;
      expect(diagnosticFor(definition, "invalid-simulation-speed")).toMatchObject({
        field: "gameplayTuning.simulationSpeed",
      });
    },
  );

  it("rejects broken campaign topology", () => {
    const missingTarget = createDefinition();
    (missingTarget.scenes[0]!.transitions as CampaignTransition[])[1] = {
      outcomeId: "complete",
      targetSceneId: "missing",
    };
    expect(diagnosticFor(missingTarget, "missing-transition-target")).toBeDefined();

    const unreachable = createDefinition();
    (unreachable.scenes as CampaignScene[]).push(
      createScene("unused-operation", "operation", [
        { outcomeId: "retry", targetSceneId: "unused-operation" },
        { outcomeId: "victory", targetSceneId: "epilogue" },
      ]),
    );
    expect(diagnosticFor(unreachable, "unreachable-scene")).toMatchObject({
      sceneId: "unused-operation",
    });

    const invalidStart = createDefinition();
    (invalidStart as { startSceneId: string }).startSceneId = "missing";
    expect(diagnosticFor(invalidStart, "invalid-start-scene")).toBeDefined();

    const nonTerminal = createDefinition();
    (nonTerminal.scenes[2]!.transitions as CampaignTransition[]).push({
      outcomeId: "restart",
      targetSceneId: "first-operation",
    });
    expect(diagnosticFor(nonTerminal, "non-terminal-epilogue")).toBeDefined();
  });
});

describe("campaign progression", () => {
  it("traverses operation scenes to the terminal epilogue", () => {
    const progress = createCampaignProgress(createDefinition());

    expect(progress.recordOutcome("complete")).toEqual({
      currentSceneId: "second-operation",
      completedSceneIds: ["first-operation"],
      completed: false,
    });
    expect(progress.recordOutcome("victory")).toEqual({
      currentSceneId: "epilogue",
      completedSceneIds: ["first-operation", "second-operation"],
      completed: true,
    });
  });

  it("retries without completing the current scene", () => {
    const progress = createCampaignProgress(createDefinition());
    expect(progress.recordOutcome("retry")).toEqual({
      currentSceneId: "first-operation",
      completedSceneIds: [],
      completed: false,
    });
  });

  it("preserves state after an undeclared outcome", () => {
    const progress = createCampaignProgress(createDefinition());
    const initial = progress.snapshot();

    expect(() => progress.recordOutcome("unknown")).toThrow(CampaignProgressError);
    expect(progress.snapshot()).toEqual(initial);
  });

  it("restores a validated checkpoint and isolates returned data", () => {
    const source = createDefinition();
    const progress = createCampaignProgress(source, {
      currentSceneId: "second-operation",
      completedSceneIds: ["first-operation"],
      completed: false,
    });
    const returned = progress.definition();
    (returned.scenes[0]!.identity as { id: string }).id = "mutated";

    expect(progress.currentScene().identity.id).toBe("second-operation");
    expect(progress.definition().scenes[0]!.identity.id).toBe("first-operation");
  });
});
