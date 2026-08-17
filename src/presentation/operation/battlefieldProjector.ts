import type { GameSnapshot } from "../../application/game-session";
import type {
  BattlefieldAction,
  BattlefieldActorFrame,
  BattlefieldCue,
  BattlefieldFacing,
  BattlefieldFrame,
  WorldPosition,
} from "../battlefield/battlefieldFrame";

type Operation = NonNullable<GameSnapshot["operation"]>;
type Unit = Operation["units"][number];

const actionByIntent = {
  "advance-locally": "walk",
  "engage-threat": "attack",
  "secure-objective": "walk",
  "cross-check-report": "inspect",
  "inspect-source": "inspect",
  "hold-for-evidence": "idle",
  "route-report": "broadcast",
  "broadcast-update": "broadcast",
  "compress-feedback": "broadcast",
} as const satisfies Record<Unit["intent"], BattlefieldAction>;

function facing(from: WorldPosition, to: WorldPosition | undefined): BattlefieldFacing {
  if (!to) return "south";
  const horizontal = Math.sign(to.x - from.x);
  const vertical = Math.sign(to.y - from.y);
  const direction = `${horizontal},${vertical}`;
  const facings: Readonly<Record<string, BattlefieldFacing>> = {
    "0,-1": "north",
    "1,-1": "north-east",
    "1,0": "east",
    "1,1": "south-east",
    "0,1": "south",
    "-1,1": "south-west",
    "-1,0": "west",
    "-1,-1": "north-west",
    "0,0": "south",
  };
  return facings[direction] ?? "south";
}

function action(unit: Unit, moving: boolean): BattlefieldAction {
  if (unit.health <= 0) return "down";
  if (unit.health < 30) return "hurt";
  const projected = actionByIntent[unit.intent];
  return projected === "walk" && !moving ? "idle" : projected;
}

function cues(unit: Unit, moving: boolean): readonly BattlefieldCue[] {
  const values: BattlefieldCue[] = [];
  if (!moving) values.push("destination-reached");
  if (unit.health < 30 && unit.health > 0) values.push("low-health");
  return values;
}

export function projectBattlefieldFrame(snapshot: GameSnapshot): BattlefieldFrame | null {
  const operation = snapshot.operation;
  if (!operation) return null;
  const units = new Map(operation.units.map((unit) => [unit.officerId, unit]));
  const actors = operation.spatial.actors.map<BattlefieldActorFrame>((actor) => {
    const unit = units.get(actor.actorId);
    if (!unit) throw new Error(`Missing battlefield unit for spatial actor "${actor.actorId}".`);
    const moving = actor.destination !== null && actor.path.length > 0;
    return {
      id: actor.actorId,
      position: { x: actor.position.x, y: actor.position.y },
      action: action(unit, moving),
      facing: facing(actor.position, actor.path[0] ?? actor.destination ?? undefined),
      health: Math.max(0, Math.min(100, unit.health)),
      cues: cues(unit, moving),
      selected: snapshot.selectedOfficerId === actor.actorId,
    };
  });
  return { actors };
}
