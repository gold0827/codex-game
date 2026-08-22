import { createSquadBattleSession } from "../application/squad-battle-session";
import type { BattlefieldMapFrame } from "../presentation/battlefield/battlefieldFrame";
import { createBrowserFrameScheduler } from "../platform/browser/adapters";
import { bridgeDefenseMap, bridgeDefenseOperation } from "../scenarios/bridgeDefenseOperation";
import { mountSquadBattleApp, type SquadBattleApp } from "../ui/SquadBattleApp";

function battlefieldMap(): BattlefieldMapFrame {
  return {
    id: bridgeDefenseOperation.presentation.mapId,
    width: bridgeDefenseMap.width,
    height: bridgeDefenseMap.height,
    tiles: [
      ...bridgeDefenseMap.blocked.map((position) => ({ kind: "blocked" as const, position: { ...position } })),
      ...bridgeDefenseMap.terrain
        .filter(({ movementCost }) => movementCost > 1)
        .map(({ position }) => ({ kind: "rough" as const, position: { ...position } })),
    ],
    locations: [
      ...bridgeDefenseMap.spawns.map(({ id, position }) => ({
        id,
        kind: "spawn" as const,
        position: { ...position },
      })),
      ...bridgeDefenseMap.destinations.map(({ id, position }) => ({
        id,
        kind: "destination" as const,
        position: { ...position },
      })),
    ],
  };
}

export function mountProductionSquadBattle(root: HTMLElement): SquadBattleApp {
  const params = new URLSearchParams(window.location.search);
  return mountSquadBattleApp(
    root,
    createSquadBattleSession(params.get("seed") ?? "haein-bridge"),
    battlefieldMap(),
    { frameScheduler: createBrowserFrameScheduler() },
  );
}
