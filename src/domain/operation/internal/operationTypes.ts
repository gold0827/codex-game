import type { AgentProfile, OfficerDisposition, ThreatLane } from "../../../campaign/types";
import type { BoundedMemory } from "./agent/memory";
import type { PerceptionMemoryEntry } from "./agent/perception";
import type { ActionCommitment } from "./agent/actions";
import type {
  OfficerIntent,
  OperationThreatSnapshot,
  OperationMessageSnapshot,
  OperationReplayKind,
  OperationStatus,
  ReplayDataValue,
} from "../../../simulation/simulationTypes";

export type MutableOfficer = {
  id: string;
  disposition: OfficerDisposition;
  intent: OfficerIntent;
  confidence: number;
  profile: AgentProfile;
  memory: BoundedMemory<PerceptionMemoryEntry>;
  decisionCadenceMs: number;
  committedAction: ActionCommitment | null;
  authorized: boolean;
};
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
export type MutableMessage = Mutable<Omit<OperationMessageSnapshot, "verificationDueAtMs">> & {
  verificationDueAtMs: number | null;
};
export type MutableThreat = Omit<OperationThreatSnapshot, "state" | "result"> & {
  state: "telegraphed" | "resolved";
  result: "blocked" | "damaged-objective" | null;
};
export type MutableObjective = { id: string; required: boolean; progress: number; completed: boolean };
export type MutableUnit = {
  officerId: string;
  lane: ThreatLane;
  intent: OfficerIntent;
  health: number;
  objectiveId: string | null;
};
export type MutableMetrics = {
  objectiveProgress: number;
  civilianSafety: number;
  logistics: number;
  organizationTrust: number;
  signalBacklog: number;
  interventionCount: number;
  autonomyScore: number;
};
export type OperationRuntimeState = {
  elapsedMs: number;
  accumulatedMs: number;
  status: OperationStatus;
  outcomeId: string | null;
  nextBeatIndex: number;
  messageSequence: number;
  crossChecked: boolean;
  authorityReassigned: boolean;
  autonomousReplan: boolean;
};
export type AppendReplay = (
  kind: OperationReplayKind,
  timeMs: number,
  description: string,
  data?: Readonly<Record<string, ReplayDataValue>>,
) => void;
export type SelectAlternative = <Value extends string>(
  reason: string,
  alternatives: readonly Value[],
  timeMs: number,
) => Value;

export const LANES: readonly ThreatLane[] = ["north", "center", "south", "command"];
export const SEVERITY_THRESHOLD = { low: 0.3, medium: 0.42, high: 0.52, critical: 0.58 } as const;
export const SEVERITY_DAMAGE = { low: 4, medium: 8, high: 13, critical: 19 } as const;
export function clone<Value>(value: Value): Value { return JSON.parse(JSON.stringify(value)) as Value; }
export function clamp(value: number, minimum = 0, maximum = 1): number { return Math.min(maximum, Math.max(minimum, value)); }
export function rounded(value: number): number { return Math.round(value * 10_000) / 10_000; }
