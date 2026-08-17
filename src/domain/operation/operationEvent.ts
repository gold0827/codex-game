import type { OperationReplayKind, ReplayDataValue } from "../../simulation/simulationTypes";

export interface OperationEvent {
  readonly id: string;
  readonly sequence: number;
  readonly timeMs: number;
  readonly kind: OperationReplayKind;
  readonly data: Readonly<Record<string, ReplayDataValue>>;
}

export interface OperationReplayProjection extends OperationEvent {
  readonly description: string;
}

export function projectOperationReplay(event: OperationEvent): OperationReplayProjection {
  const data = event.data;
  const value = (key: string): string => String(data[key] ?? "");
  const descriptions: Partial<Record<OperationReplayKind, string>> = {
    "operation-started": `Operation ${value("sceneId")} started.`,
    "beat-activated": `Authored beat ${value("beatId")} activated.`,
    "random-choice": `Random choice for ${value("reason")}: ${value("selected")}.`,
    "report-queued": `Authored report ${value("reportId")} entered the message queue.`,
    "report-delivered": `Report ${value("reportId")} delivered without rewriting authored copy.`,
    "report-verified": `Report ${value("reportId")} was ${value("verificationState")}.`,
    "threat-telegraphed": `Threat ${value("threatId")} telegraphed before resolution.`,
    "threat-resolved": `Threat ${value("threatId")} ${value("result") === "blocked" ? "was blocked" : "damaged its objective"} after its telegraph ended.`,
    "decision": `${value("officerId")} chose ${value("intent")}: ${value("reason")}.`,
    "harness-consequence": `Harness consequence detected: ${value("consequence")}.`,
    "cross-check": `Contradictory sources cross-checked: ${(data.sourceOfficerIds ?? []).toString()}.`,
    "authority-reassigned": `Authority reassigned to ${value("officerId")} for the verified local threat.`,
    "autonomous-replan": "Officers autonomously replanned from cross-checked evidence and reassigned authority.",
    "intervention": value("description"),
    "outcome": `Operation ended with declared outcome ${value("outcomeId")}.`,
  };
  return { ...event, description: descriptions[event.kind] ?? event.kind };
}
