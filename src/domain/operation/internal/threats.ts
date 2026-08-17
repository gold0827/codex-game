import type { ThreatSeverity } from "../../../campaign/types";
import { SEVERITY_DAMAGE, SEVERITY_THRESHOLD } from "./operationTypes";

export function threatDamage(severity: ThreatSeverity): number { return SEVERITY_DAMAGE[severity]; }
export function isThreatBlocked(defense: number, severity: ThreatSeverity): boolean { return defense >= SEVERITY_THRESHOLD[severity]; }
