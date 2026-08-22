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

    expect(session.read()).toMatchObject({
      phase: "briefing",
      operation: null,
      debrief: null,
    });
    expect(session.read().briefing).not.toBeNull();
    const started = session.dispatch({ type: "start-attempt" });
    expect(started.phase).toBe("operation");
    expect(started.operation).not.toBeNull();
    expect(started.briefing).toBeNull();
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
    expect(terminal.operation).toBeNull();
    expect(terminal.briefing).toBeNull();
    expect(terminal.lastIntervention).toBeNull();
    expect(terminal.debrief?.objectives.map(({ evidence }) => evidence.length))
      .toEqual(chuncheonAutonomousBattle.objectives.map(() => 1));
  });

  it("hides the completed operation while preserving lesson progression into epilogue", () => {
    const session = createGameSession(
      chuncheonCampaign,
      "canonical-success-progression",
      undefined,
      { operationFactory },
    );
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 1,
        authorityClarity: 1,
        verificationDepth: 1,
        feedbackCompression: 0,
      },
    });
    session.dispatch({ type: "start-attempt" });
    session.advance(chuncheonAutonomousBattle.durationMs);

    const debrief = session.read();
    expect(debrief).toMatchObject({ phase: "debrief", operation: null });
    const lessonId = debrief.debrief?.lessonChoices[0]?.id;
    if (!lessonId) throw new Error("The successful operation must offer a role lesson.");

    const epilogue = session.dispatch({ type: "choose-lesson", lessonId });
    expect(epilogue).toMatchObject({
      phase: "epilogue",
      briefing: null,
      operation: null,
      debrief: null,
    });
    expect(epilogue.roleMemory.flatMap(({ lessons }) => lessons)).toHaveLength(1);
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
