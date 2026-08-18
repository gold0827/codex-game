import type { SquadBattleSessionSnapshot } from "../../application/squad-battle-session";
import type {
  BattlefieldAction,
  BattlefieldActorFrame,
  BattlefieldFacing,
  BattlefieldFrame,
  BattlefieldMapFrame,
  WorldPosition,
} from "../battlefield/battlefieldFrame";

type Squad = SquadBattleSessionSnapshot["battle"]["squads"][number];
type Soldier = Squad["soldiers"][number];
type ZoneId = Squad["position"];

const ZONE_POSITIONS = Object.freeze({
  "allied-camp": { x: 2, y: 7 },
  "west-bank": { x: 8, y: 7 },
  bridge: { x: 11, y: 7 },
  "east-bank": { x: 14, y: 7 },
  "enemy-camp": { x: 21, y: 7 },
  "north-ford": { x: 11, y: 3 },
  "south-road": { x: 11, y: 13 },
} satisfies Readonly<Record<ZoneId, WorldPosition>>);

const SQUAD_OFFSETS = Object.freeze({
  main: { x: -0.45, y: -0.5 },
  relief: { x: -0.45, y: 0.5 },
  "enemy-assault": { x: 0.45, y: -0.5 },
  "enemy-reserve": { x: 0.45, y: 0.5 },
} satisfies Readonly<Record<Squad["id"], WorldPosition>>);

const SOLDIER_OFFSETS = Object.freeze([
  { x: -0.36, y: -0.3 }, { x: 0, y: -0.3 }, { x: 0.36, y: -0.3 },
  { x: -0.36, y: 0 }, { x: 0, y: 0 }, { x: 0.36, y: 0 },
  { x: -0.36, y: 0.3 }, { x: 0, y: 0.3 }, { x: 0.36, y: 0.3 },
] satisfies readonly WorldPosition[]);

function action(squad: Squad, soldier: Soldier, engaged: boolean): BattlefieldAction {
  if (soldier.health <= 0) return "down";
  if (soldier.panicReaction !== null) return "panic";
  if (soldier.health < 30) return "hurt";
  if (engaged) return "attack";
  return squad.order === "hold" ? "idle" : "walk";
}

function facing(squad: Squad): BattlefieldFacing {
  if (squad.order === "withdraw") return squad.side === "ally" ? "west" : "east";
  return squad.side === "ally" ? "east" : "west";
}

function position(squad: Squad, soldierIndex: number): WorldPosition {
  const zone = ZONE_POSITIONS[squad.position];
  const squadOffset = SQUAD_OFFSETS[squad.id];
  const soldierOffset = SOLDIER_OFFSETS[soldierIndex] ?? { x: 0, y: 0 };
  return {
    x: zone.x + squadOffset.x + soldierOffset.x,
    y: zone.y + squadOffset.y + soldierOffset.y,
  };
}

export function projectSquadBattleFrame(
  snapshot: SquadBattleSessionSnapshot,
  map: BattlefieldMapFrame,
  reducedMotion = false,
): BattlefieldFrame {
  const activeSquads = snapshot.battle.squads.filter(({ active }) => active);
  const actors = activeSquads.flatMap((squad) => {
    const engaged = activeSquads.some((candidate) =>
      candidate.side !== squad.side && !candidate.routed && candidate.position === squad.position
    );
    return squad.soldiers.map<BattlefieldActorFrame>((soldier, soldierIndex) => ({
      id: soldier.id,
      position: position(squad, soldierIndex),
      action: action(squad, soldier, engaged),
      facing: facing(squad),
      health: soldier.health,
      cues: soldier.health > 0 && soldier.health < 30 ? ["low-health"] : [],
      selected: false,
      team: squad.side,
    }));
  });
  return {
    map,
    actors,
    threats: [],
    effects: [],
    animation: {
      operationTimeMs: snapshot.battle.elapsedMs,
      paused: snapshot.paused,
      reducedMotion,
    },
    guidedTile: null,
  };
}
