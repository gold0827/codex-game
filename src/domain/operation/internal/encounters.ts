import type {
  AgentProfile,
  CampaignMapTopology,
  CampaignTilePosition,
  OfficerDisposition,
} from "../../../campaign/types";
import {
  createSeededRandom,
  deriveRandomStreamSeed,
  hashSeed,
  type RandomSeed,
  type SeededRandom,
} from "../../../simulation/seededRandom";
import {
  ENCOUNTER_FIXED_STEP_MS,
  type AttackBlockReason,
  type EncounterAction,
  type EncounterDefinition,
  type EncounterEvent,
  type EncounterSimulation,
  type EncounterSnapshot,
  type EncounterTeam,
  type EncounterWeapon,
} from "./encounterTypes";
import {
  applySuppression,
  createStressState,
  recoverFromPanic,
  type StressState,
} from "./stress";
import { sameTile, tileKey } from "./spatial/spatialTypes";

type EncounterActor = {
  id: string;
  team: EncounterTeam;
  position: CampaignTilePosition;
  disposition: OfficerDisposition;
  profile: AgentProfile;
  health: number;
  weapon: EncounterWeapon;
  stress: StressState;
};

const copyTile = ({ x, y }: CampaignTilePosition): CampaignTilePosition => ({ x, y });
const clamp = (value: number, maximum = 1): number => Math.min(maximum, Math.max(0, value));
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;
const compareActor = (left: EncounterActor, right: EncounterActor): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

const assertRatio = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between zero and one.`);
  }
};

const assertPositive = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
};

function validatePosition(
  position: CampaignTilePosition,
  topology: CampaignMapTopology,
  label: string,
): void {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y) ||
      position.x < 0 || position.y < 0 || position.x >= topology.width || position.y >= topology.height) {
    throw new RangeError(`${label} must be a tile inside the encounter topology.`);
  }
}

function validateDefinition(definition: EncounterDefinition): void {
  if (!definition.id) throw new TypeError("An encounter requires a non-empty identifier.");
  if (!Number.isSafeInteger(definition.topology.width) || definition.topology.width <= 0 ||
      !Number.isSafeInteger(definition.topology.height) || definition.topology.height <= 0) {
    throw new RangeError("Encounter topology dimensions must be positive safe integers.");
  }
  const blocked = new Set<string>();
  definition.topology.blocked.forEach((position) => {
    validatePosition(position, definition.topology, "A blocked tile");
    blocked.add(tileKey(position));
  });
  definition.cover.forEach((position) => {
    validatePosition(position, definition.topology, "A cover tile");
    if (blocked.has(tileKey(position))) throw new RangeError("Cover cannot occupy a blocked tile.");
  });
  const ids = new Set<string>();
  const occupied = new Set<string>();
  definition.actors.forEach((actor) => {
    if (!actor.id || ids.has(actor.id)) throw new RangeError(`Encounter actor identifiers must be unique: "${actor.id}".`);
    ids.add(actor.id);
    validatePosition(actor.position, definition.topology, `Actor "${actor.id}"`);
    const positionKey = tileKey(actor.position);
    if (blocked.has(positionKey) || occupied.has(positionKey)) {
      throw new RangeError(`Actor "${actor.id}" must spawn on an unoccupied traversable tile.`);
    }
    occupied.add(positionKey);
    assertPositive(actor.weapon.range, `Actor "${actor.id}" weapon range`);
    assertRatio(actor.weapon.accuracy, `Actor "${actor.id}" weapon accuracy`);
    assertPositive(actor.weapon.damage, `Actor "${actor.id}" weapon damage`);
    assertRatio(actor.weapon.suppression, `Actor "${actor.id}" weapon suppression`);
    if (actor.health !== undefined) assertPositive(actor.health, `Actor "${actor.id}" health`);
    ["initiative", "caution", "discipline", "cooperation", "stressTolerance"].forEach((property) => {
      assertRatio(actor.profile[property as keyof Pick<AgentProfile,
        "initiative" | "caution" | "discipline" | "cooperation" | "stressTolerance">],
      `Actor "${actor.id}" profile ${property}`);
    });
  });
}

function distance(left: CampaignTilePosition, right: CampaignTilePosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function lineTiles(from: CampaignTilePosition, to: CampaignTilePosition): CampaignTilePosition[] {
  const tiles: CampaignTilePosition[] = [];
  let x = from.x;
  let y = from.y;
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX - deltaY;

  while (x !== to.x || y !== to.y) {
    const doubled = error * 2;
    if (doubled > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubled < deltaX) {
      error += deltaX;
      y += stepY;
    }
    if (x !== to.x || y !== to.y) tiles.push({ x, y });
  }
  return tiles;
}

export function hasLineOfSight(
  topology: CampaignMapTopology,
  from: CampaignTilePosition,
  to: CampaignTilePosition,
): boolean {
  const blocked = new Set(topology.blocked.map(tileKey));
  return lineTiles(from, to).every((position) => !blocked.has(tileKey(position)));
}

export function createEncounterSimulation(
  sourceDefinition: EncounterDefinition,
  seed: RandomSeed,
): EncounterSimulation {
  hashSeed(seed);
  const definition = structuredClone(sourceDefinition);
  validateDefinition(definition);
  const actors = new Map<string, EncounterActor>();
  definition.actors.forEach((actor) => actors.set(actor.id, {
    ...actor,
    position: copyTile(actor.position),
    profile: structuredClone(actor.profile),
    weapon: { ...actor.weapon },
    health: clamp(actor.health ?? 100, 100),
    stress: createStressState(),
  }));
  const cover = new Set(definition.cover.map(tileKey));
  const eventLog: EncounterEvent[] = [];
  const randoms = new Map<string, SeededRandom>();
  let elapsedMs = 0;
  let accumulatedMs = 0;

  const random = (key: string): SeededRandom => {
    const existing = randoms.get(key);
    if (existing) return existing;
    const created = createSeededRandom(deriveRandomStreamSeed(seed, `encounter:${definition.id}:${key}`));
    randoms.set(key, created);
    return created;
  };

  const append = <Event extends EncounterEvent>(event: Event, emitted: EncounterEvent[]): void => {
    const copy = structuredClone(event);
    eventLog.push(copy);
    emitted.push(structuredClone(copy));
  };

  const isTraversable = (position: CampaignTilePosition, actorId: string): boolean =>
    position.x >= 0 && position.y >= 0 &&
    position.x < definition.topology.width && position.y < definition.topology.height &&
    !definition.topology.blocked.some((tile) => sameTile(tile, position)) &&
    ![...actors.values()].some((actor) => actor.id !== actorId && actor.health > 0 && sameTile(actor.position, position));

  const nearestAlly = (actor: EncounterActor): EncounterActor | null =>
    [...actors.values()]
      .filter((candidate) => candidate.id !== actor.id && candidate.team === actor.team && candidate.health > 0)
      .sort((left, right) => distance(actor.position, left.position) - distance(actor.position, right.position) || compareActor(left, right))[0] ?? null;

  const moveForReaction = (
    actor: EncounterActor,
    source: EncounterActor,
    reaction: NonNullable<StressState["panicReaction"]>,
    emitted: EncounterEvent[],
  ): void => {
    if (reaction === "misidentify") {
      append({
        kind: "target-misidentified",
        timeMs: elapsedMs,
        actorId: actor.id,
        mistakenTargetId: nearestAlly(actor)?.id ?? null,
      }, emitted);
      return;
    }
    if (reaction === "freeze") {
      append({ kind: "unit-froze", timeMs: elapsedMs, actorId: actor.id }, emitted);
      return;
    }
    const from = copyTile(actor.position);
    if (reaction === "retreat") {
      const horizontal = Math.sign(actor.position.x - source.position.x);
      const vertical = Math.sign(actor.position.y - source.position.y);
      const candidates = [
        { x: actor.position.x + horizontal, y: actor.position.y },
        { x: actor.position.x, y: actor.position.y + vertical },
        { x: actor.position.x - Math.sign(vertical), y: actor.position.y + Math.sign(horizontal) },
        { x: actor.position.x + Math.sign(vertical), y: actor.position.y - Math.sign(horizontal) },
      ].filter((position) => !sameTile(position, actor.position));
      const destination = candidates.find((position) => isTraversable(position, actor.id));
      if (!destination) {
        append({ kind: "unit-froze", timeMs: elapsedMs, actorId: actor.id }, emitted);
        return;
      }
      actor.position = copyTile(destination);
      append({
        kind: "unit-retreated",
        timeMs: elapsedMs,
        actorId: actor.id,
        sourceId: source.id,
        from,
        to: copyTile(destination),
      }, emitted);
      return;
    }
    const ally = nearestAlly(actor);
    const candidates = ally ? [
      { x: actor.position.x + Math.sign(ally.position.x - actor.position.x), y: actor.position.y },
      { x: actor.position.x, y: actor.position.y + Math.sign(ally.position.y - actor.position.y) },
    ] : [];
    const destination = candidates.find((position) => !sameTile(position, actor.position) && isTraversable(position, actor.id));
    if (destination) actor.position = copyTile(destination);
    append({
      kind: "ally-followed",
      timeMs: elapsedMs,
      actorId: actor.id,
      allyId: ally?.id ?? null,
      from,
      to: copyTile(destination ?? from),
    }, emitted);
  };

  const blockedReason = (
    actor: EncounterActor | undefined,
    target: EncounterActor | undefined,
  ): AttackBlockReason | null => {
    if (!actor) return "unknown-actor";
    if (!target) return "unknown-target";
    if (actor.health <= 0) return "actor-incapacitated";
    if (target.health <= 0) return "target-incapacitated";
    if (actor.team === target.team) return "friendly-target";
    if (distance(actor.position, target.position) > actor.weapon.range) return "out-of-range";
    if (!hasLineOfSight(definition.topology, actor.position, target.position)) return "no-line-of-sight";
    return null;
  };

  const execute = (action: EncounterAction): readonly EncounterEvent[] => {
    const emitted: EncounterEvent[] = [];
    if (action.kind === "relocate") {
      const actor = actors.get(action.actorId);
      if (!actor) throw new RangeError(`Unknown encounter actor "${action.actorId}".`);
      validatePosition(action.position, definition.topology, `Actor "${action.actorId}" relocation`);
      if (definition.topology.blocked.some((tile) => sameTile(tile, action.position))) {
        throw new RangeError(`Actor "${action.actorId}" cannot relocate onto a blocked tile.`);
      }
      actor.position = copyTile(action.position);
      return emitted;
    }
    const actor = actors.get(action.actorId);
    const target = actors.get(action.targetId);
    const reason = blockedReason(actor, target);
    if (reason) {
      append({ kind: "attack-blocked", timeMs: elapsedMs, actorId: action.actorId, targetId: action.targetId, reason }, emitted);
      return emitted;
    }
    const attacker = actor as EncounterActor;
    const defender = target as EncounterActor;
    const inCover = cover.has(tileKey(defender.position));
    const rangePenalty = attacker.weapon.accuracy === 1 && !inCover
      ? 0
      : (distance(attacker.position, defender.position) / attacker.weapon.range) * 0.12;
    const hitChance = clamp(attacker.weapon.accuracy - rangePenalty - (inCover ? 0.25 : 0));
    if (random(`attack:${attacker.id}`).next() < hitChance) {
      const damage = rounded(attacker.weapon.damage * (inCover ? 0.5 : 1));
      defender.health = rounded(clamp(defender.health - damage, 100));
      append({
        kind: "unit-hit",
        timeMs: elapsedMs,
        actorId: attacker.id,
        targetId: defender.id,
        damage,
        remainingHealth: defender.health,
        inCover,
      }, emitted);
    } else {
      append({ kind: "attack-missed", timeMs: elapsedMs, actorId: attacker.id, targetId: defender.id }, emitted);
    }
    if (defender.health <= 0 || attacker.weapon.suppression <= 0) return emitted;

    const suppression = rounded(attacker.weapon.suppression * (inCover ? 0.55 : 1));
    const transition = applySuppression(
      defender.stress,
      suppression,
      elapsedMs,
      defender.disposition,
      defender.profile,
      random(`panic:${defender.id}`),
    );
    defender.stress = transition.state;
    append({
      kind: "unit-suppressed",
      timeMs: elapsedMs,
      actorId: defender.id,
      sourceId: attacker.id,
      suppression: defender.stress.suppression,
    }, emitted);
    if (transition.started) moveForReaction(defender, attacker, transition.started, emitted);
    return emitted;
  };

  const advance = (amountMs: number): readonly EncounterEvent[] => {
    if (!Number.isFinite(amountMs) || amountMs < 0) {
      throw new RangeError("Encounter advance time must be a finite non-negative number.");
    }
    accumulatedMs += amountMs;
    const emitted: EncounterEvent[] = [];
    while (accumulatedMs >= ENCOUNTER_FIXED_STEP_MS) {
      accumulatedMs -= ENCOUNTER_FIXED_STEP_MS;
      elapsedMs += ENCOUNTER_FIXED_STEP_MS;
      [...actors.values()].sort(compareActor).forEach((actor) => {
        const recovery = recoverFromPanic(actor.stress, actor.profile, elapsedMs);
        actor.stress = recovery.state;
        if (recovery.recovered) {
          append({ kind: "panic-recovered", timeMs: elapsedMs, actorId: actor.id }, emitted);
        }
      });
    }
    return emitted;
  };

  const snapshot = (): EncounterSnapshot => ({
    id: definition.id,
    elapsedMs,
    fixedStepMs: ENCOUNTER_FIXED_STEP_MS,
    actors: [...actors.values()].sort(compareActor).map((actor) => ({
      id: actor.id,
      team: actor.team,
      position: copyTile(actor.position),
      health: actor.health,
      suppression: rounded(actor.stress.suppression),
      panicReaction: actor.stress.panicReaction,
    })),
  });

  const events = (): readonly EncounterEvent[] => structuredClone(eventLog);
  return { execute, advance, snapshot, events };
}
