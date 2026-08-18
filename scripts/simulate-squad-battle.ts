import {
  createSquadBattle,
  type SquadBattleCommand,
  type SquadBattleSnapshot,
} from "../src/domain/operation/operationEngine";

type StrategyName = "pincer" | "frontal" | "early-relief" | "counterattack";
type StrategyStep =
  | Readonly<{ command: SquadBattleCommand }>
  | Readonly<{ advanceMs: number }>;

const strategies = Object.freeze({
  pincer: [
    order("main", "advance"),
    advance(10_000),
    order("main", "hold"),
    advance(20_000),
    deploy("north"),
    advance(25_000),
    order("relief", "focus", "enemy-assault"),
    advance(45_000),
    advance(60_000),
  ],
  frontal: [
    order("main", "advance"),
    deploy("south"),
    advance(30_000),
    order("main", "advance"),
    order("relief", "advance"),
    advance(60_000),
    advance(45_000),
    advance(45_000),
  ],
  "early-relief": [
    deploy("north"),
    order("relief", "advance"),
    advance(45_000),
    order("relief", "focus", "enemy-reserve"),
    advance(30_000),
    order("main", "advance"),
    advance(45_000),
    advance(60_000),
  ],
  counterattack: [
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
  ],
} satisfies Readonly<Record<StrategyName, readonly StrategyStep[]>>);

function order(
  squadId: "main" | "relief",
  battleOrder: Extract<SquadBattleCommand, { kind: "order" }>["order"],
  targetId?: Extract<SquadBattleCommand, { kind: "order" }>["targetId"],
): StrategyStep {
  return { command: { kind: "order", squadId, order: battleOrder, targetId } };
}

function deploy(route: "north" | "south"): StrategyStep {
  return { command: { kind: "deploy-relief", route } };
}

function advance(advanceMs: number): StrategyStep {
  return { advanceMs };
}

function runStrategy(name: StrategyName, seed: string): SquadBattleSnapshot {
  const battle = createSquadBattle(seed);
  let snapshot = battle.snapshot();
  strategies[name].forEach((step) => {
    snapshot = "command" in step
      ? battle.command(step.command)
      : battle.advance(step.advanceMs);
  });
  return snapshot;
}

function result(name: StrategyName, snapshot: SquadBattleSnapshot): object {
  return {
    strategy: name,
    status: snapshot.status,
    elapsedMs: snapshot.elapsedMs,
    bridgeIntegrity: snapshot.bridgeIntegrity,
    convoyProgress: snapshot.convoyProgress,
    squads: snapshot.squads.map((squad) => ({
      id: squad.id,
      active: squad.active,
      routed: squad.routed,
      position: squad.position,
      survivors: squad.soldiers.filter(({ health }) => health > 0).length,
      fatigue: Math.round(squad.fatigue),
      morale: Math.round(squad.morale),
    })),
    finalEvent: snapshot.events.at(-1)?.description ?? null,
  };
}

function parseArguments(args: readonly string[]): { strategy: StrategyName | "all"; seed: string } {
  let strategy: StrategyName | "all" = "all";
  let seed = "haein-bridge";
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value) throw new TypeError(`${option} requires a value.`);
    if (option === "--strategy") {
      if (value !== "all" && !(value in strategies)) {
        throw new RangeError(`Unknown strategy ${value}.`);
      }
      strategy = value as StrategyName | "all";
    } else if (option === "--seed") {
      seed = value;
    } else {
      throw new TypeError(`Unknown option ${option}.`);
    }
  }
  return { strategy, seed };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const names = options.strategy === "all"
    ? Object.keys(strategies) as StrategyName[]
    : [options.strategy];
  const output = names.map((name) => result(name, runStrategy(name, options.seed)));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
