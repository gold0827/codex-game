import type { OfficerDisposition, ThreatLane } from "../../../campaign/types";
import type { OfficerIntent, OfficerBeliefSnapshot, OperationThreatSnapshot, OperationMessageSnapshot } from "../../../simulation/simulationTypes";

export type MutableOfficer = {
  id: string;
  disposition: OfficerDisposition;
  intent: OfficerIntent;
  confidence: number;
  beliefs: OfficerBeliefSnapshot[];
  pendingDecision: { intent: OfficerIntent; reason: string; dueAtMs: number } | null;
  authorized: boolean;
};
export type MutableMessage = Omit<OperationMessageSnapshot, "verificationDueAtMs"> & {
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
  position: number;
  route: ThreatLane[];
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

export const LANES: readonly ThreatLane[] = ["north", "center", "south", "command"];
export const SEVERITY_THRESHOLD = { low: 0.3, medium: 0.42, high: 0.52, critical: 0.58 } as const;
export const SEVERITY_DAMAGE = { low: 4, medium: 8, high: 13, critical: 19 } as const;
