import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import {
  bridgeDefenseCampaign,
  bridgeDefenseMapSkin,
  bridgeDefenseOperation,
} from "../../src/scenarios/bridgeDefenseOperation";

describe("bridge-defense tutorial and debrief integration", () => {
  it("runs the guidance, all three signals, and six attention through the session seam", () => {
    const session = createGameSession(bridgeDefenseCampaign, "bridge-tutorial");
    session.dispatch({ type: "start-attempt" });

    expect(session.read().tutorial.currentStep?.action).toBe("pause");
    session.dispatch({ type: "pause" });
    expect(session.read().tutorial.currentStep?.action).toBe("inspect");
    session.dispatch({ type: "inspect-officer", officerId: "captain-han" });
    expect(session.read().tutorial.currentStep?.action).toBe("resume");
    session.dispatch({ type: "resume" });
    expect(session.read().tutorial.currentStep).toBeNull();

    const [north, bridge, south] = bridgeDefenseMapSkin.crossings;
    if (!north || !bridge || !south) throw new Error("Missing bridge crossing fixture.");
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "investigate",
      strength: 1,
      position: north.position,
    });
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "defend",
      strength: 2,
      position: bridge.position,
    });
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "avoid",
      strength: 3,
      position: south.position,
    });

    expect(session.read().operation).toMatchObject({
      metrics: { attentionSpent: 6, interventionCount: 3 },
      signals: [
        expect.objectContaining({ kind: "investigate", strength: 1 }),
        expect.objectContaining({ kind: "defend", strength: 2 }),
        expect.objectContaining({ kind: "avoid", strength: 3 }),
      ],
    });
  });

  it("finishes the real operation in a debrief with authored objective copy", () => {
    const session = createGameSession(bridgeDefenseCampaign, "bridge-debrief");
    session.dispatch({ type: "start-attempt" });
    session.advance(bridgeDefenseOperation.encounterParameters.durationMs);

    expect(session.read()).toMatchObject({
      phase: "debrief",
      operation: { status: "success", outcomeId: "success" },
      debrief: {
        status: "success",
        outcomeId: "success",
        copy: bridgeDefenseOperation.copy.success,
      },
    });
    expect(session.read().operation?.objectives).toEqual([
      expect.objectContaining({ id: "preserve-haein-bridge", completed: true }),
      expect.objectContaining({ id: "preserve-civilian-column", completed: true }),
    ]);
  });
});
