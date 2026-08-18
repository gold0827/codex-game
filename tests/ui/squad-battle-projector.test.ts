import { describe, expect, it } from "vitest";
import { createSquadBattleSession } from "../../src/application/squad-battle-session";
import type { BattlefieldMapFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import { projectSquadBattleFrame } from "../../src/presentation/operation/squadBattleProjector";

const map: BattlefieldMapFrame = {
  id: "test-bridge",
  width: 24,
  height: 16,
  tiles: [],
  locations: [],
};

describe("squad battle battlefield projector", () => {
  it("projects active soldiers onto the bridge map with opposing team markers", () => {
    const session = createSquadBattleSession("project-initial");
    const frame = projectSquadBattleFrame(session.read(), map);

    expect(frame.actors).toHaveLength(18);
    expect(frame.actors.filter(({ team }) => team === "ally")).toHaveLength(9);
    expect(frame.actors.filter(({ team }) => team === "enemy")).toHaveLength(9);
    const commander = frame.actors.find(({ id }) => id === "main-0");
    expect(commander).toMatchObject({
      action: "idle",
      facing: "east",
      team: "ally",
    });
    expect(commander?.position.x).toBeCloseTo(7.19);
    expect(commander?.position.y).toBeCloseTo(6.2);
  });

  it("adds both reserve squads and projects real encounter health after combat", () => {
    const session = createSquadBattleSession("project-combat");
    session.dispatch({ type: "battle-command", command: { kind: "order", squadId: "main", order: "advance" } });
    session.dispatch({ type: "battle-command", command: { kind: "deploy-relief", route: "north" } });
    session.advance(60_000);
    const frame = projectSquadBattleFrame(session.read(), map, true);

    expect(frame.actors).toHaveLength(36);
    expect(frame.animation).toMatchObject({ operationTimeMs: 60_000, reducedMotion: true });
    expect(frame.actors.some(({ health }) => health < 100)).toBe(true);
    expect(frame.actors.some(({ action }) => action === "attack" || action === "hurt" || action === "panic"))
      .toBe(true);
  });
});
