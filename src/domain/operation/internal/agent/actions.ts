import type { OfficerDisposition } from "../../../../campaign/types";

export type OfficerIntent =
  | "advance-locally"
  | "engage-threat"
  | "secure-objective"
  | "cross-check-report"
  | "inspect-source"
  | "hold-for-evidence"
  | "route-report"
  | "broadcast-update"
  | "compress-feedback";

export const OFFICER_ACTION_KINDS = [
  "move",
  "investigate",
  "defend",
  "verify",
  "broadcast",
  "support",
  "retreat",
] as const;

export type OfficerActionKind = typeof OFFICER_ACTION_KINDS[number];
export type OfficerActionTargetKind =
  | "position"
  | "belief"
  | "officer"
  | "objective"
  | "area";

export type OfficerActionTarget = Readonly<{
  kind: OfficerActionTargetKind;
  id: string;
}>;

export type OfficerAction = Readonly<{
  kind: OfficerActionKind;
  target: OfficerActionTarget;
}>;

export type DecisionAlternative = Readonly<{
  action: OfficerAction;
  utility: number;
}>;

export type DecisionTrace = Readonly<{
  selectedAction: OfficerAction;
  utility: number;
  topReason: string;
  abandonedAlternative: DecisionAlternative;
}>;

export type ActionCommitment = Readonly<{
  trace: DecisionTrace;
  startedAtMs: number;
  endsAtMs: number;
}>;

export const DEFAULT_INTENT_BY_DISPOSITION = Object.freeze({
  action: "advance-locally",
  verification: "cross-check-report",
  communication: "route-report",
} satisfies Record<OfficerDisposition, OfficerIntent>);

export function intentForAction(action: OfficerActionKind): OfficerIntent {
  if (action === "move") return "advance-locally";
  if (action === "investigate") return "inspect-source";
  if (action === "defend") return "secure-objective";
  if (action === "verify") return "cross-check-report";
  if (action === "broadcast") return "broadcast-update";
  if (action === "support") return "route-report";
  return "hold-for-evidence";
}
