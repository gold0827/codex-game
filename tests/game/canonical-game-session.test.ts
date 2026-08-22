import { describe, expect, it } from "vitest";

import { createProductionCampaignOperationFactory } from "../../src/application/campaign-operation";
import { createGameSession } from "../../src/application/game-session";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

const operationFactory = createProductionCampaignOperationFactory(chuncheonAutonomousBattle);

describe("canonical game session", () => {
  it("runs briefing, autonomous operation, limited formation intervention, and debrief", () => {
    const session = createGameSession(
      chuncheonCampaign,
      "canonical-session",
      undefined,
      { operationFactory },
    );

    expect(session.read()).toMatchObject({ phase: "briefing", operation: null });
    const started = session.dispatch({ type: "start-attempt" });
    expect(started.phase).toBe("operation");
    expect(started.operation?.formations.map(({ actors }) => actors.length)).toEqual(
      chuncheonAutonomousBattle.formations.map(({ actors }) => actors.length),
    );

    const formation = started.operation?.formations[0];
    if (!formation) throw new Error("The prototype needs one formation.");
    const intervened = session.dispatch({
      type: "set-formation-intent",
      formationId: formation.id,
      intentId: "delay-then-withdraw",
    });
    expect(intervened.lastIntervention).toMatchObject({
      status: "accepted",
      kind: "set-formation-intent",
    });
    expect(intervened.operation?.interventionBudget).toMatchObject({ spent: 1, count: 1 });

    for (let index = 0; index < 4; index += 1) {
      session.dispatch({
        type: "set-formation-intent",
        formationId: formation.id,
        intentId: "delay-then-withdraw",
      });
    }
    expect(session.read().lastIntervention).toMatchObject({
      status: "rejected",
      reason: "insufficient-budget",
    });

    session.advance(chuncheonAutonomousBattle.durationMs);
    const terminal = session.read();
    expect(terminal.phase).toBe("debrief");
    expect(terminal.debrief?.objectives.map(({ evidence }) => evidence.length))
      .toEqual(chuncheonAutonomousBattle.objectives.map(() => 1));
  });

  it("returns isolated canonical snapshots and validates session-only controls", () => {
    const session = createGameSession(
      chuncheonCampaign,
      "canonical-isolation",
      undefined,
      { operationFactory },
    );
    session.dispatch({ type: "start-attempt" });
    const mutable = session.read() as unknown as {
      operation: { formations: Array<{ label: string }> };
    };
    mutable.operation.formations[0]!.label = "호출자 변경";
    expect(session.read().operation?.formations[0]?.label).not.toBe("호출자 변경");

    session.dispatch({ type: "pause" });
    const elapsed = session.read().operation?.elapsedMs;
    session.advance(1_000);
    expect(session.read().operation?.elapsedMs).toBe(elapsed);
    session.dispatch({ type: "resume" });
    session.dispatch({ type: "set-player-speed", speed: 2 });
    expect(session.read()).toMatchObject({ paused: false, playerSpeed: 2 });
  });
});
