import type {
  AgentProfile,
  CampaignMapTopology,
  CampaignTilePosition,
  OfficerDisposition,
} from "../../../campaign/types";
import {
  createSeededRandom,
  deriveRandomStreamSeed,
  type RandomSeed,
  type SeededRandom,
} from "../../../simulation/seededRandom";
import { createEncounterSimulation } from "./encounters";
import type {
  EncounterActorDefinition,
  EncounterActorSnapshot,
  EncounterSimulation,
} from "./encounterTypes";

export const SQUAD_BATTLE_STEP_MS = 5_000;
export const SQUAD_BATTLE_DURATION_MS = 180_000;

export type SquadBattleSquadId = "main" | "relief" | "enemy-assault" | "enemy-reserve";
export type SquadBattleOrder = "advance" | "hold" | "focus" | "withdraw";
export type SquadBattleRoute = "center" | "north" | "south";
export type SquadBattleStatus = "running" | "victory" | "defeat";

export type SquadBattleCommand =
  | Readonly<{
      kind: "order";
      squadId: "main" | "relief";
      order: SquadBattleOrder;
      targetId?: "enemy-assault" | "enemy-reserve";
    }>
  | Readonly<{
      kind: "deploy-relief";
      route: "north" | "south";
    }>;

export type SquadBattleSoldierSnapshot = Readonly<{
  id: string;
  name: string;
  role: SoldierRole;
  health: number;
  suppression: number;
  panicReaction: EncounterActorSnapshot["panicReaction"];
}>;

export type SquadBattleSquadSnapshot = Readonly<{
  id: SquadBattleSquadId;
  name: string;
  side: "ally" | "enemy";
  active: boolean;
  routed: boolean;
  route: SquadBattleRoute;
  position: BattleZoneId;
  order: SquadBattleOrder;
  focusTargetId: SquadBattleSquadId | null;
  pendingOrder: Readonly<{
    order: SquadBattleOrder;
    targetId: SquadBattleSquadId | null;
    arrivesAtMs: number;
  }> | null;
  fatigue: number;
  morale: number;
  soldiers: readonly SquadBattleSoldierSnapshot[];
}>;

export type SquadBattleEvent = Readonly<{
  sequence: number;
  timeMs: number;
  kind: "command" | "movement" | "combat" | "mission" | "outcome";
  description: string;
}>;

export type SquadBattleSnapshot = Readonly<{
  seed: RandomSeed;
  elapsedMs: number;
  durationMs: number;
  fixedStepMs: number;
  status: SquadBattleStatus;
  bridgeIntegrity: number;
  convoyProgress: number;
  squads: readonly SquadBattleSquadSnapshot[];
  events: readonly SquadBattleEvent[];
}>;

export type SquadBattleSimulation = Readonly<{
  snapshot: () => SquadBattleSnapshot;
  advance: (elapsedMs: number) => SquadBattleSnapshot;
  command: (command: SquadBattleCommand) => SquadBattleSnapshot;
}>;

type BattleZoneId =
  | "allied-camp"
  | "west-bank"
  | "bridge"
  | "east-bank"
  | "enemy-camp"
  | "north-ford"
  | "south-road";

type SoldierRole = "commander" | "guard" | "striker" | "scout" | "medic";

type SoldierDefinition = Readonly<{
  id: string;
  name: string;
  role: SoldierRole;
}>;

type PendingOrder = {
  order: SquadBattleOrder;
  targetId: SquadBattleSquadId | null;
  arrivesAtMs: number;
};

type SquadRuntime = {
  id: SquadBattleSquadId;
  name: string;
  side: "ally" | "enemy";
  route: SquadBattleRoute;
  position: BattleZoneId;
  active: boolean;
  routed: boolean;
  order: SquadBattleOrder;
  focusTargetId: SquadBattleSquadId | null;
  pendingOrder: PendingOrder | null;
  moveProgressMs: number;
  fatigue: number;
  morale: number;
  soldiers: readonly SoldierDefinition[];
};

const ZONE_POSITIONS = Object.freeze({
  "allied-camp": { x: 1, y: 5 },
  "west-bank": { x: 5, y: 5 },
  bridge: { x: 10, y: 5 },
  "east-bank": { x: 14, y: 5 },
  "enemy-camp": { x: 18, y: 5 },
  "north-ford": { x: 10, y: 1 },
  "south-road": { x: 10, y: 8 },
} satisfies Readonly<Record<BattleZoneId, CampaignTilePosition>>);

const ZONE_LABELS = Object.freeze({
  "allied-camp": "서쪽 지휘소",
  "west-bank": "서쪽 제방",
  bridge: "해인교",
  "east-bank": "동쪽 제방",
  "enemy-camp": "적 집결지",
  "north-ford": "북쪽 여울",
  "south-road": "남쪽 농로",
} satisfies Readonly<Record<BattleZoneId, string>>);

const GRAPH = Object.freeze({
  "allied-camp": ["west-bank", "north-ford", "south-road"],
  "west-bank": ["allied-camp", "bridge"],
  bridge: ["west-bank", "east-bank"],
  "east-bank": ["bridge", "enemy-camp", "north-ford", "south-road"],
  "enemy-camp": ["east-bank"],
  "north-ford": ["allied-camp", "east-bank"],
  "south-road": ["allied-camp", "east-bank"],
} satisfies Readonly<Record<BattleZoneId, readonly BattleZoneId[]>>);

const MARCH_ROUTES = Object.freeze({
  center: ["allied-camp", "west-bank", "bridge", "east-bank", "enemy-camp"],
  north: ["allied-camp", "north-ford", "east-bank", "enemy-camp"],
  south: ["allied-camp", "south-road", "east-bank", "enemy-camp"],
} satisfies Readonly<Record<SquadBattleRoute, readonly BattleZoneId[]>>);

const HOME = Object.freeze({ ally: "allied-camp", enemy: "enemy-camp" } as const);
const ORDER_LABEL = Object.freeze({
  advance: "진군",
  hold: "고수",
  focus: "집중 공격",
  withdraw: "후퇴/휴식",
} satisfies Readonly<Record<SquadBattleOrder, string>>);

const encounterTopology = {
  width: 20,
  height: 10,
  blocked: [],
  terrain: [],
  spawns: [],
  destinations: [],
} as const satisfies CampaignMapTopology;

const roleSettings = Object.freeze({
  commander: { disposition: "communication", accuracy: 0.67, damage: 18, suppression: 0.35 },
  guard: { disposition: "verification", accuracy: 0.62, damage: 15, suppression: 0.5 },
  striker: { disposition: "action", accuracy: 0.65, damage: 20, suppression: 0.45 },
  scout: { disposition: "verification", accuracy: 0.74, damage: 13, suppression: 0.3 },
  medic: { disposition: "communication", accuracy: 0.54, damage: 10, suppression: 0.2 },
} satisfies Readonly<Record<SoldierRole, Readonly<{
  disposition: OfficerDisposition;
  accuracy: number;
  damage: number;
  suppression: number;
}>>>);

const roleProfiles = Object.freeze({
  commander: profile(0.72, 0.58, 0.76, 0.82, 0.72),
  guard: profile(0.52, 0.82, 0.84, 0.68, 0.82),
  striker: profile(0.84, 0.28, 0.62, 0.58, 0.72),
  scout: profile(0.78, 0.76, 0.72, 0.66, 0.68),
  medic: profile(0.56, 0.72, 0.78, 0.86, 0.76),
} satisfies Readonly<Record<SoldierRole, AgentProfile>>);

function profile(
  initiative: number,
  caution: number,
  discipline: number,
  cooperation: number,
  stressTolerance: number,
): AgentProfile {
  return {
    initiative,
    caution,
    discipline,
    cooperation,
    stressTolerance,
    memoryCapacity: 3,
    sourceTrust: [],
  };
}

function soldierDefinitions(prefix: string, names: readonly string[]): readonly SoldierDefinition[] {
  const roles: readonly SoldierRole[] = [
    "commander", "guard", "striker", "striker", "scout", "medic", "guard", "striker", "scout",
  ];
  return names.map((name, index) => ({ id: `${prefix}-${index}`, name, role: roles[index]! }));
}

function createSquads(): SquadRuntime[] {
  return [
    {
      id: "main",
      name: "해인교 본대",
      side: "ally",
      route: "center",
      position: "west-bank",
      active: true,
      routed: false,
      order: "hold",
      focusTargetId: null,
      pendingOrder: null,
      moveProgressMs: 0,
      fatigue: 0,
      morale: 100,
      soldiers: soldierDefinitions("main", [
        "백돌격", "최방패", "오선봉", "장돌진", "윤척후", "서의무", "문방패", "임돌격", "배정찰",
      ]),
    },
    {
      id: "relief",
      name: "우회 지원대",
      side: "ally",
      route: "center",
      position: "allied-camp",
      active: false,
      routed: false,
      order: "hold",
      focusTargetId: null,
      pendingOrder: null,
      moveProgressMs: 0,
      fatigue: 0,
      morale: 100,
      soldiers: soldierDefinitions("relief", [
        "한확인", "강수비", "신돌격", "노돌격", "박전달", "유의무", "하방패", "전돌격", "김중계",
      ]),
    },
    {
      id: "enemy-assault",
      name: "적 선봉대",
      side: "enemy",
      route: "center",
      position: "east-bank",
      active: true,
      routed: false,
      order: "advance",
      focusTargetId: null,
      pendingOrder: null,
      moveProgressMs: 0,
      fatigue: 0,
      morale: 100,
      soldiers: soldierDefinitions("enemy-assault", [
        "적 선봉장", "적 방패1", "적 창병1", "적 창병2", "적 척후1", "적 의무1", "적 방패2", "적 창병3", "적 척후2",
      ]),
    },
    {
      id: "enemy-reserve",
      name: "적 증원대",
      side: "enemy",
      route: "center",
      position: "enemy-camp",
      active: false,
      routed: false,
      order: "advance",
      focusTargetId: null,
      pendingOrder: null,
      moveProgressMs: 0,
      fatigue: 0,
      morale: 100,
      soldiers: soldierDefinitions("enemy-reserve", [
        "적 부장", "적 방패3", "적 창병4", "적 창병5", "적 척후3", "적 의무2", "적 방패4", "적 창병6", "적 척후4",
      ]),
    },
  ];
}

function createEncounterActors(squads: readonly SquadRuntime[]): EncounterActorDefinition[] {
  let index = 0;
  return squads.flatMap((squad) => squad.soldiers.map((soldier) => {
    const position = { x: index % encounterTopology.width, y: Math.floor(index / encounterTopology.width) };
    index += 1;
    const settings = roleSettings[soldier.role];
    return {
      id: soldier.id,
      team: squad.side === "ally" ? "officer" : "hostile",
      position,
      disposition: settings.disposition,
      profile: roleProfiles[soldier.role],
      weapon: {
        range: 2,
        accuracy: settings.accuracy,
        damage: settings.damage,
        suppression: settings.suppression,
      },
    };
  }));
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function findPath(start: BattleZoneId, goal: BattleZoneId): readonly BattleZoneId[] {
  if (start === goal) return [];
  const queue: BattleZoneId[] = [start];
  const previous = new Map<BattleZoneId, BattleZoneId | null>([[start, null]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of GRAPH[current]) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      if (neighbor === goal) {
        const path: BattleZoneId[] = [];
        let cursor: BattleZoneId = goal;
        while (cursor !== start) {
          path.unshift(cursor);
          cursor = previous.get(cursor)!;
        }
        return path;
      }
      queue.push(neighbor);
    }
  }
  return [];
}

function nextOnMarchRoute(squad: SquadRuntime, towardHome = false): BattleZoneId | null {
  const route: readonly BattleZoneId[] = MARCH_ROUTES[
    squad.side === "enemy" ? "center" : squad.route
  ];
  const index = route.indexOf(squad.position);
  if (index < 0) return null;
  const forward = squad.side === "ally" ? 1 : -1;
  const direction = towardHome ? -forward : forward;
  return route[index + direction] ?? null;
}

export function createSquadBattle(seed: RandomSeed = "haein-bridge"): SquadBattleSimulation {
  const squads = createSquads();
  const encounter: EncounterSimulation = createEncounterSimulation({
    id: "haein-bridge-squad-battle",
    topology: encounterTopology,
    cover: [],
    actors: createEncounterActors(squads),
  }, deriveRandomStreamSeed(seed, "squad-battle:encounter"));
  const decisionRandom: SeededRandom = createSeededRandom(
    deriveRandomStreamSeed(seed, "squad-battle:decisions"),
  );
  const events: SquadBattleEvent[] = [];
  let elapsedMs = 0;
  let accumulatedMs = 0;
  let status: SquadBattleStatus = "running";
  let bridgeIntegrity = 100;
  let convoyProgress = 0;
  let eventSequence = 0;

  const append = (kind: SquadBattleEvent["kind"], description: string): void => {
    events.push({ sequence: eventSequence, timeMs: elapsedMs, kind, description });
    eventSequence += 1;
  };

  const actorsById = (): ReadonlyMap<string, EncounterActorSnapshot> =>
    new Map(encounter.snapshot().actors.map((actor) => [actor.id, actor]));

  const livingSoldiers = (
    squad: SquadRuntime,
    actors: ReadonlyMap<string, EncounterActorSnapshot> = actorsById(),
  ): readonly SoldierDefinition[] => squad.soldiers.filter((soldier) => (actors.get(soldier.id)?.health ?? 0) > 0);

  const isCombatant = (squad: SquadRuntime): boolean =>
    squad.active && !squad.routed && livingSoldiers(squad).length > 0;

  const relocateSquad = (squad: SquadRuntime): void => {
    const destination = ZONE_POSITIONS[squad.position];
    livingSoldiers(squad).forEach((soldier) => {
      encounter.execute({ kind: "relocate", actorId: soldier.id, position: destination });
    });
  };

  squads.forEach(relocateSquad);
  append("mission", "작전 개시. 적 선봉대가 동쪽 제방에서 해인교로 접근한다.");

  const enemiesAtSameZone = (squad: SquadRuntime): readonly SquadRuntime[] => squads.filter(
    (candidate) => candidate.side !== squad.side && isCombatant(candidate) && candidate.position === squad.position,
  );

  const nextDestination = (squad: SquadRuntime): BattleZoneId | null => {
    if (squad.order === "hold") return null;
    if (squad.order === "withdraw") {
      return nextOnMarchRoute(squad, true) ?? findPath(squad.position, HOME[squad.side])[0] ?? null;
    }
    if (squad.order === "focus") {
      const target = squads.find((candidate) => candidate.id === squad.focusTargetId && isCombatant(candidate));
      if (target) return findPath(squad.position, target.position)[0] ?? null;
    }
    return nextOnMarchRoute(squad);
  };

  const deliverOrders = (): void => {
    squads.forEach((squad) => {
      if (!squad.pendingOrder || squad.pendingOrder.arrivesAtMs > elapsedMs) return;
      squad.order = squad.pendingOrder.order;
      squad.focusTargetId = squad.pendingOrder.targetId;
      squad.pendingOrder = null;
      append("command", `${squad.name}에 ${ORDER_LABEL[squad.order]} 명령이 도착했다.`);
    });
  };

  const moveSquads = (): void => {
    squads.forEach((squad) => {
      if (!isCombatant(squad)) return;
      if (enemiesAtSameZone(squad).length > 0 && squad.order !== "withdraw") {
        squad.moveProgressMs = 0;
        return;
      }
      const destination = nextDestination(squad);
      if (!destination || destination === squad.position) return;
      const speed = clamp(1 - squad.fatigue / 140, 0.35, 1);
      squad.moveProgressMs += SQUAD_BATTLE_STEP_MS * speed;
      if (squad.moveProgressMs < 10_000) return;
      squad.moveProgressMs -= 10_000;
      const origin = squad.position;
      squad.position = destination;
      relocateSquad(squad);
      append("movement", `${squad.name}이 ${ZONE_LABELS[origin]}에서 ${ZONE_LABELS[destination]}(으)로 이동했다.`);
    });
  };

  const targetFor = (attacker: SquadRuntime, opponents: readonly SquadRuntime[]): SquadRuntime => {
    const focused = opponents.find((candidate) => candidate.id === attacker.focusTargetId);
    if (attacker.order === "focus" && focused) return focused;
    return [...opponents].sort((left, right) =>
      livingSoldiers(left).length - livingSoldiers(right).length || left.id.localeCompare(right.id)
    )[0]!;
  };

  const resolveAttacks = (
    attacker: SquadRuntime,
    target: SquadRuntime,
    pincer: boolean,
  ): { damage: number; casualties: number } => {
    let damage = 0;
    let casualties = 0;
    const readiness = clamp((100 - attacker.fatigue) / 100, 0.25, 1) *
      clamp(attacker.morale / 100, 0.3, 1);
    const stance = attacker.order === "hold" ? 0.9 : attacker.order === "withdraw" ? 0.4 : 1;
    const focus = attacker.order === "focus" && attacker.focusTargetId === target.id ? 1.15 : 1;
    const targetDefense = target.order === "hold" ? 0.82 : 1;
    const actors = actorsById();
    const attackers = livingSoldiers(attacker, actors).filter((soldier) =>
      actors.get(soldier.id)?.panicReaction === null
    );

    attackers.forEach((soldier) => {
      const attemptChance = clamp(readiness * stance * focus * targetDefense, 0.18, 1);
      if (decisionRandom.next() > attemptChance) return;
      const repeats = pincer ? 2 : 1;
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        const currentTargets = [...livingSoldiers(target)].sort((left, right) => {
          const currentActors = actorsById();
          return (currentActors.get(left.id)?.health ?? 0) - (currentActors.get(right.id)?.health ?? 0) ||
            left.id.localeCompare(right.id);
        });
        const targetSoldier = currentTargets[0];
        if (!targetSoldier) return;
        const emitted = encounter.execute({ kind: "attack", actorId: soldier.id, targetId: targetSoldier.id });
        emitted.forEach((event) => {
          if (event.kind !== "unit-hit") return;
          damage += event.damage;
          if (event.remainingHealth === 0) casualties += 1;
        });
      }
    });
    return { damage, casualties };
  };

  const resolveCombat = (): void => {
    const combatZones = (Object.keys(ZONE_POSITIONS) as BattleZoneId[]).filter((zone) => {
      const sides = new Set(squads.filter((squad) => isCombatant(squad) && squad.position === zone).map(({ side }) => side));
      return sides.size > 1;
    });

    combatZones.forEach((zone) => {
      const combatants = squads.filter((squad) => isCombatant(squad) && squad.position === zone);
      combatants.forEach((attacker) => {
        const opponents = combatants.filter((candidate) => candidate.side !== attacker.side && isCombatant(candidate));
        if (opponents.length === 0) return;
        const target = targetFor(attacker, opponents);
        const alliedRoutes = new Set(
          combatants.filter((candidate) => candidate.side === attacker.side).map(({ route }) => route),
        );
        const pincer = alliedRoutes.size >= 2;
        const result = resolveAttacks(attacker, target, pincer);
        if (result.damage === 0) return;
        target.morale = clamp(target.morale - result.damage * 0.08 - result.casualties * 4.5);
        attacker.morale = clamp(attacker.morale + result.casualties * 1.5);
        append(
          "combat",
          `${ZONE_LABELS[zone]}에서 ${attacker.name}이 ${target.name}에 ${Math.round(result.damage)} 피해를 줬다.${pincer ? " 협공이 성립했다." : ""}`,
        );
      });
      combatants.forEach((squad) => {
        squad.fatigue = clamp(squad.fatigue + (squad.order === "withdraw" ? 3 : 9));
      });
    });

    squads.forEach((squad) => {
      if (!isCombatant(squad)) return;
      const quiet = enemiesAtSameZone(squad).length === 0;
      const restingAtHome = squad.position === HOME[squad.side] && squad.order === "withdraw";
      const medicAlive = livingSoldiers(squad).some(({ role }) => role === "medic");
      if (restingAtHome) {
        squad.fatigue = clamp(squad.fatigue - 18 - (medicAlive ? 2 : 0));
        squad.morale = clamp(squad.morale + 9 + (medicAlive ? 2 : 0));
      } else if (quiet) {
        squad.fatigue = clamp(squad.fatigue - (squad.order === "hold" ? 6 : 2) - (medicAlive ? 1 : 0));
        squad.morale = clamp(squad.morale + (medicAlive ? 3 : 2));
      }
    });
    encounter.advance(SQUAD_BATTLE_STEP_MS);
  };

  const updateRouts = (): void => {
    squads.forEach((squad) => {
      if (!squad.active || squad.routed) return;
      if (livingSoldiers(squad).length > 2 && squad.morale > 14) return;
      squad.routed = true;
      squad.order = "withdraw";
      append("combat", `${squad.name}이 전투력을 잃고 패주했다.`);
    });
  };

  const updateMission = (): void => {
    const activeAtBridge = squads.filter((squad) => isCombatant(squad) && squad.position === "bridge");
    const enemyAtBridge = activeAtBridge.some(({ side }) => side === "enemy");
    const allyAtBridge = activeAtBridge.some(({ side }) => side === "ally");
    const enemyBehindBridge = squads.some((squad) =>
      squad.side === "enemy" && isCombatant(squad) &&
      (squad.position === "west-bank" || squad.position === "allied-camp")
    );
    if (enemyAtBridge && !allyAtBridge) {
      bridgeIntegrity = clamp(bridgeIntegrity - 8);
      append("mission", "적이 해인교를 장악해 교량을 파괴하고 있다.");
    }
    if (enemyBehindBridge) {
      bridgeIntegrity = clamp(bridgeIntegrity - 10);
      append("mission", "적이 서쪽 방어선을 돌파해 교량 후방을 공격하고 있다.");
    }
    if (allyAtBridge && !enemyAtBridge && !enemyBehindBridge && elapsedMs >= 25_000) {
      convoyProgress = clamp(convoyProgress + 8);
    }

    const alliedHope = squads.some((squad) => squad.side === "ally" &&
      ((!squad.active && squad.id === "relief") || isCombatant(squad)));
    if (bridgeIntegrity <= 0) {
      status = "defeat";
      append("outcome", "패배: 해인교가 붕괴했다.");
    } else if (!alliedHope) {
      status = "defeat";
      append("outcome", "패배: 두 부대가 모두 전투력을 잃었다.");
    } else if (convoyProgress >= 100) {
      status = "victory";
      append("outcome", "승리: 수송대가 해인교를 완전히 통과했다.");
    } else if (elapsedMs >= SQUAD_BATTLE_DURATION_MS) {
      status = "defeat";
      append("outcome", "패배: 제한 시간 안에 수송대를 통과시키지 못했다.");
    }
  };

  const enemyDecisions = (): void => {
    const reserve = squads.find(({ id }) => id === "enemy-reserve")!;
    if (!reserve.active && elapsedMs >= 60_000) {
      reserve.active = true;
      append("mission", "적 증원대가 동쪽 집결지에 나타났다.");
    }
    squads.filter((squad) => squad.side === "enemy" && isCombatant(squad)).forEach((squad) => {
      if (squad.morale < 28 || squad.fatigue > 88) {
        squad.order = "withdraw";
        squad.focusTargetId = null;
      } else if (squad.position === "enemy-camp" && squad.fatigue < 35) {
        squad.order = "advance";
      }
    });
  };

  const step = (): void => {
    elapsedMs += SQUAD_BATTLE_STEP_MS;
    enemyDecisions();
    deliverOrders();
    moveSquads();
    resolveCombat();
    updateRouts();
    updateMission();
  };

  const snapshot = (): SquadBattleSnapshot => {
    const actors = actorsById();
    return {
      seed,
      elapsedMs,
      durationMs: SQUAD_BATTLE_DURATION_MS,
      fixedStepMs: SQUAD_BATTLE_STEP_MS,
      status,
      bridgeIntegrity,
      convoyProgress,
      squads: squads.map((squad) => ({
        id: squad.id,
        name: squad.name,
        side: squad.side,
        active: squad.active,
        routed: squad.routed,
        route: squad.route,
        position: squad.position,
        order: squad.order,
        focusTargetId: squad.focusTargetId,
        pendingOrder: squad.pendingOrder ? { ...squad.pendingOrder } : null,
        fatigue: squad.fatigue,
        morale: squad.morale,
        soldiers: squad.soldiers.map((soldier) => {
          const actor = actors.get(soldier.id)!;
          return {
            id: soldier.id,
            name: soldier.name,
            role: soldier.role,
            health: actor.health,
            suppression: actor.suppression,
            panicReaction: actor.panicReaction,
          };
        }),
      })),
      events: events.map((event) => ({ ...event })),
    };
  };

  const advance = (amountMs: number): SquadBattleSnapshot => {
    if (!Number.isFinite(amountMs) || amountMs < 0) {
      throw new RangeError("Squad battle advance time must be a finite non-negative number.");
    }
    accumulatedMs += amountMs;
    while (accumulatedMs >= SQUAD_BATTLE_STEP_MS && status === "running") {
      accumulatedMs -= SQUAD_BATTLE_STEP_MS;
      step();
    }
    return snapshot();
  };

  const command = (input: SquadBattleCommand): SquadBattleSnapshot => {
    if (status !== "running") return snapshot();
    if (input.kind === "deploy-relief") {
      const relief = squads.find(({ id }) => id === "relief")!;
      if (relief.active) return snapshot();
      relief.active = true;
      relief.route = input.route;
      relief.order = "advance";
      append("command", `우회 지원대가 ${input.route === "north" ? "북쪽 여울" : "남쪽 농로"}로 출발했다.`);
      return snapshot();
    }

    const squad = squads.find(({ id }) => id === input.squadId)!;
    if (!squad.active || squad.routed) return snapshot();
    const delayMs = squad.morale < 45 ? 10_000 : 5_000;
    squad.pendingOrder = {
      order: input.order,
      targetId: input.targetId ?? null,
      arrivesAtMs: elapsedMs + delayMs,
    };
    append("command", `${squad.name}에 ${ORDER_LABEL[input.order]} 명령을 보냈다. ${delayMs / 1_000}초 뒤 도착한다.`);
    return snapshot();
  };

  return { snapshot, advance, command };
}
