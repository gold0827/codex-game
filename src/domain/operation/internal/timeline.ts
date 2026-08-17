import {
  assertPlayableCampaignScene,
  type PlayableCampaignScene,
} from "../../../campaign/validation";
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
export function assertPlayableScene(
  scene: CampaignScene,
  roster: readonly CampaignOfficer[],
): asserts scene is PlayableCampaignScene {
  assertPlayableCampaignScene(scene, roster);
  if (!Array.isArray(roster) || roster.length === 0) throw new RangeError("Operation simulation requires at least one officer.");
  const ids = new Set<string>();
  roster.forEach((officer) => { if (ids.has(officer.id)) throw new RangeError(`Duplicate officer identifier "${officer.id}".`); ids.add(officer.id); });
  scene.beats.forEach((beat) => {
    beat.reports.forEach((report) => { if (!ids.has(report.officerId)) throw new RangeError(`Report "${report.id}" references an officer outside the roster.`); });
  });
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
  processSpatialSignals: () => void;
  processCrossCheckAndReplan: () => void;
  processThreats: () => void;
  updateProgress: (stepMs: number) => void;
  finishOperation: () => void;
  snapshot: () => OperationSnapshot;
};

export function createTimeline(context: TimelineContext) {
  const {
    durationMs, orderedBeats, state, appendReplay, queueReport, telegraphThreat, refreshDecisions,
    processMessages, processSpatialSignals, processCrossCheckAndReplan, processThreats, updateProgress, finishOperation, snapshot,
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
    processSpatialSignals();
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
