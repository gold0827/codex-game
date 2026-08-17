import type { CampaignEncounterBeat } from "../../../campaign/types";

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
