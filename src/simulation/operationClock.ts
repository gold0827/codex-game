export type OperationClockSnapshot = Readonly<{
  elapsedMs: number;
  paused: boolean;
  completed: boolean;
  nextBoundaryIndex: number;
}>;

export type OperationClockReplayEntry = Readonly<{
  boundaryIndex: number;
  elapsedMs: number;
}>;

export type OperationClock = Readonly<{
  snapshot: () => OperationClockSnapshot;
  replay: () => ReadonlyArray<OperationClockReplayEntry>;
  advance: (elapsedMs: number) => OperationClockSnapshot;
  pause: () => OperationClockSnapshot;
  resume: () => OperationClockSnapshot;
  reset: () => OperationClockSnapshot;
}>;

function validateSchedule(schedule: readonly number[]): void {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new RangeError("Operation clock schedule must contain a boundary.");
  }

  schedule.forEach((elapsedMs, index) => {
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
      throw new RangeError(
        "Operation clock boundaries must be non-negative safe integer milliseconds.",
      );
    }

    if (index > 0 && elapsedMs <= schedule[index - 1]) {
      throw new RangeError(
        "Operation clock boundaries must be in strictly increasing order.",
      );
    }
  });
}

function validateElapsedMs(elapsedMs: number): void {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(
      "Operation clock advances must be non-negative safe integer milliseconds.",
    );
  }
}

export function createOperationClock(
  schedule: readonly number[],
): OperationClock {
  validateSchedule(schedule);

  const boundaries = [...schedule];
  let elapsedMs = 0;
  let paused = false;
  let nextBoundaryIndex = 0;
  let replayEntries: OperationClockReplayEntry[] = [];

  const snapshot = (): OperationClockSnapshot => ({
    elapsedMs,
    paused,
    completed: nextBoundaryIndex === boundaries.length,
    nextBoundaryIndex,
  });

  const replay = (): ReadonlyArray<OperationClockReplayEntry> =>
    replayEntries.map((entry) => ({ ...entry }));

  const advance = (advanceMs: number): OperationClockSnapshot => {
    validateElapsedMs(advanceMs);

    if (paused || nextBoundaryIndex === boundaries.length) {
      return snapshot();
    }

    const nextElapsedMs = elapsedMs + advanceMs;
    if (!Number.isSafeInteger(nextElapsedMs)) {
      throw new RangeError(
        "Operation clock elapsed time must remain a safe integer.",
      );
    }
    elapsedMs = nextElapsedMs;

    while (
      nextBoundaryIndex < boundaries.length &&
      boundaries[nextBoundaryIndex] <= elapsedMs
    ) {
      replayEntries.push({
        boundaryIndex: nextBoundaryIndex,
        elapsedMs: boundaries[nextBoundaryIndex],
      });
      nextBoundaryIndex += 1;
    }

    return snapshot();
  };

  const pause = (): OperationClockSnapshot => {
    paused = true;
    return snapshot();
  };

  const resume = (): OperationClockSnapshot => {
    paused = false;
    return snapshot();
  };

  const reset = (): OperationClockSnapshot => {
    elapsedMs = 0;
    paused = false;
    nextBoundaryIndex = 0;
    replayEntries = [];
    return snapshot();
  };

  return { snapshot, replay, advance, pause, resume, reset };
}
