import { describe, expect, it } from "vitest";

import {
  createGameSession,
  GameSessionError,
  type GameSession,
} from "../../src/application/game-session";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";

function advanceToOperationTime(session: GameSession, operationElapsedMs: number): void {
  session.advance(
    operationElapsedMs / session.read().scene.gameplayTuning.simulationSpeed,
  );
}

describe("game session", () => {
  it("exposes game flow only through read, dispatch, and advance", () => {
    const session = createGameSession(completeCampaign, "session-shape");

    expect(Object.keys(session).sort()).toEqual(["advance", "dispatch", "read"]);
    session.dispatch({ type: "configure-harness", axis: "informationReach", value: 0.2 });
    expect(session.read().harness.informationReach).toBe(0.2);
    session.dispatch({ type: "start-attempt" });
    expect(session.read().phase).toBe("operation");
    session.advance(1_000);
    expect(session.read().operation?.elapsedMs).toBeGreaterThan(0);
  });

  it("projects the operation event log without losing IDs, order, time, or data", () => {
    const session = createGameSession(completeCampaign, "session-events");
    session.dispatch({ type: "start-attempt" });
    const started = session.read();
    const simulation = createOperationSimulation(
      started.scene,
      completeCampaign.officers,
      started.attemptSeed,
      started.harness,
    );
    const durationMs = started.operation?.durationMs ?? 0;

    session.advance(durationMs / started.scene.gameplayTuning.simulationSpeed);
    simulation.advance(durationMs);

    const projected = session.read().operationEvents;
    expect(projected).toEqual(simulation.events());
    expect(projected.every((event, index) => event.sequence === index)).toBe(true);
    expect(projected.some(({ kind }) => kind === "unit-hit")).toBe(true);
    expect(projected.find(({ kind }) => kind === "unit-hit")).toMatchObject({
      id: expect.stringContaining(":event-"),
      timeMs: expect.any(Number),
      data: {
        actorId: expect.any(String),
        targetId: expect.any(String),
        damage: expect.any(Number),
      },
    });

    const firstId = projected[0]?.id;
    if (projected[0]) (projected[0] as { id: string }).id = "mutated";
    expect(session.read().operationEvents[0]?.id).toBe(firstId);
  });

  it("preserves phase, target, budget, and time error codes", () => {
    const session = createGameSession(completeCampaign, "session-errors");
    const codeOf = (action: () => unknown): string | undefined => {
      try {
        action();
      } catch (error) {
        return error instanceof GameSessionError ? error.code : undefined;
      }
      return undefined;
    };

    expect(codeOf(() => session.advance(1))).toBe("invalid-phase");
    expect(
      codeOf(() =>
        session.dispatch({
          type: "set-harness",
          harness: {
            informationReach: 1,
            authorityClarity: 1,
            verificationDepth: 1,
            feedbackCompression: 1,
          },
        }),
      ),
    ).toBe("harness-over-budget");

    session.dispatch({ type: "start-attempt" });
    expect(
      codeOf(() => session.dispatch({ type: "inspect-officer", officerId: "missing" })),
    ).toBe("invalid-target");
    expect(codeOf(() => session.advance(-1))).toBe("invalid-time");
  });

  it("keeps ordered tutorial guidance while commands cross the session boundary", () => {
    const session = createGameSession(completeCampaign, "session-tutorial");
    session.dispatch({ type: "start-attempt" });
    const routeStep = session.read().scene.guidance.find((step) => step.action === "route");
    if (!routeStep || routeStep.action !== "route") throw new Error("Missing route guidance");
    const reportBeat = session.read().scene.beats.find((beat) =>
      beat.reports.some(({ id }) => id === routeStep.target.reportId),
    );
    advanceToOperationTime(session, reportBeat?.timeMs ?? 0);

    session.dispatch({ type: "pause" });
    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });
    session.dispatch({
      type: "route-report",
      reportId: routeStep.target.reportId,
      recipientOfficerId: routeStep.target.recipientOfficerId,
    });
    session.dispatch({ type: "resume" });

    expect(session.read().tutorial.currentStep).toBeNull();
    expect(session.read().tutorial.completedStepIds).toEqual([
      "tutorial-pause",
      "tutorial-inspect",
      "tutorial-route",
      "tutorial-resume",
    ]);
  });
});
