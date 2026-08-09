export type RandomSeed = string | number;

export type SeededRandom = Readonly<{
  next: () => number;
  integer: (maximumExclusive: number) => number;
  pick: <Value>(values: readonly Value[]) => Value;
}>;

function seedText(seed: RandomSeed): string {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError("A numeric random seed must be a safe integer.");
    }
    return String(seed);
  }

  if (typeof seed !== "string" || seed.length === 0) {
    throw new TypeError("A random seed must be a non-empty string or safe integer.");
  }

  return seed;
}

export function hashSeed(seed: RandomSeed): number {
  const value = seedText(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function deriveRunSeed(
  campaignId: string,
  sceneId: string,
  attemptSeed: RandomSeed,
): string {
  if (campaignId.length === 0 || sceneId.length === 0) {
    throw new TypeError("Campaign and scene identifiers must be non-empty.");
  }

  return `${campaignId}:${sceneId}:${seedText(attemptSeed)}`;
}

export function createSeededRandom(seed: RandomSeed): SeededRandom {
  let state = hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const integer = (maximumExclusive: number): number => {
    if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
      throw new RangeError("Random integer bounds must be positive safe integers.");
    }

    return Math.floor(next() * maximumExclusive);
  };

  const pick = <Value>(values: readonly Value[]): Value => {
    if (!Array.isArray(values) || values.length === 0) {
      throw new RangeError("Random choices must contain at least one alternative.");
    }

    return values[integer(values.length)] as Value;
  };

  return { next, integer, pick };
}
