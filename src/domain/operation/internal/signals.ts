import type { HarnessConfiguration } from "../../../simulation/simulationTypes";

export function deliveryDelay(harness: HarnessConfiguration, queuedBefore: number): number {
  return Math.round(600 + harness.informationReach * 1_000 + (1 - harness.feedbackCompression) * 1_200 + queuedBefore * 120);
}
export function verificationDelay(harness: HarnessConfiguration, queuedBefore: number, congested: boolean): number {
  return Math.round(700 + harness.verificationDepth * 1_500 + (congested ? 3_000 : 0) + queuedBefore * 80);
}
export function reportReliability(harness: HarnessConfiguration, verificationOfficer: boolean, saturated: boolean): number {
  return Math.round(Math.min(1, Math.max(0, 0.52 + harness.feedbackCompression * 0.28 + (verificationOfficer ? 0.1 : 0) - (saturated ? 0.08 : 0))) * 10_000) / 10_000;
}
