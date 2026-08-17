import {
  createSeededRandom,
  deriveRandomStreamSeed,
  hashSeed,
  type RandomSeed,
  type SeededRandom,
} from "../../../simulation/seededRandom";

function stableId(kind: string, id: string, suffix = ""): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(`A ${kind} random stream requires a non-empty identifier.`);
  }
  return `${kind}:${id}${suffix}`;
}

export const operationRandomStreamKey = Object.freeze({
  officerDecision: (officerId: string): string =>
    stableId("officer", officerId, ":decision"),
  signal: (signalId: string): string => stableId("signal", signalId),
  encounter: (encounterId: string): string =>
    stableId("encounter", encounterId),
});

export type OperationRandomStreams = Readonly<{
  stream: (stableKey: string) => SeededRandom;
}>;

export function createOperationRandomStreams(
  runSeed: RandomSeed,
): OperationRandomStreams {
  hashSeed(runSeed);
  const streams = new Map<string, SeededRandom>();

  const stream = (stableKey: string): SeededRandom => {
    const existing = streams.get(stableKey);
    if (existing) return existing;

    const created = createSeededRandom(
      deriveRandomStreamSeed(runSeed, stableKey),
    );
    streams.set(stableKey, created);
    return created;
  };

  return { stream };
}
