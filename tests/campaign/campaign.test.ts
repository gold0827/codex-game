import { describe, expect, it } from "vitest";

import {
  CampaignProgressError,
  CampaignValidationError,
  createCampaignProgress,
  validateCampaignDefinition,
  type CampaignDefinition,
  type CampaignGuidanceStep,
  type CampaignScene,
  type CampaignTransition,
} from "../../src/campaign";

type SpatialSignalGuidance = Extract<CampaignGuidanceStep, { action: "signal" }>;

function spatialSignalGuidance(): SpatialSignalGuidance {
  return {
    id: "defend-crossing",
    instruction: "교량에 방어 신호를 보낸다.",
    action: "signal",
    target: {
      kind: "spatial-signal",
      signal: "defend",
      strength: 2,
      position: { x: 1, y: 1 },
    },
    completionEvent: "spatial-signal-issued",
  };
}

function createScene(
  id: string,
  kind: CampaignScene["identity"]["kind"],
  transitions: CampaignTransition[],
): CampaignScene {
  return {
    identity: { id, kind },
    copy: {
      title: `${id} title`,
      subtitle: `${id} subtitle`,
      briefing: `${id} briefing`,
      lesson: `${id} lesson`,
      success: `${id} success`,
      failure: `${id} failure`,
    },
    presentation: {
      mapId: `${id}-map`,
      backdropId: `${id}-backdrop`,
      soundtrackId: `${id}-soundtrack`,
      accentColor: "#ffffff",
    },
    mapTopology: {
      width: 4,
      height: 4,
      blocked: [{ x: 2, y: 2 }],
      terrain: [{ position: { x: 1, y: 2 }, movementCost: 2 }],
      spawns: [{ id: "spawn", position: { x: 0, y: 0 } }],
      destinations: [{ id: "destination", position: { x: 3, y: 3 } }],
    },
    guidance: [
      {
        id: `${id}-guidance`,
        instruction: `${id} guidance`,
        action: "pause",
        target: { kind: "operation-clock" },
        completionEvent: "operation-paused",
      },
    ],
    beats: [
      {
        id: `${id}-beat`,
        timeMs: 0,
        headline: `${id} headline`,
        description: `${id} description`,
        reports: [
          {
            id: `${id}-report`,
            officerId: "test-officer",
            tone: "confident",
            text: `${id} report`,
          },
        ],
        threats: [
          {
            id: `${id}-threat`,
            kind: "communications",
            lane: "command",
            severity: "low",
            telegraphDurationMs: 1_000,
          },
        ],
      },
    ],
    objectives: [
      {
        id: `${id}-objective`,
        description: `${id} objective`,
        required: true,
      },
    ],
    transitions,
    encounterParameters: {
      durationMs: kind !== "epilogue" ? 60_000 : 0,
    },
    gameplayTuning: {
      startingResources: kind === "operation" ? 100 : 0,
      interventionBudget: kind === "operation" ? 3 : 0,
      simulationSpeed: 1,
    },
  };
}

function createDefinition(): CampaignDefinition {
  return {
    id: "training-campaign",
    title: "훈련 캠페인",
    version: 1,
    startSceneId: "tutorial",
    officers: [
      {
        id: "test-officer",
        name: "시험 장교",
        rank: "대위",
        role: "검증",
        disposition: "verification",
      },
    ],
    scenes: [
      createScene("tutorial", "tutorial", [
        { outcomeId: "retry", targetSceneId: "tutorial" },
        { outcomeId: "complete", targetSceneId: "operation" },
      ]),
      createScene("operation", "operation", [
        { outcomeId: "victory", targetSceneId: "epilogue" },
        { outcomeId: "retry", targetSceneId: "operation" },
      ]),
      createScene("epilogue", "epilogue", []),
    ],
  };
}

function diagnosticFor(
  definition: CampaignDefinition,
  code: ReturnType<typeof validateCampaignDefinition>["diagnostics"][number]["code"],
) {
  return validateCampaignDefinition(definition).diagnostics.find(
    (diagnostic) => diagnostic.code === code,
  );
}

describe("campaign definition", () => {
  it("uses one JSON-serializable contract for every scene kind", () => {
    const definition = createDefinition();
    const sceneFields = [
      "identity",
      "copy",
      "presentation",
      "mapTopology",
      "guidance",
      "beats",
      "objectives",
      "transitions",
      "encounterParameters",
      "gameplayTuning",
    ];

    expect(definition.scenes.map(({ identity }) => identity.kind)).toEqual([
      "tutorial",
      "operation",
      "epilogue",
    ]);
    definition.scenes.forEach((scene) => {
      expect(Object.keys(scene)).toEqual(sceneFields);
    });
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expect(validateCampaignDefinition(definition)).toEqual({
      valid: true,
      diagnostics: [],
    });
  });

  it("accepts a JSON-serializable spatial signal guidance contract", () => {
    const definition = createDefinition();
    (definition.scenes[0].guidance as CampaignGuidanceStep[])[0] =
      spatialSignalGuidance();

    expect(validateCampaignDefinition(definition)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(
      JSON.parse(JSON.stringify(definition.scenes[0].guidance[0])),
    ).toEqual(spatialSignalGuidance());
  });

  it("rejects duplicate scene identifiers", () => {
    const definition = createDefinition();
    const duplicate = structuredClone(definition.scenes[1]);
    (definition.scenes as CampaignScene[]).push(duplicate);

    expect(diagnosticFor(definition, "duplicate-scene-id")).toMatchObject({
      sceneId: "operation",
      field: "identity.id",
    });
  });

  it("rejects duplicate officer identifiers", () => {
    const definition = createDefinition();
    (definition.officers as typeof definition.officers[number][]).push({
      ...definition.officers[0],
    });

    expect(diagnosticFor(definition, "duplicate-officer-id")).toMatchObject({
      sceneId: "training-campaign",
      field: "officers[1].id",
    });
  });

  it("rejects out-of-bounds and blocked map locations", () => {
    const definition = createDefinition();
    const topology = definition.scenes[0].mapTopology as unknown as {
      blocked: Array<{ x: number; y: number }>;
      spawns: Array<{ id: string; position: { x: number; y: number } }>;
    };
    topology.blocked.push({ x: 4, y: 0 });
    topology.spawns[0]!.position = { x: 2, y: 2 };

    expect(diagnosticFor(definition, "invalid-map-position")).toMatchObject({
      sceneId: "tutorial",
      field: "mapTopology.blocked[1]",
    });
    expect(diagnosticFor(definition, "blocked-map-location")).toMatchObject({
      sceneId: "tutorial",
      field: "mapTopology.spawns[0].position",
    });
  });

  it.each([
    ["guidance", "duplicate-guidance-id", "guidance[1].id", () => {
      const definition = createDefinition();
      const guidance = definition.scenes[0].guidance as Array<
        (typeof definition.scenes)[number]["guidance"][number]
      >;
      guidance.push({ ...guidance[0] });
      return definition;
    }],
    ["beat", "duplicate-beat-id", "beats[1].id", () => {
      const definition = createDefinition();
      const beats = definition.scenes[0].beats as Array<
        (typeof definition.scenes)[number]["beats"][number]
      >;
      beats.push({ ...beats[0], timeMs: 1 });
      return definition;
    }],
    ["report", "duplicate-report-id", "beats[0].reports[1].id", () => {
      const definition = createDefinition();
      const reports = definition.scenes[0].beats[0].reports as Array<
        (typeof definition.scenes)[number]["beats"][number]["reports"][number]
      >;
      reports.push({ ...reports[0] });
      return definition;
    }],
    ["threat", "duplicate-threat-id", "beats[0].threats[1].id", () => {
      const definition = createDefinition();
      const threats = definition.scenes[0].beats[0].threats as Array<
        (typeof definition.scenes)[number]["beats"][number]["threats"][number]
      >;
      threats.push({ ...threats[0] });
      return definition;
    }],
  ] as const)("rejects duplicate %s identifiers", (_name, code, field, build) => {
    expect(diagnosticFor(build(), code)).toMatchObject({
      sceneId: "tutorial",
      field,
    });
  });

  it("rejects reports from officers outside the roster", () => {
    const definition = createDefinition();
    const report = definition.scenes[0].beats[0].reports[0] as {
      officerId: string;
    };
    report.officerId = "unknown-officer";

    expect(diagnosticFor(definition, "unknown-officer-reference")).toMatchObject({
      sceneId: "tutorial",
      field: "beats[0].reports[0].officerId",
    });
  });

  it("rejects an inspect guidance target outside the officer roster", () => {
    const definition = createDefinition();
    (definition.scenes[0].guidance as CampaignScene["guidance"][number][])[0] = {
      id: "inspect-officer",
      instruction: "inspect officer",
      action: "inspect",
      target: { kind: "officer", officerId: "unknown-officer" },
      completionEvent: "officer-inspected",
    };

    expect(diagnosticFor(definition, "unknown-officer-reference")).toMatchObject({
      sceneId: "tutorial",
      field: "guidance[0].target.officerId",
    });
  });

  it("rejects a route guidance report outside its scene", () => {
    const definition = createDefinition();
    (definition.scenes[0].guidance as CampaignScene["guidance"][number][])[0] = {
      id: "route-report",
      instruction: "route report",
      action: "route",
      target: {
        kind: "report-recipient",
        reportId: "unknown-report",
        recipientOfficerId: "test-officer",
      },
      completionEvent: "report-routed",
    };

    expect(diagnosticFor(definition, "unknown-report-reference")).toMatchObject({
      sceneId: "tutorial",
      field: "guidance[0].target.reportId",
    });
  });

  it("rejects a route guidance recipient outside the officer roster", () => {
    const definition = createDefinition();
    (definition.scenes[0].guidance as CampaignScene["guidance"][number][])[0] = {
      id: "route-report",
      instruction: "route report",
      action: "route",
      target: {
        kind: "report-recipient",
        reportId: "tutorial-report",
        recipientOfficerId: "unknown-officer",
      },
      completionEvent: "report-routed",
    };

    expect(diagnosticFor(definition, "unknown-officer-reference")).toMatchObject({
      sceneId: "tutorial",
      field: "guidance[0].target.recipientOfficerId",
    });
  });

  it.each([
    ["unknown kind", { signal: "broadcast" }, "target.signal"],
    ["zero strength", { strength: 0 }, "target.strength"],
    ["fractional strength", { strength: 1.5 }, "target.strength"],
    ["excess strength", { strength: 4 }, "target.strength"],
  ] as const)(
    "rejects a spatial signal guidance with %s",
    (_description, replacement, field) => {
      const definition = createDefinition();
      const guidance = spatialSignalGuidance();
      (definition.scenes[0].guidance as CampaignGuidanceStep[])[0] = guidance;
      Object.assign(
        guidance.target as unknown as Record<string, unknown>,
        replacement,
      );

      expect(diagnosticFor(definition, "invalid-guidance-signal")).toMatchObject({
        sceneId: "tutorial",
        field: `guidance[0].${field}`,
      });
    },
  );

  it("rejects a spatial signal guidance tile outside its scene map", () => {
    const definition = createDefinition();
    const guidance = spatialSignalGuidance();
    (definition.scenes[0].guidance as CampaignGuidanceStep[])[0] = guidance;
    (guidance.target.position as { x: number }).x = 4;

    expect(diagnosticFor(definition, "invalid-map-position")).toMatchObject({
      sceneId: "tutorial",
      field: "guidance[0].target.position",
    });
  });

  it.each([Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid beat time %s",
    (timeMs) => {
      const definition = createDefinition();
      (definition.scenes[0].beats[0] as { timeMs: number }).timeMs = timeMs;

      expect(diagnosticFor(definition, "invalid-beat-time")).toMatchObject({
        sceneId: "tutorial",
        field: "beats[0].timeMs",
      });
    },
  );

  it("rejects beat times that are not strictly increasing", () => {
    const definition = createDefinition();
    const beats = definition.scenes[0].beats as Array<
      (typeof definition.scenes)[number]["beats"][number]
    >;
    beats.push({ ...structuredClone(beats[0]), id: "later-beat", timeMs: 0 });

    expect(diagnosticFor(definition, "out-of-order-beat-time")).toMatchObject({
      sceneId: "tutorial",
      field: "beats[1].timeMs",
    });
  });

  it("rejects a playable scene without authored map topology", () => {
    const definition = createDefinition();
    delete (definition.scenes[0] as { mapTopology?: unknown }).mapTopology;

    expect(diagnosticFor(definition, "missing-playable-map")).toMatchObject({
      sceneId: "tutorial",
      field: "mapTopology",
    });
  });

  it.each(["spawns", "destinations"] as const)(
    "rejects playable scenes with fewer %s than campaign officers",
    (collection) => {
      const definition = createDefinition();
      (definition.officers as Array<(typeof definition.officers)[number]>).push({
        ...definition.officers[0],
        id: "second-officer",
        name: "두 번째 장교",
      });
      const topology = definition.scenes[0].mapTopology!;
      const otherCollection = collection === "spawns" ? "destinations" : "spawns";
      (topology[otherCollection] as Array<(typeof topology)[typeof otherCollection][number]>).push({
        id: `second-${otherCollection}`,
        position: otherCollection === "spawns" ? { x: 0, y: 1 } : { x: 3, y: 2 },
      });

      expect(diagnosticFor(definition, "insufficient-map-locations")).toMatchObject({
        sceneId: "tutorial",
        field: `mapTopology.${collection}`,
      });
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid playable duration %s",
    (durationMs) => {
      const definition = createDefinition();
      (definition.scenes[0].encounterParameters as { durationMs: number }).durationMs = durationMs;

      expect(diagnosticFor(definition, "invalid-playable-duration")).toMatchObject({
        sceneId: "tutorial",
        field: "encounterParameters.durationMs",
      });
    },
  );

  it("rejects a beat outside the playable scene duration", () => {
    const definition = createDefinition();
    (definition.scenes[0].beats[0] as { timeMs: number }).timeMs = 60_001;

    expect(diagnosticFor(definition, "invalid-beat-time")).toMatchObject({
      sceneId: "tutorial",
      field: "beats[0].timeMs",
    });
  });

  it("rejects a threat that cannot finish before the operation ends", () => {
    const definition = createDefinition();
    (definition.scenes[0].beats[0] as { timeMs: number }).timeMs = 59_500;

    expect(diagnosticFor(definition, "invalid-threat-telegraph-duration")).toMatchObject({
      sceneId: "tutorial",
      field: "beats[0].threats[0].telegraphDurationMs",
    });
  });

  it.each([
    ["retry", [{ outcomeId: "complete", targetSceneId: "operation" }]],
    ["non-retry", [{ outcomeId: "retry", targetSceneId: "tutorial" }]],
  ] as const)("rejects a playable scene without a %s transition", (_kind, transitions) => {
    const definition = createDefinition();
    (definition.scenes[0] as unknown as { transitions: CampaignTransition[] }).transitions = [...transitions];

    expect(diagnosticFor(definition, "missing-playable-transition")).toMatchObject({
      sceneId: "tutorial",
      field: "transitions",
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid simulation speed %s",
    (simulationSpeed) => {
      const definition = createDefinition();
      (definition.scenes[0].gameplayTuning as { simulationSpeed: number }).simulationSpeed = simulationSpeed;

      expect(diagnosticFor(definition, "invalid-simulation-speed")).toMatchObject({
        sceneId: "tutorial",
        field: "gameplayTuning.simulationSpeed",
      });
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid threat telegraph duration %s",
    (telegraphDurationMs) => {
      const definition = createDefinition();
      const threat = definition.scenes[0].beats[0].threats[0] as {
        telegraphDurationMs: number;
      };
      threat.telegraphDurationMs = telegraphDurationMs;

      expect(
        diagnosticFor(definition, "invalid-threat-telegraph-duration"),
      ).toMatchObject({
        sceneId: "tutorial",
        field: "beats[0].threats[0].telegraphDurationMs",
      });
    },
  );

  it("rejects missing transition targets", () => {
    const definition = createDefinition();
    const transitions = definition.scenes[0].transitions as CampaignTransition[];
    transitions[1] = { outcomeId: "complete", targetSceneId: "missing" };

    expect(diagnosticFor(definition, "missing-transition-target")).toMatchObject({
      sceneId: "tutorial",
      field: "transitions[1].targetSceneId",
    });
  });

  it("rejects unreachable scenes", () => {
    const definition = createDefinition();
    const unreachable = createScene("bonus-operation", "operation", [
      { outcomeId: "victory", targetSceneId: "epilogue" },
    ]);
    (definition.scenes as CampaignScene[]).push(unreachable);

    expect(diagnosticFor(definition, "unreachable-scene")).toMatchObject({
      sceneId: "bonus-operation",
      field: "identity.id",
    });
  });

  it("rejects an invalid start scene", () => {
    const definition = createDefinition();
    (definition as { startSceneId: string }).startSceneId = "missing";

    expect(diagnosticFor(definition, "invalid-start-scene")).toMatchObject({
      sceneId: "missing",
      field: "startSceneId",
    });
  });

  it("rejects a non-terminal epilogue", () => {
    const definition = createDefinition();
    (definition.scenes[2].transitions as CampaignTransition[]).push({
      outcomeId: "restart",
      targetSceneId: "tutorial",
    });

    expect(diagnosticFor(definition, "non-terminal-epilogue")).toMatchObject({
      sceneId: "epilogue",
      field: "transitions",
    });
  });

  it("rejects a campaign with no reachable epilogue", () => {
    const definition = createDefinition();
    const transitions = definition.scenes[1].transitions as CampaignTransition[];
    transitions[0] = { outcomeId: "victory", targetSceneId: "tutorial" };

    expect(diagnosticFor(definition, "no-reachable-epilogue")).toMatchObject({
      sceneId: "tutorial",
      field: "startSceneId",
    });
  });

  it("rejects ambiguous outcome identifiers before progress starts", () => {
    const definition = createDefinition();
    (definition.scenes[0].transitions as CampaignTransition[]).push({
      outcomeId: "complete",
      targetSceneId: "epilogue",
    });

    expect(diagnosticFor(definition, "duplicate-outcome-id")).toMatchObject({
      sceneId: "tutorial",
      field: "transitions[2].outcomeId",
    });
    expect(() => createCampaignProgress(definition)).toThrow(
      CampaignValidationError,
    );
  });
});

describe("campaign progress", () => {
  it("traverses tutorial to operation to the terminal epilogue", () => {
    const progress = createCampaignProgress(createDefinition());

    expect(progress.snapshot()).toEqual({
      currentSceneId: "tutorial",
      completedSceneIds: [],
      completed: false,
    });
    expect(progress.recordOutcome("complete")).toEqual({
      currentSceneId: "operation",
      completedSceneIds: ["tutorial"],
      completed: false,
    });
    expect(progress.recordOutcome("victory")).toEqual({
      currentSceneId: "epilogue",
      completedSceneIds: ["tutorial", "operation"],
      completed: true,
    });
  });

  it("follows retry paths without marking the current scene complete", () => {
    const progress = createCampaignProgress(createDefinition());

    expect(progress.recordOutcome("retry")).toEqual({
      currentSceneId: "tutorial",
      completedSceneIds: [],
      completed: false,
    });
    progress.recordOutcome("complete");
    expect(progress.recordOutcome("retry")).toEqual({
      currentSceneId: "operation",
      completedSceneIds: ["tutorial"],
      completed: false,
    });
  });

  it("follows only declared transitions and preserves state after rejection", () => {
    const progress = createCampaignProgress(createDefinition());
    const initial = progress.snapshot();

    expect(() => progress.recordOutcome("unknown")).toThrow(
      CampaignProgressError,
    );
    expect(progress.snapshot()).toEqual(initial);
  });

  it("resets to the declared entry scene", () => {
    const progress = createCampaignProgress(createDefinition());

    progress.recordOutcome("complete");
    progress.recordOutcome("victory");

    expect(progress.reset()).toEqual({
      currentSceneId: "tutorial",
      completedSceneIds: [],
      completed: false,
    });
  });

  it("restores a validated campaign checkpoint", () => {
    const progress = createCampaignProgress(createDefinition(), {
      currentSceneId: "operation",
      completedSceneIds: ["tutorial"],
      completed: false,
    });

    expect(progress.snapshot()).toEqual({
      currentSceneId: "operation",
      completedSceneIds: ["tutorial"],
      completed: false,
    });
    expect(() => createCampaignProgress(createDefinition(), {
      currentSceneId: "missing",
      completedSceneIds: ["tutorial"],
      completed: false,
    })).toThrow(CampaignProgressError);
  });

  it("isolates source data, returned definitions, scenes, and snapshots", () => {
    const source = createDefinition();
    const progress = createCampaignProgress(source);

    (source as { startSceneId: string }).startSceneId = "epilogue";
    (source.scenes[0].identity as { id: string }).id = "mutated-source";

    const returnedDefinition = progress.definition();
    (returnedDefinition as { startSceneId: string }).startSceneId = "epilogue";
    (returnedDefinition.scenes[0].identity as { id: string }).id =
      "mutated-return";

    const returnedScene = progress.currentScene();
    (returnedScene.identity as { id: string }).id = "mutated-scene";

    const returnedSnapshot = progress.snapshot();
    (returnedSnapshot as { currentSceneId: string }).currentSceneId = "epilogue";
    (returnedSnapshot.completedSceneIds as string[]).push("epilogue");

    expect(progress.definition().startSceneId).toBe("tutorial");
    expect(progress.definition().scenes[0].identity.id).toBe("tutorial");
    expect(progress.currentScene().identity.id).toBe("tutorial");
    expect(progress.snapshot()).toEqual({
      currentSceneId: "tutorial",
      completedSceneIds: [],
      completed: false,
    });
    expect(progress.recordOutcome("complete").currentSceneId).toBe("operation");
  });
});
