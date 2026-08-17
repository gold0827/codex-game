import type { HarnessConfiguration, OfficerIntent } from "../../../simulation/simulationTypes";
import type { OfficerDisposition } from "../../../campaign/types";

export function confidenceFor(disposition: OfficerDisposition, harness: HarnessConfiguration): number {
  const raw = disposition === "action"
    ? 0.35 + harness.authorityClarity * 0.55
    : disposition === "verification"
      ? 0.3 + harness.verificationDepth * 0.62
      : 0.25 + harness.informationReach * 0.32 + harness.feedbackCompression * 0.3;
  return Math.round(Math.min(1, Math.max(0, raw)) * 10_000) / 10_000;
}

export function intentAlternatives(disposition: OfficerDisposition): readonly OfficerIntent[] {
  if (disposition === "action") return ["advance-locally", "advance-locally", "engage-threat", "secure-objective"];
  if (disposition === "verification") return ["cross-check-report", "cross-check-report", "inspect-source", "hold-for-evidence"];
  return ["route-report", "route-report", "broadcast-update", "compress-feedback"];
}
