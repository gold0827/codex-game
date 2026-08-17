import type { GameSnapshot } from "../../application/game-session";
import type {
  BattlefieldAction,
  BattlefieldActorFrame,
  BattlefieldCue,
  BattlefieldFacing,
  BattlefieldFrame,
  BattlefieldMapFrame,
  BattlefieldThreatFrame,
  WorldPosition,
} from "../battlefield/battlefieldFrame";
import { projectEffectTrack } from "../effects/effectCueProjector";
import { sampleEffectTrack, type EffectTrack } from "../effects/effectTrack";

type Operation = NonNullable<GameSnapshot["operation"]>;
type Unit = Operation["units"][number];
type Threat = Operation["threats"][number];

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

const threatPresentation = {
  communications: { category: "informational", glyph: "⌁", label: "통신 교란" },
  flood: { category: "physical", glyph: "≋", label: "범람" },
  artillery: { category: "physical", glyph: "✹", label: "포격" },
  ambush: { category: "physical", glyph: "▲", label: "매복" },
  misinformation: { category: "informational", glyph: "?", label: "허위 정보" },
  obstruction: { category: "physical", glyph: "▦", label: "장애물" },
} as const satisfies Record<Threat["kind"], {
  category: BattlefieldThreatFrame["category"];
  glyph: string;
  label: string;
}>;

const severityPresentation = {
  low: { glyph: "Ⅰ", label: "낮음" },
  medium: { glyph: "Ⅱ", label: "중간" },
  high: { glyph: "Ⅲ", label: "높음" },
  critical: { glyph: "Ⅳ", label: "치명적" },
} as const satisfies Record<Threat["severity"], { glyph: string; label: string }>;

function threatStatus(threat: Threat): Readonly<{ glyph: string; label: string }> {
  if (threat.state === "telegraphed") return { glyph: "…", label: "예고 중" };
  return threat.result === "blocked"
    ? { glyph: "✓", label: "차단됨" }
    : { glyph: "!", label: "목표 피해" };
}

function projectThreat(threat: Threat): BattlefieldThreatFrame {
  const kind = threatPresentation[threat.kind];
  const severity = severityPresentation[threat.severity];
  const status = threatStatus(threat);
  const categoryLabel = kind.category === "physical" ? "물리적 위협" : "정보 위협";
  return {
    id: threat.id,
    position: { ...threat.tile },
    category: kind.category,
    kind: threat.kind,
    severity: threat.severity,
    state: threat.state,
    result: threat.result,
    health: Math.max(0, Math.min(100, threat.health)),
    glyph: kind.glyph,
    severityGlyph: severity.glyph,
    statusGlyph: status.glyph,
    label: `${categoryLabel} ${kind.label}. 심각도 ${severity.label}. ${status.label}. 타일 ${threat.tile.x}, ${threat.tile.y}`,
  };
}

function projectMap(snapshot: GameSnapshot): BattlefieldMapFrame {
  const topology = snapshot.scene.mapTopology;
  if (!topology) {
    throw new Error(`Operation scene "${snapshot.scene.identity.id}" has no battlefield map.`);
  }
  return {
    id: snapshot.scene.presentation.mapId,
    width: topology.width,
    height: topology.height,
    tiles: [
      ...topology.blocked.map((position) => ({
        kind: "blocked" as const,
        position: { ...position },
      })),
      ...topology.terrain
        .filter(({ movementCost }) => movementCost > 1)
        .map(({ position }) => ({
          kind: "rough" as const,
          position: { ...position },
        })),
    ],
    locations: [
      ...topology.spawns.map(({ id, position }) => ({
        id,
        kind: "spawn" as const,
        position: { ...position },
      })),
      ...topology.destinations.map(({ id, position }) => ({
        id,
        kind: "destination" as const,
        position: { ...position },
      })),
    ],
  };
}

export function projectBattlefieldFrame(
  snapshot: GameSnapshot,
  options: Readonly<{ reducedMotion?: boolean; effectTrack?: EffectTrack }> = {},
): BattlefieldFrame | null {
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
  return {
    map: projectMap(snapshot),
    actors,
    threats: operation.threats.map(projectThreat),
    guidedTile:
      snapshot.tutorial.active && snapshot.tutorial.currentStep?.action === "signal"
        ? { ...snapshot.tutorial.currentStep.target.position }
        : null,
    effects: sampleEffectTrack(
      options.effectTrack ?? projectEffectTrack(snapshot),
      operation.elapsedMs,
      options.reducedMotion ?? false,
    ),
  };
}
