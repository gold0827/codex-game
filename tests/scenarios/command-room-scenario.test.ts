import { describe, expect, it } from "vitest";

import {
  commandRoomScenario,
  type CommandProtocolId,
  type CommandRoomSimulation,
} from "../../src/scenarios/commandRoomScenario";

const simulations = Object.entries(commandRoomScenario.protocolSimulations) as Array<
  [CommandProtocolId, CommandRoomSimulation]
>;

function scheduleContractViolations(simulation: CommandRoomSimulation): string[] {
  const violations: string[] = [];
  const timelinePhaseCount = simulation.timeline.phases.length;
  const tacticalMapPhaseCount = simulation.tacticalMap.phases.length;
  const expectedBoundaryCount = Math.max(0, timelinePhaseCount - 1);

  if (tacticalMapPhaseCount !== timelinePhaseCount) {
    violations.push("timeline and tactical-map phases differ");
  }

  if (simulation.transitionScheduleMs.length !== expectedBoundaryCount) {
    violations.push("transition boundary count differs from timeline");
  }

  simulation.transitionScheduleMs.forEach((boundary, index) => {
    if (!Number.isSafeInteger(boundary) || boundary <= 0) {
      violations.push(`boundary ${index} is not a positive safe integer`);
    }

    if (index > 0 && boundary <= simulation.transitionScheduleMs[index - 1]) {
      violations.push(`boundary ${index} is not strictly increasing`);
    }
  });

  return violations;
}

describe("command-room scenario operation schedules", () => {
  it.each(simulations)(
    "%s owns one valid elapsed-millisecond boundary per transition",
    (_protocol, simulation) => {
      expect(scheduleContractViolations(simulation)).toEqual([]);
    },
  );

  it("keeps deterministic schedules as scenario data", () => {
    expect(commandRoomScenario.protocolSimulations.independent.transitionScheduleMs).toEqual([
      8_000, 18_000, 30_000, 42_000,
    ]);
    expect(commandRoomScenario.protocolSimulations["cross-check"].transitionScheduleMs).toEqual([
      8_000, 16_000, 28_000, 44_000,
    ]);
  });

  it.each([
    ["a missing boundary", (simulation: CommandRoomSimulation) => {
      simulation.transitionScheduleMs.pop();
    }],
    ["a zero boundary", (simulation: CommandRoomSimulation) => {
      simulation.transitionScheduleMs[0] = 0;
    }],
    ["a fractional boundary", (simulation: CommandRoomSimulation) => {
      simulation.transitionScheduleMs[0] = 1.5;
    }],
    ["an unsafe boundary", (simulation: CommandRoomSimulation) => {
      simulation.transitionScheduleMs[0] = Number.MAX_SAFE_INTEGER + 1;
    }],
    ["a non-increasing boundary", (simulation: CommandRoomSimulation) => {
      simulation.transitionScheduleMs[1] = simulation.transitionScheduleMs[0];
    }],
  ] as const)("rejects %s", (_caseName, mutate) => {
    const simulation = structuredClone(commandRoomScenario.protocolSimulations.independent);

    mutate(simulation);

    expect(scheduleContractViolations(simulation)).not.toEqual([]);
  });

  it.each([
    ["timeline", (simulation: CommandRoomSimulation) => {
      simulation.timeline.phases.pop();
    }],
    ["tactical map", (simulation: CommandRoomSimulation) => {
      simulation.tacticalMap.phases.pop();
    }],
  ] as const)("rejects a schedule misaligned with the %s phases", (_surface, mutate) => {
    const simulation = structuredClone(commandRoomScenario.protocolSimulations.independent);

    mutate(simulation);

    expect(scheduleContractViolations(simulation)).not.toEqual([]);
  });

  it("retains each protocol's phase order, map states, and outcome", () => {
    const independent = commandRoomScenario.protocolSimulations.independent;
    const crossCheck = commandRoomScenario.protocolSimulations["cross-check"];

    expect(independent.timeline.phases.map(({ title }) => title)).toEqual([
      "명령 하달",
      "경로 선정",
      "정찰 경고 수신",
      "수송 2호차 고립",
      "작전 실패",
    ]);
    expect(independent.tacticalMap.phases.map(({ state }) => state)).toEqual([
      "command",
      "route",
      "warning",
      "stranded",
      "failed",
    ]);
    expect(independent.outcome).toBe(commandRoomScenario.outcome);

    expect(crossCheck.timeline.phases.map(({ title }) => title)).toEqual([
      "명령 하달",
      "경로 정보 충돌 확인",
      "정찰 경고 공유",
      "남쪽 임시 도로로 재경로 설정",
      "목표 확보",
    ]);
    expect(crossCheck.tacticalMap.phases.map(({ state }) => state)).toEqual([
      "command",
      "command",
      "command",
      "rerouted",
      "secured",
    ]);
    expect(crossCheck.outcome).toMatchObject({
      tone: "success",
      verdict: "작전 성공",
      title: "수송대가 모두 도착했습니다",
      metric: "91 / 100",
    });
  });
});
