import { describe, expect, it } from "vitest";
import {
  SQUAD_BATTLE_DURATION_MS,
  SQUAD_BATTLE_STEP_MS,
  createSquadBattle,
  type SquadBattleCommand,
  type SquadBattleSimulation,
  type SquadBattleSnapshot,
} from "../../../src/domain/operation/operationEngine";

type ScriptStep =
  | Readonly<{ command: SquadBattleCommand }>
  | Readonly<{ advanceMs: number }>;

const order = (
  squadId: "main" | "relief",
  battleOrder: Extract<SquadBattleCommand, { kind: "order" }>["order"],
  targetId?: Extract<SquadBattleCommand, { kind: "order" }>["targetId"],
): ScriptStep => ({ command: { kind: "order", squadId, order: battleOrder, targetId } });

const deploy = (route: "north" | "south"): ScriptStep => ({
  command: { kind: "deploy-relief", route },
});

const advance = (advanceMs: number): ScriptStep => ({ advanceMs });

function run(seed: string, steps: readonly ScriptStep[]): SquadBattleSnapshot {
  const battle = createSquadBattle(seed);
  steps.forEach((step) => {
    if ("command" in step) battle.command(step.command);
    else battle.advance(step.advanceMs);
  });
  return battle.snapshot();
}

const PINCER: readonly ScriptStep[] = [
  order("main", "advance"),
  advance(10_000),
  order("main", "hold"),
  advance(20_000),
  deploy("north"),
  advance(25_000),
  order("relief", "focus", "enemy-assault"),
  advance(45_000),
  advance(60_000),
];

const FRONTAL: readonly ScriptStep[] = [
  order("main", "advance"),
  deploy("south"),
  advance(30_000),
  order("main", "advance"),
  order("relief", "advance"),
  advance(60_000),
  advance(45_000),
  advance(45_000),
];

const EARLY_RELIEF: readonly ScriptStep[] = [
  deploy("north"),
  order("relief", "advance"),
  advance(45_000),
  order("relief", "focus", "enemy-reserve"),
  advance(30_000),
  order("main", "advance"),
  advance(45_000),
  advance(60_000),
];

const COUNTERATTACK: readonly ScriptStep[] = [
  order("main", "advance"),
  advance(25_000),
  deploy("south"),
  order("main", "withdraw"),
  advance(20_000),
  order("relief", "focus", "enemy-assault"),
  advance(15_000),
  order("main", "focus", "enemy-assault"),
  advance(25_000),
  order("main", "hold"),
  order("relief", "focus", "enemy-reserve"),
  advance(95_000),
];

describe("squad battle", () => {
  it("starts one headless round with two nine-soldier armies and reserve squads", () => {
    const snapshot = createSquadBattle("initial").snapshot();

    expect(snapshot).toMatchObject({
      elapsedMs: 0,
      durationMs: SQUAD_BATTLE_DURATION_MS,
      fixedStepMs: SQUAD_BATTLE_STEP_MS,
      status: "running",
      bridgeIntegrity: 100,
      convoyProgress: 0,
    });
    expect(snapshot.squads).toHaveLength(4);
    expect(snapshot.squads.every(({ soldiers }) => soldiers.length === 9)).toBe(true);
    expect(snapshot.squads.find(({ id }) => id === "relief")?.active).toBe(false);
    expect(snapshot.squads.find(({ id }) => id === "enemy-reserve")?.active).toBe(false);
  });

  it("delivers player orders on fixed time steps and deploys relief on the chosen route", () => {
    const battle = createSquadBattle("commands");
    battle.command({ kind: "order", squadId: "main", order: "advance" });

    expect(battle.advance(4_999).squads.find(({ id }) => id === "main")).toMatchObject({
      order: "hold",
      pendingOrder: { order: "advance", arrivesAtMs: 5_000 },
    });
    expect(battle.advance(1).squads.find(({ id }) => id === "main")).toMatchObject({
      order: "advance",
      pendingOrder: null,
    });

    expect(battle.command({ kind: "deploy-relief", route: "north" }).squads.find(
      ({ id }) => id === "relief",
    )).toMatchObject({ active: true, route: "north", order: "advance" });
  });

  it("makes delayed pincer and retreat-counterattack plans win", () => {
    const pincer = run("haein-bridge", PINCER);
    const counterattack = run("haein-bridge", COUNTERATTACK);

    expect(pincer).toMatchObject({
      status: "victory",
      elapsedMs: 145_000,
      bridgeIntegrity: 100,
      convoyProgress: 100,
    });
    expect(counterattack).toMatchObject({
      status: "victory",
      elapsedMs: 160_000,
      bridgeIntegrity: 76,
      convoyProgress: 100,
    });
    expect(pincer.events.some(({ description }) => description.includes("협공이 성립했다"))).toBe(true);
    expect(pincer.squads.flatMap(({ soldiers }) => soldiers).some(({ health }) => health < 100)).toBe(true);
  });

  it("punishes frontal overextension and an isolated early relief", () => {
    expect(run("haein-bridge", FRONTAL)).toMatchObject({
      status: "defeat",
      elapsedMs: 180_000,
      bridgeIntegrity: 100,
      convoyProgress: 48,
    });
    expect(run("haein-bridge", EARLY_RELIEF)).toMatchObject({
      status: "defeat",
      elapsedMs: 60_000,
      bridgeIntegrity: 0,
      convoyProgress: 0,
    });
  });

  it("replays the same commands identically for the same seed", () => {
    expect(run("repeatable", PINCER)).toEqual(run("repeatable", PINCER));
  });

  it("rejects invalid elapsed time", () => {
    const battle: SquadBattleSimulation = createSquadBattle("invalid-time");
    expect(() => battle.advance(Number.NaN)).toThrow(RangeError);
    expect(() => battle.advance(-1)).toThrow(RangeError);
  });
});
