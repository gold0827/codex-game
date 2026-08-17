import { describe, expect, it } from "vitest";

import { createGameSession, type GameSnapshot } from "../../src/application/game-session";
import {
  EFFECT_KINDS,
  effectAssetManifest,
} from "../../src/presentation/effects/effectAssets";
import {
  createEffectCueProjector,
  projectEffectTrack,
} from "../../src/presentation/effects/effectCueProjector";
import { sampleEffectTrack, type EffectTrack } from "../../src/presentation/effects/effectTrack";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
import type { HarnessConfiguration } from "../../src/simulation/simulationTypes";

const fixtureTrack: EffectTrack = {
  cues: [{
    id: "verify:baek:100",
    kind: "verification",
    position: { x: 4, y: 7 },
    startsAtMs: 100,
    endsAtMs: 1_100,
  }],
};

describe("operation-time effect track", () => {
  it("samples the same operation time identically regardless of renderer calls", () => {
    const first = sampleEffectTrack(fixtureTrack, 350);
    sampleEffectTrack(fixtureTrack, 900);
    const repeated = sampleEffectTrack(fixtureTrack, 350);

    expect(repeated).toEqual(first);
    expect(first[0]).toMatchObject({
      id: "verify:baek:100",
      kind: "verification",
      label: "검증",
      position: { x: 4, y: 7 },
      progress: 0.25,
    });
    expect(sampleEffectTrack(fixtureTrack, 99)).toEqual([]);
    expect(sampleEffectTrack(fixtureTrack, 1_100)).toEqual([]);
  });

  it("keeps semantic feedback while removing motion pulses", () => {
    const early = sampleEffectTrack(fixtureTrack, 200, true)[0];
    const late = sampleEffectTrack(fixtureTrack, 800, true)[0];

    expect(early).toMatchObject({ label: "검증", radius: 13, opacity: 1 });
    expect(late).toMatchObject({ label: "검증", radius: 13, opacity: 1 });
    expect(early?.progress).not.toBe(late?.progress);
  });

  it("declares a distinct, sub-two-second asset cue for every accepted effect", () => {
    expect(Object.keys(effectAssetManifest.effects)).toEqual(EFFECT_KINDS);
    const assets = EFFECT_KINDS.map((kind) => effectAssetManifest.effects[kind]);
    expect(new Set(assets.map(({ glyph }) => glyph)).size).toBe(EFFECT_KINDS.length);
    expect(assets.every(({ durationMs }) => durationMs <= 2_000)).toBe(true);
    expect(assets.map(({ audioCue }) => audioCue)).toEqual(EFFECT_KINDS);
  });

  it("projects currently runnable movement and verification at actor positions", () => {
    const session = createGameSession(completeCampaign, "effect-projector");
    session.dispatch({ type: "start-attempt" });
    const snapshot = session.read();
    const operation = snapshot.operation;
    const officer = operation?.officers[0];
    const actor = operation?.spatial.actors.find(({ actorId }) => actorId === officer?.id);
    if (!operation || !actor || !officer) throw new Error("Missing operation fixture");
    const projectedSnapshot: GameSnapshot = {
      ...snapshot,
      operation: {
        ...operation,
        elapsedMs: 500,
        spatial: {
          ...operation.spatial,
          actors: operation.spatial.actors.map((candidate) => candidate.actorId === officer.id
            ? { ...candidate, destination: { x: 8, y: 7 }, path: [{ x: 8, y: 7 }] }
            : candidate),
        },
        officers: operation.officers.map((candidate, index) => index === 0
          ? {
              ...candidate,
              committedAction: {
                startedAtMs: 100,
                endsAtMs: 900,
                trace: {
                  selectedAction: { kind: "verify", target: { kind: "belief", id: "report-a" } },
                  utility: 0.82,
                  topReason: "available evidence is uncertain",
                  abandonedAlternative: {
                    action: { kind: "move", target: { kind: "position", id: "8,7" } },
                    utility: 0.7,
                  },
                },
              },
            }
          : candidate),
      },
    };

    const cues = projectEffectTrack(projectedSnapshot).cues;
    expect(cues.map(({ kind }) => kind)).toEqual(expect.arrayContaining(["movement", "verification"]));
    expect(cues.find(({ id }) => id.startsWith(`movement:${officer.id}:`))?.position).toEqual(actor.position);
    expect(cues.find(({ id }) => id.startsWith(`verification:${officer.id}:`))?.position).toEqual(actor.position);
  });

  it("projects each world event ID once regardless of repeated renderer observations", () => {
    const session = createGameSession(completeCampaign, "effect-deltas");
    session.dispatch({ type: "start-attempt" });
    const initial = session.read();
    const operation = initial.operation;
    const firstUnit = operation?.units[0];
    const secondUnit = operation?.units[1];
    if (!operation || !firstUnit || !secondUnit) throw new Error("Missing combat fixture");
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "investigate",
      strength: 1,
      position: operation.spatial.actors[0]?.position ?? { x: 0, y: 0 },
    });
    const baseline = session.read();
    const baselineOperation = baseline.operation;
    if (!baselineOperation) throw new Error("Missing signal fixture");
    const projector = createEffectCueProjector();
    const baselineTrack = projector.observe(baseline);
    expect(baselineTrack.cues.some(({ kind }) => kind === "report")).toBe(true);

    const changed: GameSnapshot = {
      ...baseline,
      operationEvents: [
        ...baseline.operationEvents,
        {
          id: "fixture:event-hit",
          sequence: baseline.operationEvents.length,
          timeMs: 100,
          kind: "unit-hit",
          data: {
            actorId: secondUnit.officerId,
            targetId: firstUnit.officerId,
            damage: 26,
            remainingHealth: 74,
            inCover: false,
          },
        },
        {
          id: "fixture:event-suppressed",
          sequence: baseline.operationEvents.length + 1,
          timeMs: 100,
          kind: "unit-suppressed",
          data: {
            actorId: firstUnit.officerId,
            sourceId: secondUnit.officerId,
            suppression: 0.6,
          },
        },
        {
          id: "fixture:event-panic",
          sequence: baseline.operationEvents.length + 2,
          timeMs: 100,
          kind: "unit-froze",
          data: { actorId: firstUnit.officerId },
        },
        {
          id: "fixture:event-retreat",
          sequence: baseline.operationEvents.length + 3,
          timeMs: 100,
          kind: "unit-retreated",
          data: {
            actorId: secondUnit.officerId,
            sourceId: firstUnit.officerId,
            fromX: 1,
            fromY: 1,
            toX: 2,
            toY: 1,
          },
        },
      ],
      operation: {
        ...baselineOperation,
        elapsedMs: 100,
        units: baselineOperation.units.map((unit) => unit.officerId === firstUnit.officerId
          ? { ...unit, health: 74, suppression: 0.6, panicReaction: "freeze" }
          : unit),
        officers: baselineOperation.officers.map((officer) => {
          const action = officer.id === firstUnit.officerId ? "defend" : "retreat";
          if (officer.id !== firstUnit.officerId && officer.id !== secondUnit.officerId) return officer;
          return {
            ...officer,
            committedAction: {
              startedAtMs: 100,
              endsAtMs: 1_000,
              trace: {
                selectedAction: { kind: action, target: { kind: "area", id: "fixture" } },
                utility: 0.8,
                topReason: "local threat risk is high",
                abandonedAlternative: {
                  action: { kind: "move", target: { kind: "position", id: "fixture" } },
                  utility: 0.7,
                },
              },
            },
          };
        }),
      },
    };

    const changedTrack = projector.observe(changed);
    const kinds = sampleEffectTrack(changedTrack, 100).map(({ kind }) => kind);
    expect(kinds).toEqual(expect.arrayContaining([
      "attack",
      "hit",
      "suppression",
      "panic",
      "retreat",
    ]));
    expect(projector.observe(changed)).toEqual(changedTrack);
    expect(changedTrack.cues.filter(({ id }) => id === "fixture:event-hit")).toHaveLength(1);
    expect(changedTrack.cues.filter(({ id }) => id === "fixture:event-suppressed")).toHaveLength(1);
    expect(changedTrack.cues.filter(({ id }) => id === "fixture:event-panic")).toHaveLength(1);
    expect(changedTrack.cues.filter(({ id }) => id === "fixture:event-retreat")).toHaveLength(1);

    const settled: GameSnapshot = {
      ...changed,
      operation: { ...changed.operation!, elapsedMs: 2_100 },
    };
    const settledTrack = projector.observe(settled);
    const settledKinds = sampleEffectTrack(settledTrack, 2_100).map(({ kind }) => kind);
    expect(settledKinds).not.toContain("hit");
    expect(settledKinds).not.toContain("suppression");
    expect(settledKinds).not.toContain("panic");
    expect(settledTrack.cues.some(({ id }) => id === "fixture:event-hit")).toBe(true);
  });

  it("projects the real artillery encounter health, suppression, and retreat transition", () => {
    const scene = completeCampaign.scenes.find(
      ({ identity }) => identity.id === "misaddressed-artillery",
    );
    if (!scene) throw new Error("Missing artillery runtime fixture");
    const poorHarness: HarnessConfiguration = {
      informationReach: 0,
      authorityClarity: 0,
      verificationDepth: 0,
      feedbackCompression: 0,
    };
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      101,
      poorHarness,
    );
    const shellSession = createGameSession(completeCampaign, "effect-shell");
    shellSession.dispatch({ type: "start-attempt" });
    const shell = shellSession.read();
    const projector = createEffectCueProjector();

    simulation.advance(19_900);
    projector.observe({
      ...shell,
      scene,
      operation: simulation.snapshot(),
      operationEvents: simulation.events(),
      replay: simulation.replay(),
    });
    simulation.advance(100);
    const after = simulation.snapshot();
    const track = projector.observe({
      ...shell,
      scene,
      operation: after,
      operationEvents: simulation.events(),
      replay: simulation.replay(),
    });

    const kinds = sampleEffectTrack(track, after.elapsedMs).map(({ kind }) => kind);
    expect(kinds).toEqual(expect.arrayContaining(["hit", "suppression", "retreat"]));
    const affected = after.units.find(({ officerId }) => officerId === "captain-han");
    expect(affected?.health).toBeLessThan(100);
    expect(affected?.suppression).toBeGreaterThan(0);
    expect(affected?.panicReaction).toBe("retreat");
    const effectEventIds = new Set(track.cues.map(({ id }) => id));
    const visibleActorIds = new Set(after.spatial.actors.map(({ actorId }) => actorId));
    simulation.events()
      .filter(({ kind }) => ["unit-hit", "unit-suppressed", "unit-retreated"].includes(kind))
      .filter((event) => visibleActorIds.has(String(
        event.kind === "unit-hit" ? event.data.targetId : event.data.actorId,
      )))
      .forEach(({ id }) => expect(effectEventIds.has(id)).toBe(true));
  });

  it("creates the same world event cue track for segmented and one-shot advance", () => {
    const scene = completeCampaign.scenes.find(
      ({ identity }) => identity.id === "misaddressed-artillery",
    );
    if (!scene) throw new Error("Missing artillery runtime fixture");
    const poorHarness: HarnessConfiguration = {
      informationReach: 0,
      authorityClarity: 0,
      verificationDepth: 0,
      feedbackCompression: 0,
    };
    const single = createOperationSimulation(scene, completeCampaign.officers, 101, poorHarness);
    const segmented = createOperationSimulation(scene, completeCampaign.officers, 101, poorHarness);
    single.advance(20_000);
    [3_000, 7_000, 9_900, 100].forEach((elapsedMs) => segmented.advance(elapsedMs));
    const shellSession = createGameSession(completeCampaign, "effect-segmentation-shell");
    shellSession.dispatch({ type: "start-attempt" });
    const shell = shellSession.read();
    const snapshotFor = (simulation: typeof single): GameSnapshot => ({
      ...shell,
      scene,
      operation: simulation.snapshot(),
      operationEvents: simulation.events(),
      replay: simulation.replay(),
    });

    const singleTrack = createEffectCueProjector().observe(snapshotFor(single));
    const segmentedTrack = createEffectCueProjector().observe(snapshotFor(segmented));

    expect(segmented.events()).toEqual(single.events());
    expect(segmentedTrack).toEqual(singleTrack);
  });
});
