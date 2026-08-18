// Public operation-domain facade; implementation details stay internal.
export { createOperationSimulation } from "./internal/operationRuntime";
export {
  SQUAD_BATTLE_DURATION_MS,
  SQUAD_BATTLE_STEP_MS,
  createSquadBattle,
  type SquadBattleCommand,
  type SquadBattleEvent,
  type SquadBattleOrder,
  type SquadBattleRoute,
  type SquadBattleSimulation,
  type SquadBattleSnapshot,
  type SquadBattleSoldierSnapshot,
  type SquadBattleSquadId,
  type SquadBattleSquadSnapshot,
  type SquadBattleStatus,
} from "./internal/squadBattleRuntime";
