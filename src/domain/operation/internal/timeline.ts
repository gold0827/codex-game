import type { CampaignEncounterBeat, CampaignOfficer, CampaignScene } from "../../../campaign/types";

export function orderBeats(beats: readonly CampaignEncounterBeat[]): CampaignEncounterBeat[] {
  return [...beats].sort((left, right) => left.timeMs - right.timeMs);
}

export function dueBeats(
  beats: readonly CampaignEncounterBeat[],
  startIndex: number,
  elapsedMs: number,
): { beats: CampaignEncounterBeat[]; nextIndex: number } {
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
