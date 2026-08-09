import {
  createOperationClock,
  type OperationClockSnapshot,
} from "./operationClock";

export type BattlefieldTransition<State> = Readonly<{
  elapsedMs: number;
  state: State;
}>;

export type BattlefieldStateSnapshot<State> = Readonly<
  OperationClockSnapshot & {
    state: State;
  }
>;

export type BattlefieldStateReplayEntry<State> = Readonly<{
  boundaryIndex: number;
  elapsedMs: number;
  state: State;
}>;

export type BattlefieldStateMachine<State> = Readonly<{
  snapshot: () => BattlefieldStateSnapshot<State>;
  replay: () => ReadonlyArray<BattlefieldStateReplayEntry<State>>;
  advance: (elapsedMs: number) => BattlefieldStateSnapshot<State>;
  pause: () => BattlefieldStateSnapshot<State>;
  resume: () => BattlefieldStateSnapshot<State>;
  reset: () => BattlefieldStateSnapshot<State>;
}>;

function isSharedArrayBuffer(value: object): value is SharedArrayBuffer {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    (value instanceof SharedArrayBuffer ||
      Object.prototype.toString.call(value) === "[object SharedArrayBuffer]")
  );
}

function assertNoSharedMemory(value: unknown, description: string): void {
  const visited = new Set<object>();

  const visit = (candidate: unknown): void => {
    if (typeof candidate !== "object" || candidate === null) {
      return;
    }

    if (isSharedArrayBuffer(candidate)) {
      throw new TypeError(`${description} must not contain shared memory.`);
    }

    if (visited.has(candidate)) {
      return;
    }
    visited.add(candidate);

    if (ArrayBuffer.isView(candidate)) {
      visit(candidate.buffer);
      return;
    }

    if (candidate instanceof Map) {
      candidate.forEach((mapValue, key) => {
        visit(key);
        visit(mapValue);
      });
      return;
    }

    if (candidate instanceof Set) {
      candidate.forEach(visit);
      return;
    }

    Reflect.ownKeys(candidate).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor && "value" in descriptor) {
        visit(descriptor.value);
      }
    });
  };

  visit(value);
}

function cloneState<State>(state: State, description: string): State {
  let clonedState: State;

  try {
    clonedState = structuredClone(state);
  } catch {
    throw new TypeError(`${description} must be structured-cloneable.`);
  }

  assertNoSharedMemory(clonedState, description);
  return clonedState;
}

function readSchedule<State>(
  schedule: readonly BattlefieldTransition<State>[],
): Array<BattlefieldTransition<State>> {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new RangeError(
      "Battlefield transition schedule must contain a transition.",
    );
  }

  const transitions: Array<BattlefieldTransition<State>> = [];

  for (let index = 0; index < schedule.length; index += 1) {
    if (!(index in schedule)) {
      throw new RangeError(
        "Battlefield transition schedule must not contain empty entries.",
      );
    }

    const transition = schedule[index] as BattlefieldTransition<State> | null;
    if (
      typeof transition !== "object" ||
      transition === null ||
      !Object.hasOwn(transition, "elapsedMs") ||
      !Object.hasOwn(transition, "state")
    ) {
      throw new RangeError(
        "Every battlefield transition must contain elapsedMs and state.",
      );
    }

    transitions.push(transition);
  }

  return transitions;
}

export function createBattlefieldState<State>(
  initialState: State,
  schedule: readonly BattlefieldTransition<State>[],
): BattlefieldStateMachine<State> {
  const sourceTransitions = readSchedule(schedule);
  const clock = createOperationClock(
    sourceTransitions.map((transition) => transition.elapsedMs),
  );
  const initialStateSnapshot = cloneState(initialState, "Initial state");
  const transitions = sourceTransitions.map((transition, index) => ({
    elapsedMs: transition.elapsedMs,
    state: cloneState(transition.state, `Transition state at index ${index}`),
  }));

  const snapshot = (): BattlefieldStateSnapshot<State> => {
    const clockSnapshot = clock.snapshot();
    const latestBoundary = clock.replay().at(-1);
    const currentState = latestBoundary
      ? transitions[latestBoundary.boundaryIndex].state
      : initialStateSnapshot;

    return {
      ...clockSnapshot,
      state: cloneState(currentState, "Battlefield state"),
    };
  };

  const replay = (): ReadonlyArray<BattlefieldStateReplayEntry<State>> =>
    clock.replay().map((entry) => ({
      ...entry,
      state: cloneState(
        transitions[entry.boundaryIndex].state,
        "Battlefield replay state",
      ),
    }));

  const advance = (elapsedMs: number): BattlefieldStateSnapshot<State> => {
    clock.advance(elapsedMs);
    return snapshot();
  };

  const pause = (): BattlefieldStateSnapshot<State> => {
    clock.pause();
    return snapshot();
  };

  const resume = (): BattlefieldStateSnapshot<State> => {
    clock.resume();
    return snapshot();
  };

  const reset = (): BattlefieldStateSnapshot<State> => {
    clock.reset();
    return snapshot();
  };

  return { snapshot, replay, advance, pause, resume, reset };
}
