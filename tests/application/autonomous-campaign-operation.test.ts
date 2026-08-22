import { describe, expect, it, vi } from "vitest";

import {
  createCampaignOperationFactory,
  createProductionCampaignOperationFactory,
} from "../../src/application/campaign-operation";
import { createCampaignRun, type OperationLaunch } from "../../src/campaign";
import type {
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleInterventionResult,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../../src/domain/operation/operationEngine";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

const definition: AutonomousBattleDefinition = {
  id: "adapter-battle",
  durationMs: 1_000,
  formations: [{
    id: "screen",
    label: "전방 엄호대",
    sideId: "rok",
    initialLocationId: "north-road",
    initialIntentId: "delay",
    entry: { kind: "present" },
    actors: [{
      id: "rifle-role-1",
      label: "소총수 역할 1",
      role: "소총수",
      profile: {
        initiative: 0.7,
        caution: 0.6,
        discipline: 0.8,
        cooperation: 0.75,
        stressTolerance: 0.7,
        memoryCapacity: 3,
        sourceTrust: [],
      },
      variability: {
        decisionNoise: 0.15,
        executionNoise: 0.1,
      },
    }],
  }],
  objectives: [{
    id: "delay",
    label: "진격 지연",
    required: true,
  }],
};

const harness: AutonomousBattleHarnessPolicies = {
  informationReach: 0.8,
  authorityClarity: 0.7,
  verificationDepth: 0.6,
  feedbackCompression: 0.5,
};

function launch(): OperationLaunch {
  const current = createCampaignRun(chuncheonCampaign, "campaign-adapter-seed").read().launch;
  if (!current) throw new Error("The campaign fixture must provide an operation launch.");
  return current;
}

function snapshot(
  resolution: AutonomousBattleSnapshot["resolution"] = { state: "running" },
): AutonomousBattleSnapshot {
  return {
    battleId: definition.id,
    elapsedMs: resolution.state === "running" ? 0 : resolution.resolvedAtMs,
    durationMs: definition.durationMs,
    resolution,
    harness: {
      policies: harness,
      consequences: [],
    },
    formations: [],
    objectives: [{
      id: "delay",
      label: "진격 지연",
      required: true,
      progress: resolution.state === "running" ? 0 : 1,
      state: resolution.state === "running" ? "active" : "achieved",
      evidence: [],
    }],
    interventionBudget: {
      available: 4,
      spent: 0,
      remaining: 4,
      count: 0,
    },
    recentEvents: {
      capacity: 8,
      firstSequence: 0,
      nextSequence: 0,
      items: [],
    },
  };
}

function controlledFactory(initial = snapshot()) {
  let current = initial;
  let capturedDefinition: AutonomousBattleDefinition | null = null;
  let capturedOptions: Parameters<AutonomousBattleSimulationFactory>[1] | null = null;
  const advance = vi.fn((_deltaMs: number) => current);
  const interventionResult: AutonomousBattleInterventionResult = {
    snapshot: current,
    receipt: {
      status: "accepted",
      id: "receipt:1",
      kind: "set-formation-intent",
      appliedAtMs: 0,
      cost: 1,
      affectedFormationIds: ["screen"],
    },
  };
  const intervene = vi.fn(() => interventionResult);
  const factory: AutonomousBattleSimulationFactory = vi.fn((suppliedDefinition, options) => {
    capturedDefinition = suppliedDefinition;
    capturedOptions = options;
    return {
      snapshot: () => current,
      advance,
      intervene,
    };
  });

  return {
    factory,
    advance,
    intervene,
    interventionResult,
    capturedDefinition: () => capturedDefinition,
    capturedOptions: () => capturedOptions,
    resolve(disposition: "success" | "failure", outcomeId: string) {
      current = snapshot({
        state: "resolved",
        disposition,
        outcomeId,
        resolvedAtMs: definition.durationMs,
      });
    },
  };
}

describe("autonomous campaign operation Adapter", () => {
  it("passes isolated launch options and preserves canonical simulation results", () => {
    const controlled = controlledFactory();
    const suppliedLaunch = launch();
    const suppliedHarness = structuredClone(harness);
    const createOperation = createCampaignOperationFactory(
      definition,
      controlled.factory,
    );
    const operation = createOperation(suppliedLaunch, suppliedHarness);

    expect(controlled.factory).toHaveBeenCalledOnce();
    expect(controlled.capturedDefinition()).toEqual(definition);
    expect(controlled.capturedDefinition()).not.toBe(definition);
    expect(controlled.capturedOptions()).toEqual({
      seed: suppliedLaunch.seed,
      harness,
      interventionBudget: suppliedLaunch.scene.gameplayTuning.interventionBudget,
    });
    expect(controlled.capturedOptions()?.harness).not.toBe(suppliedHarness);

    expect(operation.read()).toBe(controlled.interventionResult.snapshot);
    expect(operation.advance(250)).toBe(controlled.interventionResult.snapshot);
    expect(controlled.advance).toHaveBeenCalledWith(250);

    const command = {
      kind: "set-formation-intent" as const,
      formationId: "screen",
      intentId: "withdraw-in-bounds",
    };
    expect(operation.intervene(command)).toBe(controlled.interventionResult);
    expect(controlled.intervene).toHaveBeenCalledWith(command);
  });

  it("rejects early result reads and maps terminal outcomes to isolated campaign results", () => {
    const controlled = controlledFactory();
    const suppliedLaunch = structuredClone(launch());
    const expectedLesson = suppliedLaunch.scene.copy.lesson;
    const operation = createCampaignOperationFactory(
      definition,
      controlled.factory,
    )(suppliedLaunch, harness);

    expect(() => operation.result()).toThrow(
      "only available after the operation resolves",
    );

    (suppliedLaunch.scene.copy as { lesson: string }).lesson = "호출자 변경";
    controlled.resolve("success", "delay-achieved");
    const success = operation.result();
    expect(success).toEqual({
      sceneId: suppliedLaunch.scene.identity.id,
      status: "success",
      outcomeId: "delay-achieved",
      lessonChoices: suppliedLaunch.officers.map(({ id }) => ({
        id: `${suppliedLaunch.scene.identity.id}:${id}:lesson`,
        officerId: id,
        summary: expectedLesson,
      })),
    });

    const failed = controlledFactory();
    const failedOperation = createCampaignOperationFactory(
      definition,
      failed.factory,
    )(launch(), harness);
    failed.resolve("failure", "delay-line-broken");
    expect(failedOperation.result()).toMatchObject({
      status: "retry",
      outcomeId: "delay-line-broken",
      lessonChoices: [],
    });
  });

  it("binds the production canonical runtime behind the same Interface", () => {
    const createOperation = createProductionCampaignOperationFactory(definition);
    const operation = createOperation(launch(), harness);

    expect(operation.read()).toMatchObject({
      battleId: definition.id,
      resolution: { state: "running" },
    });
    const terminal = operation.advance(definition.durationMs);
    expect(terminal.resolution.state).toBe("resolved");
    if (terminal.resolution.state === "running") {
      throw new Error("The production autonomous operation must resolve at its duration.");
    }
    expect(operation.result()).toMatchObject({
      status: terminal.resolution.disposition === "success" ? "success" : "retry",
      outcomeId: terminal.resolution.outcomeId,
    });
  });

  it("rejects snapshots from a different battle without translating them", () => {
    const foreign = controlledFactory({
      ...snapshot(),
      battleId: "foreign-battle",
    });
    const operation = createCampaignOperationFactory(
      definition,
      foreign.factory,
    )(launch(), harness);

    expect(() => operation.read()).toThrow("does not belong to battle");
  });
});
