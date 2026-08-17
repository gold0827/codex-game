import type { AgentProfile, OfficerDisposition, ThreatLane } from "../../../campaign/types";
import type { BoundedMemory } from "./agent/memory";
import type { PerceptionMemoryEntry } from "./agent/perception";
import type { ActionCommitment } from "./agent/actions";
import type { PanicReaction } from "./encounterTypes";
import type {
  OfficerIntent,
  OperationThreatSnapshot,
  OperationMessageSnapshot,
  OperationSpatialSignalSnapshot,
  OperationReplayKind,
  OperationWorldEventKind,
  OperationStatus,
  ReplayDataValue,
} from "../../../simulation/simulationTypes";

export type MutableOfficer = {
  id: string;
  experienceLevel: number;
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
export type MutableSpatialSignal = Mutable<Omit<OperationSpatialSignalSnapshot, "recipients">> & {
  recipients: Array<Mutable<OperationSpatialSignalSnapshot["recipients"][number]>>;
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
  suppression: number;
  panicReaction: PanicReaction | null;
  objectiveId: string | null;
};
export type MutableMetrics = {
  objectiveProgress: number;
  civilianSafety: number;
  logistics: number;
  organizationTrust: number;
  signalBacklog: number;
  interventionCount: number;
  attentionSpent: number;
  autonomyScore: number;
};
export type OperationRuntimeState = {
  elapsedMs: number;
  accumulatedMs: number;
  status: OperationStatus;
  outcomeId: string | null;
  nextBeatIndex: number;
  messageSequence: number;
  signalSequence: number;
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
export type AppendWorldEvent = (
  kind: OperationWorldEventKind,
  timeMs: number,
  data?: Readonly<Record<string, ReplayDataValue>>,
) => void;
export type SelectAlternative = <Value extends string>(
  reason: string,
  alternatives: readonly Value[],
  timeMs: number,
) => Value;

export const LANES: readonly ThreatLane[] = ["north", "center", "south", "command"];
export const SEVERITY_DAMAGE = { low: 4, medium: 8, high: 13, critical: 19 } as const;
export function clone<Value>(value: Value): Value { return JSON.parse(JSON.stringify(value)) as Value; }
export function clamp(value: number, minimum = 0, maximum = 1): number { return Math.min(maximum, Math.max(minimum, value)); }
export function rounded(value: number): number { return Math.round(value * 10_000) / 10_000; }
