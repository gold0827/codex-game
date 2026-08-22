import type { AutonomousOperationViewModel } from "../operation/autonomousOperationProjector";

export type BattlefieldVisualAction =
  | "waiting"
  | "observe"
  | "verify"
  | "coordinate"
  | "maneuver"
  | "repeat"
  | "revise"
  | "independent"
  | "failed"
  | "suppressed"
  | "withdrawn"
  | "lost";

export type BattlefieldChoreographyEffectKind =
  | "contact-pressure"
  | "pressure-flow";

export type BattlefieldChoreographyPlan = Readonly<{
  elapsedMs: number;
  reducedMotion: boolean;
  formations: readonly Readonly<{
    formationId: string;
    sideId: string;
    locationId: string;
    active: boolean;
    anchor: Readonly<{
      x: number;
      y: number;
      label: string;
      known: boolean;
    }>;
    offset: Readonly<{ x: number; y: number }>;
    footprintHeight: number;
    actors: readonly Readonly<{
      actorId: string;
      transform: string;
      x: number;
      y: number;
      visualAction: BattlefieldVisualAction;
      moving: boolean;
    }>[];
  }>[];
  exchanges: readonly Readonly<{
    id: string;
    laneId: string;
    kind: BattlefieldChoreographyEffectKind;
    fromFormationId: string;
    toFormationId: string;
    fromSideId: string;
    toSideId: string;
    progress: number;
  }>[];
}>;

type BattlefieldAnchor = BattlefieldChoreographyPlan["formations"][number]["anchor"];
type OperationFormation = AutonomousOperationViewModel["formations"][number];
type OperationActor = OperationFormation["actors"][number];
type OperationActorDecision = Readonly<{
  id: string;
  completedAtMs: number;
  actionState: "executed" | "failed" | "deferred";
  behaviorId: string;
  targetId: string | null;
  confidence: number;
}>;

const chuncheonAnchors: Readonly<Record<string, Omit<BattlefieldAnchor, "known">>> = {
  "north-reinforcement-route": { x: 28, y: 14, label: "북방 증원로" },
  "north-chuncheon-axis": { x: 49, y: 18, label: "춘천 북방 축선" },
  "east-chuncheon-route": { x: 76, y: 24, label: "춘천 동부 우회로" },
  "oksanpo-approach": { x: 37, y: 34, label: "옥산포 접근로" },
  "soyang-crossing-approach": { x: 61, y: 42, label: "소양강 도하 접근로" },
  "soyang-north-bank": { x: 45, y: 49, label: "소양강 북안" },
  "wonchang-pass": { x: 51, y: 75, label: "원창고개" },
};

const chuncheonContactLanes = [
  {
    id: "north-axis-contact",
    fromLocationId: "north-chuncheon-axis",
    toLocationId: "oksanpo-approach",
  },
  {
    id: "soyang-crossing-contact",
    fromLocationId: "soyang-crossing-approach",
    toLocationId: "soyang-north-bank",
  },
  {
    id: "east-flank-contact",
    fromLocationId: "east-chuncheon-route",
    toLocationId: "wonchang-pass",
  },
] as const;

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function anchorFor(locationId: string): BattlefieldAnchor {
  const known = chuncheonAnchors[locationId];
  if (known) return { ...known, known: true };
  const hash = stableHash(locationId);
  return {
    x: 18 + hash % 65,
    y: 18 + Math.floor(hash / 67) % 61,
    label: `작전 지점 ${String(hash % 97 + 1).padStart(2, "0")}`,
    known: false,
  };
}

function visualAction(actor: OperationActor, active: boolean): BattlefieldVisualAction {
  const decision = actorDecision(actor);
  if (!active || actor.behavior === null) return "waiting";
  if (actor.condition === "suppressed") return "suppressed";
  if (actor.condition === "withdrawn") return "withdrawn";
  if (actor.condition === "lost") return "lost";
  if (decision?.actionState === "failed") return "failed";
  if (decision?.actionState === "deferred") return "waiting";
  if (actor.behavior.startsWith("guidance:")) return "coordinate";
  if (actor.behavior.startsWith("intent:")) return "maneuver";
  const behaviorActions: Readonly<Record<string, BattlefieldVisualAction>> = {
    "seek-information": "observe",
    verify: "verify",
    "feedback-repeat": "repeat",
    "feedback-revise": "revise",
    "act-independently": "independent",
  };
  return behaviorActions[actor.behavior] ?? "maneuver";
}

function actorDecision(actor: OperationActor): OperationActorDecision | null {
  return (actor as OperationActor & Readonly<{
    decision?: OperationActorDecision | null;
  }>).decision ?? null;
}

function actorGrid(count: number) {
  const columns = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(count))));
  const rows = Math.max(1, Math.ceil(count / columns));
  return {
    columns,
    rows,
    footprintHeight: Math.max(42, (rows - 1) * 24 + 32),
  };
}

function actorBaseOffset(index: number, count: number, actorId: string) {
  const { columns, rows } = actorGrid(count);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const hash = stableHash(actorId);
  return {
    x: rounded((column - (columns - 1) / 2) * 24 + (hash % 3) - 1),
    y: rounded((row - (rows - 1) / 2) * 24 + (Math.floor(hash / 3) % 3) - 1),
  };
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function canMove(action: BattlefieldVisualAction): boolean {
  const stationary: readonly BattlefieldVisualAction[] = [
    "waiting",
    "failed",
    "suppressed",
    "withdrawn",
    "lost",
  ];
  return !stationary.includes(action);
}

function motionAmplitude(action: BattlefieldVisualAction): number {
  const amplitudes: Partial<Record<BattlefieldVisualAction, number>> = {
    observe: 10,
    verify: 6,
    coordinate: 5,
    maneuver: 8,
    repeat: 7,
    revise: 9,
    independent: 11,
  };
  return amplitudes[action] ?? 0;
}

function dynamicOffset(
  id: string,
  elapsedMs: number,
  amplitude: number,
): Readonly<{ x: number; y: number }> {
  const phaseOffset = stableHash(id) % 360 * Math.PI / 180;
  const phase = elapsedMs / 760 * Math.PI * 2 + phaseOffset;
  return {
    x: rounded(Math.cos(phase) * amplitude),
    y: rounded(Math.sin(phase * 0.73) * amplitude * 0.62),
  };
}

function participatesInExchange(
  formation: BattlefieldChoreographyPlan["formations"][number],
): boolean {
  const pressureActions: readonly BattlefieldVisualAction[] = [
    "coordinate",
    "maneuver",
    "repeat",
    "revise",
    "independent",
  ];
  return formation.actors.some(({ visualAction }) => pressureActions.includes(visualAction));
}

function planExchanges(
  formations: BattlefieldChoreographyPlan["formations"],
  elapsedMs: number,
  reducedMotion: boolean,
): BattlefieldChoreographyPlan["exchanges"] {
  const exchanges: BattlefieldChoreographyPlan["exchanges"][number][] = [];
  for (const lane of chuncheonContactLanes) {
    const fromFormations = formations.filter((formation) =>
      formation.active && formation.locationId === lane.fromLocationId);
    const toFormations = formations.filter((formation) =>
      formation.active && formation.locationId === lane.toLocationId);
    for (const from of fromFormations) {
      for (const to of toFormations) {
        if (from.sideId === to.sideId) continue;
        const pairId = `${lane.id}:${from.formationId}:${to.formationId}`;
        exchanges.push({
          id: `${pairId}:contact-pressure`,
          laneId: lane.id,
          kind: "contact-pressure",
          fromFormationId: from.formationId,
          toFormationId: to.formationId,
          fromSideId: from.sideId,
          toSideId: to.sideId,
          progress: 1,
        });
        if (participatesInExchange(from) && participatesInExchange(to)) {
          exchanges.push({
            id: `${pairId}:pressure-flow`,
            laneId: lane.id,
            kind: "pressure-flow",
            fromFormationId: from.formationId,
            toFormationId: to.formationId,
            fromSideId: from.sideId,
            toSideId: to.sideId,
            progress: reducedMotion
              ? 0.5
              : rounded(((elapsedMs + stableHash(pairId)) % 1_200) / 1_200),
          });
        }
      }
    }
  }
  return exchanges.sort((left, right) => left.id.localeCompare(right.id));
}

/** Pure presentation choreography; it never creates player commands or combat outcomes. */
export function planBattlefieldChoreography(
  operation: AutonomousOperationViewModel,
  reducedMotion: boolean,
): BattlefieldChoreographyPlan {
  const formations = [...operation.formations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((formation) => {
      const actors = [...formation.actors].sort((left, right) => left.id.localeCompare(right.id));
      const formationOffset = formation.active && !reducedMotion
        ? dynamicOffset(formation.id, operation.clock.elapsedMs, 2.5)
        : { x: 0, y: 0 };
      return {
        formationId: formation.id,
        sideId: formation.sideId,
        locationId: formation.location,
        active: formation.active,
        anchor: anchorFor(formation.location),
        offset: formationOffset,
        footprintHeight: actorGrid(actors.length).footprintHeight,
        actors: actors.map((actor, index) => {
          const base = actorBaseOffset(index, actors.length, actor.id);
          const action = visualAction(actor, formation.active);
          const decision = actorDecision(actor);
          const moving = formation.active && !reducedMotion && canMove(action);
          const decisionElapsedMs = Math.max(
            0,
            operation.clock.elapsedMs - (decision?.completedAtMs ?? 0),
          );
          const motion = moving
            ? dynamicOffset(
                `${actor.id}:${decision?.id ?? actor.behavior}`,
                decisionElapsedMs,
                motionAmplitude(action) * (actors.length > 16 ? 0.2 : actors.length > 9 ? 0.45 : 1),
              )
            : { x: 0, y: 0 };
          const x = rounded(base.x + motion.x);
          const y = rounded(base.y + motion.y);
          return {
            actorId: actor.id,
            transform: `translate3d(${x}px, ${y}px, 0)`,
            x,
            y,
            visualAction: action,
            moving,
          };
        }),
      };
    });

  return {
    elapsedMs: operation.clock.elapsedMs,
    reducedMotion,
    formations,
    exchanges: planExchanges(formations, operation.clock.elapsedMs, reducedMotion),
  };
}
