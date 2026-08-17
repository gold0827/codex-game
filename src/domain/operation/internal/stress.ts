import type { AgentProfile, OfficerDisposition } from "../../../campaign/types";
import type { SeededRandom } from "../../../simulation/seededRandom";
import type { PanicReaction } from "./encounterTypes";

export type StressState = {
  suppression: number;
  panicReaction: PanicReaction | null;
  panicStartedAtMs: number | null;
  recoverAtMs: number | null;
};

export type PanicTransition = Readonly<{
  state: StressState;
  started: PanicReaction | null;
}>;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function createStressState(): StressState {
  return {
    suppression: 0,
    panicReaction: null,
    panicStartedAtMs: null,
    recoverAtMs: null,
  };
}

export function panicThreshold(profile: AgentProfile): number {
  return 0.45 + profile.stressTolerance * 0.3;
}

export function selectPanicReaction(
  disposition: OfficerDisposition,
  profile: AgentProfile,
  random: SeededRandom,
): PanicReaction {
  const scores: Readonly<Record<PanicReaction, number>> = {
    retreat: profile.caution + (disposition === "verification" ? 0.15 : 0),
    misidentify: 1 - profile.discipline + (disposition === "action" ? 0.1 : 0),
    "follow-ally": profile.cooperation + (disposition === "communication" ? 0.15 : 0),
    freeze: 1 - profile.initiative,
  };
  const highest = Math.max(...Object.values(scores));
  const alternatives = (Object.keys(scores) as PanicReaction[]).filter(
    (reaction) => scores[reaction] === highest,
  );
  return alternatives.length === 1
    ? alternatives[0] as PanicReaction
    : random.pick(alternatives);
}

export function applySuppression(
  state: StressState,
  amount: number,
  timeMs: number,
  disposition: OfficerDisposition,
  profile: AgentProfile,
  random: SeededRandom,
): PanicTransition {
  const suppression = clamp(state.suppression + Math.max(0, amount));
  if (state.panicReaction || suppression < panicThreshold(profile)) {
    return { state: { ...state, suppression }, started: null };
  }

  const reaction = selectPanicReaction(disposition, profile, random);
  const recoversAutonomously = profile.discipline + profile.stressTolerance >= 1.5;
  const recoveryDelayMs = 1_000 + Math.round(
    (2 - profile.discipline - profile.stressTolerance) * 1_000,
  );
  return {
    state: {
      suppression,
      panicReaction: reaction,
      panicStartedAtMs: timeMs,
      recoverAtMs: recoversAutonomously ? timeMs + recoveryDelayMs : null,
    },
    started: reaction,
  };
}

export function recoverFromPanic(
  state: StressState,
  profile: AgentProfile,
  timeMs: number,
): Readonly<{ state: StressState; recovered: boolean }> {
  if (!state.panicReaction || state.recoverAtMs === null || timeMs < state.recoverAtMs) {
    return { state, recovered: false };
  }
  return {
    state: {
      suppression: panicThreshold(profile) * 0.5,
      panicReaction: null,
      panicStartedAtMs: null,
      recoverAtMs: null,
    },
    recovered: true,
  };
}
