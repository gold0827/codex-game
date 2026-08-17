import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { projectBattlefieldFrame } from "../../src/presentation/operation/battlefieldProjector";
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
    const session = createGameSession(bridgeDefenseCampaign, 1);
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
      expect.objectContaining({ id: "protect-civilian-column", completed: true }),
    ]);
  });

  it("projects artillery world events and the selected officer's causal decision", () => {
    const session = createGameSession(bridgeDefenseCampaign, "effect-probe");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0.05,
        authorityClarity: 0.05,
        verificationDepth: 0.05,
        feedbackCompression: 0.05,
      },
    });
    session.dispatch({ type: "start-attempt" });
    session.dispatch({ type: "inspect-officer", officerId: "captain-han" });
    session.advance(18_000);

    const snapshot = session.read();
    const eventIds = new Set(snapshot.operationEvents.map(({ id }) => id));
    const battlefield = projectBattlefieldFrame(snapshot);
    const effects = battlefield?.effects.filter(({ kind }) =>
      ["hit", "suppression", "retreat"].includes(kind),
    ) ?? [];
    expect(effects.map(({ kind }) => kind)).toEqual([
      "hit",
      "suppression",
      "retreat",
    ]);
    effects.forEach(({ id }) => expect(eventIds.has(id)).toBe(true));

    const view = projectGameViewModel(snapshot, {
      title: bridgeDefenseCampaign.title,
      sceneCount: bridgeDefenseCampaign.scenes.length,
      officers: bridgeDefenseCampaign.officers,
    });
    const selected = view.operation?.officers.find(({ selected }) => selected);
    expect(selected).toMatchObject({
      id: "captain-han",
      decision: {
        action: "방어",
        reasons: expect.arrayContaining([expect.stringContaining("위협")]),
        abandoned: expect.stringContaining("후퇴"),
      },
    });
  });
});
