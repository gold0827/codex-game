import { describe, expect, it, vi } from "vitest";

import {
  createCampaignOperation,
  type CampaignOperationFactory,
} from "../../src/application/campaign-operation";
import { createGameSession } from "../../src/application/game-session";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import type { OperationSimulation } from "../../src/simulation/simulationTypes";

describe("game session operation assembly", () => {
  it("assembles each attempt through the injected operation factory", () => {
    const assembledSimulations: OperationSimulation[] = [];
    const operationFactory: CampaignOperationFactory = vi.fn((launch, harness) => {
      const operation = createCampaignOperation(launch, harness);
      assembledSimulations.push(operation.simulation);
      return operation;
    });
    const session = createGameSession(
      completeCampaign,
      "operation-factory",
      undefined,
      { operationFactory },
    );
    const harness = {
      informationReach: 0.2,
      authorityClarity: 0.3,
      verificationDepth: 0.4,
      feedbackCompression: 0.5,
    };

    session.dispatch({ type: "set-harness", harness });
    session.dispatch({ type: "start-attempt" });

    expect(operationFactory).toHaveBeenCalledTimes(1);
    expect(operationFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scene: expect.objectContaining({
          identity: expect.objectContaining({ id: session.read().scene.identity.id }),
        }),
      }),
      harness,
    );
    expect(session.read().operation).toEqual(assembledSimulations[0]?.snapshot());

    session.advance(1_000);
    expect(session.read().operation?.elapsedMs).toBeGreaterThan(0);

    session.dispatch({ type: "reset" });
    session.dispatch({ type: "start-attempt" });

    expect(operationFactory).toHaveBeenCalledTimes(2);
    expect(assembledSimulations).toHaveLength(2);
    expect(session.read().operation).toEqual(assembledSimulations[1]?.snapshot());
  });
});
