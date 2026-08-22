import { describe, expect, it } from "vitest";
import { createSquadBattleSession } from "../../src/application/squad-battle-session";

describe("squad battle session", () => {
  it("advances fixed battle time using the selected player speed", () => {
    const session = createSquadBattleSession("session-speed");
    session.dispatch({ type: "set-speed", speed: 2 });

    expect(session.advance(2_499).battle.elapsedMs).toBe(0);
    expect(session.advance(1).battle.elapsedMs).toBe(5_000);
    expect(session.read().speed).toBe(2);
  });

  it("pauses, resumes, and routes player battle commands", () => {
    const session = createSquadBattleSession("session-command");
    session.dispatch({
      type: "battle-command",
      command: { kind: "order", squadId: "main", order: "advance" },
    });
    session.dispatch({ type: "pause" });

    expect(session.advance(10_000)).toMatchObject({
      paused: true,
      battle: { elapsedMs: 0 },
    });
    expect(session.read().battle.squads.find(({ id }) => id === "main")?.pendingOrder)
      .toMatchObject({ order: "advance", arrivesAtMs: 5_000 });

    session.dispatch({ type: "resume" });
    expect(session.advance(5_000).battle.squads.find(({ id }) => id === "main"))
      .toMatchObject({ order: "advance", pendingOrder: null });
  });

  it("resets the same deterministic round and playback controls", () => {
    const session = createSquadBattleSession("session-reset");
    session.dispatch({ type: "set-speed", speed: 0.5 });
    session.dispatch({ type: "battle-command", command: { kind: "deploy-relief", route: "north" } });
    session.advance(20_000);

    expect(session.dispatch({ type: "reset" })).toMatchObject({
      paused: false,
      speed: 1,
      battle: {
        elapsedMs: 0,
        bridgeIntegrity: 100,
        convoyProgress: 0,
      },
    });
    expect(session.read().battle.squads.find(({ id }) => id === "relief")?.active).toBe(false);
  });

  it("rejects invalid real elapsed time", () => {
    const session = createSquadBattleSession("session-invalid-time");
    expect(() => session.advance(Number.NaN)).toThrow(RangeError);
    expect(() => session.advance(-1)).toThrow(RangeError);
  });
});
