import {
  createSquadBattle,
  type SquadBattleCommand,
  type SquadBattleSimulation,
  type SquadBattleSnapshot,
} from "../domain/operation/operationEngine";
import type { RandomSeed } from "../simulation/seededRandom";

export type SquadBattleSpeed = 0.5 | 1 | 2;

export type SquadBattleGameCommand =
  | Readonly<{ type: "battle-command"; command: SquadBattleCommand }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "resume" }>
  | Readonly<{ type: "set-speed"; speed: SquadBattleSpeed }>
  | Readonly<{ type: "reset" }>;

export type SquadBattleSessionSnapshot = Readonly<{
  battle: SquadBattleSnapshot;
  paused: boolean;
  speed: SquadBattleSpeed;
}>;

export type SquadBattleSession = Readonly<{
  read: () => SquadBattleSessionSnapshot;
  dispatch: (command: SquadBattleGameCommand) => SquadBattleSessionSnapshot;
  advance: (realElapsedMs: number) => SquadBattleSessionSnapshot;
}>;

export function createSquadBattleSession(
  seed: RandomSeed = "haein-bridge-browser",
): SquadBattleSession {
  let battle: SquadBattleSimulation = createSquadBattle(seed);
  let paused = false;
  let speed: SquadBattleSpeed = 1;

  const read = (): SquadBattleSessionSnapshot => ({
    battle: battle.snapshot(),
    paused,
    speed,
  });

  const dispatch = (command: SquadBattleGameCommand): SquadBattleSessionSnapshot => {
    if (command.type === "battle-command") {
      battle.command(command.command);
    } else if (command.type === "pause") {
      paused = true;
    } else if (command.type === "resume") {
      if (battle.snapshot().status === "running") paused = false;
    } else if (command.type === "set-speed") {
      speed = command.speed;
    } else {
      battle = createSquadBattle(seed);
      paused = false;
      speed = 1;
    }
    return read();
  };

  const advance = (realElapsedMs: number): SquadBattleSessionSnapshot => {
    if (!Number.isFinite(realElapsedMs) || realElapsedMs < 0) {
      throw new RangeError("Squad battle session time must be a finite non-negative number.");
    }
    if (!paused && battle.snapshot().status === "running") {
      const snapshot = battle.advance(realElapsedMs * speed);
      if (snapshot.status !== "running") paused = true;
    }
    return read();
  };

  return { read, dispatch, advance };
}
