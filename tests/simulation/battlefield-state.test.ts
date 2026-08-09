import { describe, expect, it } from "vitest";

import { createBattlefieldState } from "../../src/simulation/battlefieldState";

type TestState = {
  phase: string;
  units: { active: number };
};

const state = (phase: string, active: number): TestState => ({
  phase,
  units: { active },
});

describe("battlefield state", () => {
  it("applies every due transition once and in clock boundary order", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      { elapsedMs: 10, state: state("moving", 3) },
      { elapsedMs: 20, state: state("engaged", 2) },
      { elapsedMs: 30, state: state("secured", 2) },
    ]);

    expect(battlefield.advance(25)).toEqual({
      elapsedMs: 25,
      paused: false,
      completed: false,
      nextBoundaryIndex: 2,
      state: state("engaged", 2),
    });
    expect(battlefield.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 10, state: state("moving", 3) },
      { boundaryIndex: 1, elapsedMs: 20, state: state("engaged", 2) },
    ]);

    battlefield.advance(5);
    expect(battlefield.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 10, state: state("moving", 3) },
      { boundaryIndex: 1, elapsedMs: 20, state: state("engaged", 2) },
      { boundaryIndex: 2, elapsedMs: 30, state: state("secured", 2) },
    ]);
  });

  it("pauses state and replay and resumes from the same elapsed time", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      { elapsedMs: 10, state: state("moving", 3) },
      { elapsedMs: 20, state: state("secured", 3) },
    ]);

    battlefield.advance(6);
    const paused = battlefield.pause();
    const replay = battlefield.replay();

    expect(battlefield.advance(100)).toEqual(paused);
    expect(battlefield.replay()).toEqual(replay);

    battlefield.resume();
    expect(battlefield.advance(4)).toEqual({
      elapsedMs: 10,
      paused: false,
      completed: false,
      nextBoundaryIndex: 1,
      state: state("moving", 3),
    });
  });

  it("keeps completion stable across later advances", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      { elapsedMs: 5, state: state("moving", 3) },
      { elapsedMs: 10, state: state("secured", 3) },
    ]);

    battlefield.advance(20);
    const completedSnapshot = battlefield.snapshot();
    const completedReplay = battlefield.replay();

    expect(completedSnapshot.completed).toBe(true);
    expect(battlefield.advance(100)).toEqual(completedSnapshot);
    expect(battlefield.replay()).toEqual(completedReplay);
  });

  it("resets to the exact initial snapshot and an empty replay", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      { elapsedMs: 10, state: state("moving", 3) },
    ]);
    const initialSnapshot = battlefield.snapshot();

    battlefield.advance(10);
    battlefield.pause();

    expect(battlefield.reset()).toEqual(initialSnapshot);
    expect(battlefield.snapshot()).toEqual(initialSnapshot);
    expect(battlefield.replay()).toEqual([]);
  });

  it("isolates internal state from input, snapshots, and replay entries", () => {
    const initialState = state("ready", 3);
    const transitionState = state("moving", 2);
    const schedule = [{ elapsedMs: 10, state: transitionState }];
    const battlefield = createBattlefieldState(initialState, schedule);

    initialState.units.active = 99;
    transitionState.units.active = 99;
    schedule[0].elapsedMs = 1;
    battlefield.advance(10);

    const snapshot = battlefield.snapshot();
    snapshot.state.units.active = 88;
    const replay = battlefield.replay() as Array<{
      boundaryIndex: number;
      elapsedMs: number;
      state: TestState;
    }>;
    replay[0].state.units.active = 77;
    replay.push({
      boundaryIndex: 99,
      elapsedMs: 99,
      state: state("mutated", 99),
    });

    expect(battlefield.snapshot().state).toEqual(state("moving", 2));
    expect(battlefield.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 10, state: state("moving", 2) },
    ]);

    battlefield.reset();
    expect(battlefield.snapshot().state).toEqual(state("ready", 3));
  });

  it("rejects shared-memory-backed snapshot and replay states", () => {
    const sharedState: { bytes: Uint8Array<ArrayBufferLike> } = {
      bytes: new Uint8Array(new SharedArrayBuffer(1)),
    };

    expect(() =>
      createBattlefieldState(sharedState, [
        { elapsedMs: 1, state: { bytes: new Uint8Array(1) } },
      ]),
    ).toThrowError("Initial state must not contain shared memory.");

    expect(() =>
      createBattlefieldState({ bytes: new Uint8Array(1) }, [
        { elapsedMs: 1, state: sharedState },
      ]),
    ).toThrowError(
      "Transition state at index 0 must not contain shared memory.",
    );
  });

  it("rejects invalid schedules explicitly", () => {
    const invalidSchedules = [
      [],
      [{ elapsedMs: -1, state: state("moving", 3) }],
      [{ elapsedMs: 1.5, state: state("moving", 3) }],
      [{ elapsedMs: Number.NaN, state: state("moving", 3) }],
      [
        { elapsedMs: 10, state: state("moving", 3) },
        { elapsedMs: 10, state: state("secured", 3) },
      ],
      [
        { elapsedMs: 20, state: state("moving", 3) },
        { elapsedMs: 10, state: state("secured", 3) },
      ],
    ];

    invalidSchedules.forEach((schedule) => {
      expect(() =>
        createBattlefieldState(state("ready", 3), schedule),
      ).toThrow(RangeError);
    });

    expect(() =>
      createBattlefieldState(
        state("ready", 3),
        new Array<{ elapsedMs: number; state: TestState }>(2),
      ),
    ).toThrow(RangeError);
  });

  it("rejects invalid advances without partially changing state", () => {
    const invalidAdvances = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    invalidAdvances.forEach((elapsedMs) => {
      const battlefield = createBattlefieldState(state("ready", 3), [
        { elapsedMs: 10, state: state("moving", 3) },
      ]);
      const initialSnapshot = battlefield.snapshot();

      expect(() => battlefield.advance(elapsedMs)).toThrow(RangeError);
      expect(battlefield.snapshot()).toEqual(initialSnapshot);
      expect(battlefield.replay()).toEqual([]);
    });
  });

  it("rejects elapsed-time overflow without partially changing state", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      {
        elapsedMs: Number.MAX_SAFE_INTEGER,
        state: state("secured", 3),
      },
    ]);
    battlefield.advance(Number.MAX_SAFE_INTEGER - 1);
    const snapshot = battlefield.snapshot();

    expect(() => battlefield.advance(2)).toThrow(RangeError);
    expect(battlefield.snapshot()).toEqual(snapshot);
    expect(battlefield.replay()).toEqual([]);
  });

  it("crosses a zero-millisecond transition on a zero advance", () => {
    const battlefield = createBattlefieldState(state("ready", 3), [
      { elapsedMs: 0, state: state("moving", 3) },
    ]);

    battlefield.advance(0);

    expect(battlefield.snapshot().state).toEqual(state("moving", 3));
    expect(battlefield.replay()).toEqual([
      { boundaryIndex: 0, elapsedMs: 0, state: state("moving", 3) },
    ]);
  });

  it("is deterministic for identical inputs and command sequences", () => {
    const schedule = [
      { elapsedMs: 5, state: state("moving", 3) },
      { elapsedMs: 15, state: state("engaged", 2) },
      { elapsedMs: 25, state: state("secured", 2) },
    ];
    const first = createBattlefieldState(state("ready", 3), schedule);
    const second = createBattlefieldState(state("ready", 3), schedule);

    const run = (battlefield: typeof first) => [
      battlefield.advance(5),
      battlefield.pause(),
      battlefield.advance(100),
      battlefield.resume(),
      battlefield.advance(20),
      battlefield.snapshot(),
    ];

    expect(run(first)).toEqual(run(second));
    expect(first.replay()).toEqual(second.replay());
  });
});
