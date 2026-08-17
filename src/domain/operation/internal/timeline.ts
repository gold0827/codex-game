import type { CampaignEncounterBeat, CampaignOfficer, CampaignOfficerReport, CampaignScene, CampaignThreat } from "../../../campaign/types";
import { OPERATION_FIXED_STEP_MS, type OperationSnapshot } from "../../../simulation/simulationTypes";
import type { AppendReplay, OperationRuntimeState } from "./operationTypes";

export function orderBeats(beats: readonly CampaignEncounterBeat[]): CampaignEncounterBeat[] {
  return [...beats].sort((left, right) => left.timeMs - right.timeMs);
}
export function dueBeats(beats: readonly CampaignEncounterBeat[], startIndex: number, elapsedMs: number) {
  const activated: CampaignEncounterBeat[] = [];
  let index = startIndex;
  while (index < beats.length && (beats[index]?.timeMs ?? Number.POSITIVE_INFINITY) <= elapsedMs) {
    activated.push(beats[index] as CampaignEncounterBeat);
    index += 1;
  }
  return { beats: activated, nextIndex: index };
}
export function assertPlayableScene(scene: CampaignScene, roster: readonly CampaignOfficer[]): void {
  if (scene.identity.kind === "epilogue") throw new RangeError("Operation simulation requires a playable scene.");
  if (!Number.isSafeInteger(scene.encounterParameters.durationMs) || scene.encounterParameters.durationMs <= 0) throw new RangeError("A playable scene must have a positive safe duration.");
  if (!Array.isArray(roster) || roster.length === 0) throw new RangeError("Operation simulation requires at least one officer.");
  const ids = new Set<string>();
  roster.forEach((officer) => { if (ids.has(officer.id)) throw new RangeError(`Duplicate officer identifier "${officer.id}".`); ids.add(officer.id); });
  scene.beats.forEach((beat) => {
    if (!Number.isSafeInteger(beat.timeMs) || beat.timeMs < 0 || beat.timeMs > scene.encounterParameters.durationMs) throw new RangeError(`Beat "${beat.id}" has an invalid activation time.`);
    beat.reports.forEach((report) => { if (!ids.has(report.officerId)) throw new RangeError(`Report "${report.id}" references an officer outside the roster.`); });
    beat.threats.forEach((threat) => { if (!Number.isSafeInteger(threat.telegraphDurationMs) || threat.telegraphDurationMs <= 0 || threat.telegraphDurationMs > scene.encounterParameters.durationMs - beat.timeMs) throw new RangeError(`Threat "${threat.id}" cannot complete its telegraph before the operation ends.`); });
  });
  if (!scene.transitions.some(({ outcomeId }) => outcomeId === "retry") || !scene.transitions.some(({ outcomeId }) => outcomeId !== "retry")) throw new RangeError("A playable scene must declare retry and non-retry outcomes.");
}

type TimelineContext = {
  sceneId: string;
  durationMs: number;
  orderedBeats: readonly CampaignEncounterBeat[];
  state: OperationRuntimeState;
  appendReplay: AppendReplay;
  queueReport: (report: CampaignOfficerReport, timeMs: number) => void;
  telegraphThreat: (threat: CampaignThreat, timeMs: number) => void;
  refreshDecisions: (reason: string, timeMs: number) => void;
  processMessages: () => void;
  processCrossCheckAndReplan: () => void;
  processThreats: () => void;
  updateProgress: (stepMs: number) => void;
  finishOperation: () => void;
  snapshot: () => OperationSnapshot;
};

export function createTimeline(context: TimelineContext) {
  const {
    durationMs, orderedBeats, state, appendReplay, queueReport, telegraphThreat, refreshDecisions,
    processMessages, processCrossCheckAndReplan, processThreats, updateProgress, finishOperation, snapshot,
  } = context;

  const activateBeat = (beat: CampaignEncounterBeat): void => {
    appendReplay("beat-activated", beat.timeMs, `Authored beat ${beat.id} activated.`, {
      beatId: beat.id,
      authoredTimeMs: beat.timeMs,
    });
    beat.reports.forEach((report) => queueReport(report, beat.timeMs));
    beat.threats.forEach((threat) => telegraphThreat(threat, beat.timeMs));
    refreshDecisions(`beat ${beat.id} changed locally available information`, beat.timeMs);
  };
  const activateDueBeats = (): void => {
    const due = dueBeats(orderedBeats, state.nextBeatIndex, state.elapsedMs);
    due.beats.forEach(activateBeat);
    state.nextBeatIndex = due.nextIndex;
  };
  const step = (stepMs: number): void => {
    state.elapsedMs += stepMs;
    activateDueBeats();
    processMessages();
    processCrossCheckAndReplan();
    processThreats();
    updateProgress(stepMs);
    if (state.elapsedMs === durationMs) finishOperation();
  };
  const advance = (advanceMs: number): OperationSnapshot => {
    if (!Number.isSafeInteger(advanceMs) || advanceMs < 0) {
      throw new RangeError("Operation advances must be non-negative safe integer milliseconds.");
    }
    if (state.status !== "running") return snapshot();
    if (!Number.isSafeInteger(state.accumulatedMs + advanceMs)) {
      throw new RangeError("Operation accumulated time must remain a safe integer.");
    }
    state.accumulatedMs += advanceMs;
    while (state.status === "running") {
      const remainingDuration = durationMs - state.elapsedMs;
      const nextStepMs = Math.min(OPERATION_FIXED_STEP_MS, remainingDuration);
      if (state.accumulatedMs < nextStepMs) break;
      state.accumulatedMs -= nextStepMs;
      step(nextStepMs);
    }
    return snapshot();
  };
  return { activateBeat, activateDueBeats, step, advance };
}
