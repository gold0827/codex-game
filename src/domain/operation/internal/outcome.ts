export function operationSucceeded(readiness: number, blockedRatio: number, civilianSafety: number, logistics: number, requiredReplanSatisfied: boolean): boolean {
  return readiness >= 0.52 && blockedRatio >= 0.6 && civilianSafety >= 65 && logistics >= 65 && requiredReplanSatisfied;
}
