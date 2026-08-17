import { describe, expect, it } from "vitest";

import type { CampaignScene } from "../../src/campaign";
import { createGameSession } from "../../src/application/game-session";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import {
  bridgeDefenseOfficers,
  bridgeDefenseOperation,
} from "../../src/scenarios/bridgeDefenseOperation";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
import {
  BALANCED_HARNESS,
  type SpatialSignalKind,
} from "../../src/simulation/simulationTypes";

const scene = completeCampaign.scenes.find(({ identity }) => identity.kind === "tutorial") as CampaignScene;
const target = { x: 12, y: 8 } as const;

describe("spatial command signal runtime", () => {
  it.each([
    ["investigate", 1],
    ["defend", 2],
    ["avoid", 3],
  ] as const)("issues %s at strength %i and spends that much attention", (signal, strength) => {
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      `signal-${signal}`,
      BALANCED_HARNESS,
    );

    simulation.intervene({ kind: "issue-spatial-signal", signal, strength, position: target });

    expect(simulation.snapshot()).toMatchObject({
      metrics: { interventionCount: 1, attentionSpent: strength },
      signals: [{ kind: signal, strength, position: target, issuedAtMs: 0 }],
    });
    expect(simulation.replay().find(({ data }) => data.event === "signal-issued")).toMatchObject({
      kind: "intervention",
      data: { signal, strength, x: target.x, y: target.y },
    });
  });

  it("lets officers ignore or delay a weak signal and changes only reacting officers' beliefs", () => {
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "weak-signal-response",
      BALANCED_HARNESS,
    );
    simulation.intervene({ kind: "issue-spatial-signal", signal: "investigate", strength: 1, position: target });
    simulation.advance(6_000);

    const signal = simulation.snapshot().signals[0];
    const ignored = signal?.recipients.filter(({ response }) => response === "ignored") ?? [];
    const accepted = signal?.recipients.filter(({ response }) => response === "accepted") ?? [];
    const deliveryResponses = simulation.replay()
      .filter(({ data }) => data.event === "signal-delivered")
      .map(({ data }) => data.response);

    expect(deliveryResponses).toContain("ignored");
    expect(deliveryResponses).toContain("delayed");
    expect(ignored.length).toBeGreaterThan(0);
    expect(accepted.length).toBeGreaterThan(0);
    ignored.forEach(({ officerId }) => {
      expect(simulation.snapshot().officers.find(({ id }) => id === officerId)?.beliefs)
        .not.toContainEqual(expect.objectContaining({ subjectId: signal?.id }));
    });
    accepted.forEach(({ officerId }) => {
      expect(simulation.snapshot().officers.find(({ id }) => id === officerId)?.beliefs)
        .toContainEqual(expect.objectContaining({ subjectId: signal?.id, category: "signal" }));
    });
  });

  it.each([
    ["investigate", "investigate"],
    ["defend", "defend"],
    ["avoid", "retreat"],
  ] as const)("makes an accepted %s signal alter later DecisionTrace to %s", (signal, action) => {
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      `strong-${signal}`,
      BALANCED_HARNESS,
    );
    const before = simulation.snapshot().officers.map(({ committedAction }) => committedAction?.trace);
    simulation.intervene({
      kind: "issue-spatial-signal",
      signal: signal as SpatialSignalKind,
      strength: 3,
      position: target,
    });
    simulation.advance(8_000);

    const after = simulation.snapshot().officers.map(({ committedAction }) => committedAction?.trace);
    expect(after).not.toEqual(before);
    expect(after.every((trace) => trace?.selectedAction.kind === action)).toBe(true);
    expect(after.every((trace) => trace?.selectedAction.target.id === `${target.x},${target.y}`)).toBe(true);
  });

  it("stops an old bridge signal from dictating every later threat decision", () => {
    const simulation = createOperationSimulation(
      bridgeDefenseOperation,
      bridgeDefenseOfficers,
      0,
      BALANCED_HARNESS,
    );
    simulation.intervene({
      kind: "issue-spatial-signal",
      signal: "defend",
      strength: 2,
      position: { x: 11, y: 7 },
    });

    simulation.advance(21_000);

    const actions = simulation.snapshot().officers.map(
      ({ committedAction }) => committedAction?.trace.selectedAction.kind,
    );
    expect(actions.every((action) => action === "defend")).toBe(false);
  });

  it("rejects a signal whose strength would exceed the authored attention budget without mutation", () => {
    const simulation = createOperationSimulation(scene, completeCampaign.officers, "attention-budget", BALANCED_HARNESS);
    simulation.intervene({ kind: "issue-spatial-signal", signal: "defend", strength: 3, position: target });
    const before = simulation.snapshot();
    const replayBefore = simulation.replay();

    expect(() => simulation.intervene({
      kind: "issue-spatial-signal",
      signal: "avoid",
      strength: 2,
      position: target,
    })).toThrow(/attention budget/);
    expect(simulation.snapshot()).toEqual(before);
    expect(simulation.replay()).toEqual(replayBefore);
  });

  it("crosses the GameCommand seam without exposing a signal UI", () => {
    const session = createGameSession(completeCampaign, "signal-command-seam");
    session.dispatch({ type: "start-attempt" });
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "defend",
      strength: 2,
      position: target,
    });

    expect(session.read().operation).toMatchObject({
      metrics: { attentionSpent: 2 },
      signals: [{ kind: "defend", strength: 2, position: target }],
    });
  });
});

describe("report transmission effects", () => {
  it("distorts a weak transmission, verifies only received beliefs, and updates source trust before later decisions", () => {
    const harness = {
      ...BALANCED_HARNESS,
      informationReach: 0.5,
      verificationDepth: 0.4,
      feedbackCompression: 0,
    };
    const simulation = createOperationSimulation(scene, completeCampaign.officers, "report-trust", harness);
    const queued = simulation.snapshot().messages[0];
    if (!queued) throw new Error("Missing authored report fixture.");
    const nonRecipients = simulation.snapshot().officers.filter(
      ({ id }) => id !== queued.sourceOfficerId && !queued.recipientOfficerIds.includes(id),
    );

    simulation.advance(queued.deliveryAtMs);
    const delivered = simulation.snapshot();
    const recipient = delivered.officers.find(({ id }) => id === queued.recipientOfficerIds[0]);
    const beforeVerification = recipient?.beliefs.find(({ subjectId }) => subjectId === queued.authoredReportId);
    const traceBeforeVerification = recipient?.committedAction?.trace;

    expect(queued.receivedText).toMatch(/^\[불확실한 송신\]/);
    expect(beforeVerification).toMatchObject({
      assertion: queued.receivedText,
      verificationState: "pending",
    });
    nonRecipients.forEach((officer) => {
      expect(delivered.officers.find(({ id }) => id === officer.id)?.beliefs)
        .not.toContainEqual(expect.objectContaining({ subjectId: queued.authoredReportId }));
    });

    simulation.advance(6_000);
    const verified = simulation.snapshot();
    const recipientAfter = verified.officers.find(({ id }) => id === recipient?.id);
    const beliefAfter = recipientAfter?.beliefs.find(({ subjectId }) => subjectId === queued.authoredReportId);
    const learnedTrust = recipientAfter?.profile.sourceTrust.find(({ officerId }) => officerId === queued.sourceOfficerId);

    expect(verified.messages[0]?.verificationState).toBe("contradicted");
    expect(beliefAfter?.confidence).toBeLessThan(beforeVerification?.confidence ?? 1);
    expect(learnedTrust?.trust).toBeLessThan(0.7);
    expect(recipientAfter?.committedAction?.trace).not.toEqual(traceBeforeVerification);
  });
});
