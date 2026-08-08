import { describe, expect, it } from "vitest";

import { createOperationClock } from "../../src/simulation/operationClock";

describe("operation clock", () => {
  it("crosses every due boundary once and in schedule order", () => {
    const clock = createOperationClock([10, 20, 30]);

    expect(clock.advance(25)).toEqual({
      elapsedMs: 25,
      paused: false,
      completed: false,
      nextBoundaryIndex: 2,
    });
    expect(clock.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 10 },
      { boundaryIndex: 1, elapsedMs: 20 },
    ]);

    clock.advance(5);
    expect(clock.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 10 },
      { boundaryIndex: 1, elapsedMs: 20 },
      { boundaryIndex: 2, elapsedMs: 30 },
    ]);
  });

  it("keeps completion stable across later advances", () => {
    const clock = createOperationClock([5, 10]);

    clock.advance(20);
    const completedSnapshot = clock.snapshot();
    const completedReplay = clock.replay();

    expect(completedSnapshot.completed).toBe(true);
    expect(clock.advance(100)).toEqual(completedSnapshot);
    expect(clock.replay()).toEqual(completedReplay);
  });

  it("pauses without changing elapsed time or replay and resumes in place", () => {
    const clock = createOperationClock([10, 20]);

    clock.advance(6);
    expect(clock.pause()).toEqual({
      elapsedMs: 6,
      paused: true,
      completed: false,
      nextBoundaryIndex: 0,
    });
    expect(clock.advance(100)).toEqual(clock.snapshot());
    expect(clock.replay()).toEqual([]);

    clock.resume();
    clock.advance(4);
    expect(clock.snapshot().elapsedMs).toBe(10);
    expect(clock.replay()).toEqual([{ boundaryIndex: 0, elapsedMs: 10 }]);
  });

  it("resets to the exact initial snapshot and an empty replay", () => {
    const clock = createOperationClock([10, 20]);
    const initialSnapshot = clock.snapshot();

    clock.advance(15);
    clock.pause();

    expect(clock.reset()).toEqual(initialSnapshot);
    expect(clock.snapshot()).toEqual(initialSnapshot);
    expect(clock.replay()).toEqual([]);
  });

  it("isolates internal state from schedule, snapshot, and replay mutations", () => {
    const schedule = [10, 20];
    const clock = createOperationClock(schedule);
    schedule[0] = 1;
    clock.advance(10);

    const snapshot = clock.snapshot() as { elapsedMs: number };
    snapshot.elapsedMs = 999;
    const replay = clock.replay() as Array<{
      boundaryIndex: number;
      elapsedMs: number;
    }>;
    replay[0].elapsedMs = 999;
    replay.push({ boundaryIndex: 99, elapsedMs: 999 });

    expect(clock.snapshot().elapsedMs).toBe(10);
    expect(clock.replay()).toEqual([{ boundaryIndex: 0, elapsedMs: 10 }]);
  });

  it("rejects invalid schedules explicitly", () => {
    const invalidSchedules = [
      [],
      [-1],
      [1.5],
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [Number.MAX_SAFE_INTEGER + 1],
      [10, 10],
      [20, 10],
    ];

    invalidSchedules.forEach((schedule) => {
      expect(() => createOperationClock(schedule)).toThrow(RangeError);
    });
  });

  it("rejects invalid advances without changing state", () => {
    const invalidAdvances = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    invalidAdvances.forEach((elapsedMs) => {
      const clock = createOperationClock([10]);
      const initialSnapshot = clock.snapshot();

      expect(() => clock.advance(elapsedMs)).toThrow(RangeError);
      expect(clock.snapshot()).toEqual(initialSnapshot);
      expect(clock.replay()).toEqual([]);
    });
  });

  it("rejects elapsed-time overflow without partially advancing", () => {
    const clock = createOperationClock([Number.MAX_SAFE_INTEGER]);
    clock.advance(Number.MAX_SAFE_INTEGER - 1);
    const snapshot = clock.snapshot();

    expect(() => clock.advance(2)).toThrow(RangeError);
    expect(clock.snapshot()).toEqual(snapshot);
    expect(clock.replay()).toEqual([]);
  });

  it("crosses a zero-millisecond boundary on a zero advance", () => {
    const clock = createOperationClock([0, 10]);

    clock.advance(0);

    expect(clock.replay()).toEqual([{ boundaryIndex: 0, elapsedMs: 0 }]);
  });

  it("is deterministic for identical schedules and command sequences", () => {
    const first = createOperationClock([5, 15, 25]);
    const second = createOperationClock([5, 15, 25]);

    const run = (clock: ReturnType<typeof createOperationClock>) => [
      clock.advance(5),
      clock.pause(),
      clock.advance(100),
      clock.resume(),
      clock.advance(20),
      clock.snapshot(),
    ];

    expect(run(first)).toEqual(run(second));
    expect(first.replay()).toEqual(second.replay());
  });
});
