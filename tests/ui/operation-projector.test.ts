import { describe, expect, it } from "vitest";

import {
  createGameSession,
  type GameSnapshot,
} from "../../src/application/game-session";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { projectBattlefieldFrame } from "../../src/presentation/operation/battlefieldProjector";
import { projectOperationPresentation } from "../../src/presentation/operation/operationProjector";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

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
    expect(frame?.actors).toHaveLength(operation.spatial.actors.length);
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

  it("does not consume legacy lane, normalized position, or route projections", () => {
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
    expect(projectGameViewModel(changedLegacyValues, campaignView).operation?.battlefield.units)
      .toEqual(projectGameViewModel(snapshot, campaignView).operation?.battlefield.units);
  });

  it("separates the Canvas frame from the DOM HUD model", () => {
    const snapshot = operationSnapshot();
    const projected = projectOperationPresentation(snapshot, campaignView);

    expect(projected.battlefield).toEqual(projectBattlefieldFrame(snapshot));
    expect(projected.hud.operation).not.toBeNull();
    expect(projected.hud.operation).not.toHaveProperty("battlefield");
  });

  it("does not create a battlefield frame outside an operation", () => {
    const session = createGameSession(completeCampaign, "operation-projector-briefing");
    const projected = projectOperationPresentation(session.read(), campaignView);

    expect(projected.battlefield).toBeNull();
    expect(projected.hud.operation).toBeNull();
  });
});
