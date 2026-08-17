import { describe, expect, it } from "vitest";

import {
  createGameSession,
  type GameSnapshot,
} from "../../src/application/game-session";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { projectBattlefieldFrame } from "../../src/presentation/operation/battlefieldProjector";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { bridgeDefenseCampaign } from "../../src/scenarios/bridgeDefenseOperation";

const campaignView = {
  title: completeCampaign.title,
  sceneCount: completeCampaign.scenes.length,
  officers: completeCampaign.officers,
};

function operationSnapshot(): GameSnapshot {
  const session = createGameSession(completeCampaign, "operation-projector");
  session.dispatch({ type: "start-attempt" });
  return session.read();
}

describe("operation presentation projector", () => {
  it("projects a renderer-neutral battlefield frame from the spatial world", () => {
    const snapshot = operationSnapshot();
    const operation = snapshot.operation;
    if (!operation) throw new Error("Missing operation fixture.");

    const frame = projectBattlefieldFrame(snapshot);
    expect(frame?.map).toMatchObject({
      id: snapshot.scene.presentation.mapId,
      width: snapshot.scene.mapTopology?.width,
      height: snapshot.scene.mapTopology?.height,
      tiles: expect.arrayContaining([
        expect.objectContaining({ kind: "blocked" }),
        expect.objectContaining({ kind: "rough" }),
      ]),
    });
    expect(frame?.map.locations).toHaveLength(
      (snapshot.scene.mapTopology?.spawns.length ?? 0) +
      (snapshot.scene.mapTopology?.destinations.length ?? 0),
    );
    expect(frame?.actors).toHaveLength(operation.spatial.actors.length);
    expect(frame?.threats).toEqual([]);
    expect(frame?.effects.some(({ kind }) => kind === "movement")).toBe(true);
    frame?.actors.forEach((actor) => {
      const spatialActor = operation.spatial.actors.find(({ actorId }) => actorId === actor.id);
      expect(actor.position).toEqual(spatialActor?.position);
      expect(Object.keys(actor).sort()).toEqual([
        "action",
        "cues",
        "facing",
        "health",
        "id",
        "position",
        "selected",
      ]);
      expect(actor).not.toHaveProperty("lane");
      expect(actor).not.toHaveProperty("route");
      expect(actor).not.toHaveProperty("sprite");
      expect(actor).not.toHaveProperty("assetPath");
    });
  });

  it("projects physical and informational threats at their runtime tiles with non-color semantics", () => {
    const session = createGameSession(bridgeDefenseCampaign, "hostile-projector");
    session.dispatch({ type: "start-attempt" });
    session.advance(10_000);

    const telegraphedSnapshot = session.read();
    const telegraphed = projectBattlefieldFrame(telegraphedSnapshot)?.threats[0];
    expect(telegraphed).toMatchObject({
      id: "bridge-east-bank-artillery",
      position: telegraphedSnapshot.operation?.threats[0]?.tile,
      category: "physical",
      kind: "artillery",
      severity: "medium",
      state: "telegraphed",
      result: null,
      glyph: "✹",
      severityGlyph: "Ⅱ",
      statusGlyph: "…",
    });
    expect(telegraphed?.label).toContain("물리적 위협 포격. 심각도 중간. 예고 중");

    session.advance(8_000);
    const resolved = projectBattlefieldFrame(session.read())?.threats[0];
    expect(resolved).toMatchObject({
      id: "bridge-east-bank-artillery",
      position: telegraphed?.position,
      state: "resolved",
      statusGlyph: resolved?.result === "blocked" ? "✓" : "!",
    });
    expect(resolved?.label).toContain(resolved?.result === "blocked" ? "차단됨" : "목표 피해");

    session.advance(4_000);
    const informational = projectBattlefieldFrame(session.read())?.threats.find(
      ({ id }) => id === "bridge-north-bank-misinformation",
    );
    expect(informational).toMatchObject({
      category: "informational",
      kind: "misinformation",
      severity: "high",
      state: "telegraphed",
      glyph: "?",
      severityGlyph: "Ⅲ",
      statusGlyph: "…",
    });
    expect(informational?.label).toContain("정보 위협 허위 정보");
  });

  it("does not consume legacy lane, normalized position, or route values", () => {
    const snapshot = operationSnapshot();
    const operation = snapshot.operation;
    if (!operation) throw new Error("Missing operation fixture.");
    const changedLegacyValues: GameSnapshot = {
      ...snapshot,
      operation: {
        ...operation,
        units: operation.units.map((unit) => ({
          ...unit,
          lane: unit.lane === "south" ? "north" : "south",
          position: unit.position === 1 ? 0 : 1,
          route: unit.route.length === 0 ? ["north"] : [],
        })),
      },
    };

    expect(projectBattlefieldFrame(changedLegacyValues)).toEqual(
      projectBattlefieldFrame(snapshot),
    );
  });

  it("keeps the Canvas frame out of the DOM view model", () => {
    const snapshot = operationSnapshot();
    const battlefield = projectBattlefieldFrame(snapshot);
    const view = projectGameViewModel(snapshot, campaignView);

    expect(battlefield).not.toBeNull();
    expect(view.operation).not.toBeNull();
    expect(view.operation).not.toHaveProperty("battlefield");
  });

  it("does not create a battlefield frame outside an operation", () => {
    const session = createGameSession(completeCampaign, "operation-projector-briefing");
    const snapshot = session.read();

    expect(projectBattlefieldFrame(snapshot)).toBeNull();
    expect(projectGameViewModel(snapshot, campaignView).operation).toBeNull();
  });
});
