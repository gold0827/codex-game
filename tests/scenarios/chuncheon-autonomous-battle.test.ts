import { describe, expect, it } from "vitest";

import type { AutonomousBattleDefinition } from "../../src/campaign";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";

const definition: AutonomousBattleDefinition = chuncheonAutonomousBattle;

const actors = definition.formations.flatMap((formation) => formation.actors);

describe("춘천지구 자율 난전 시나리오", () => {
  it("public 자율 전장 계약을 만족하고 시나리오 배열로 편성 크기를 정한다", () => {
    const formationSizes = definition.formations.map(({ actors: formationActors }) =>
      formationActors.length);

    expect(definition.id).toBe("chuncheon-delay-1950-06-25");
    expect(formationSizes).toEqual([3, 4, 2, 4, 3, 3, 2]);
    expect(actors).toHaveLength(21);
    expect(actors).not.toHaveLength(36);
  });

  it("국군과 북한군을 비대칭으로 편성하고 모든 ID를 고유하게 유지한다", () => {
    const rokFormations = definition.formations.filter(({ sideId }) => sideId === "rok");
    const kpaFormations = definition.formations.filter(({ sideId }) => sideId === "kpa");
    const formationIds = definition.formations.map(({ id }) => id);
    const actorIds = actors.map(({ id }) => id);

    expect(new Set(definition.formations.map(({ sideId }) => sideId))).toEqual(
      new Set(["rok", "kpa"]),
    );
    expect(rokFormations).toHaveLength(3);
    expect(kpaFormations).toHaveLength(4);
    expect(rokFormations.flatMap(({ actors: sideActors }) => sideActors)).toHaveLength(9);
    expect(kpaFormations.flatMap(({ actors: sideActors }) => sideActors)).toHaveLength(12);
    expect(new Set(formationIds).size).toBe(formationIds.length);
    expect(new Set(actorIds).size).toBe(actorIds.length);
  });

  it("모든 익명 역할에 고유 profile과 판단·실행 변동성을 명시한다", () => {
    const traitSignatures = actors.map(({ profile, variability }) =>
      JSON.stringify({ profile, variability }));

    for (const actor of actors) {
      expect(actor.label).toMatch(/역할$/);
      expect(actor.role).not.toBe("");
      expect(actor.profile.memoryCapacity).toBeGreaterThan(0);
      expect(actor.variability.decisionNoise).toBeGreaterThan(0);
      expect(actor.variability.executionNoise).toBeGreaterThan(0);

      for (const trait of [
        actor.profile.initiative,
        actor.profile.caution,
        actor.profile.discipline,
        actor.profile.cooperation,
        actor.profile.stressTolerance,
        actor.variability.decisionNoise,
        actor.variability.executionNoise,
      ]) {
        expect(trait).toBeGreaterThanOrEqual(0);
        expect(trait).toBeLessThanOrEqual(1);
      }
    }

    expect(new Set(traitSignatures).size).toBe(actors.length);
  });

  it("섬멸 대신 지연·후속 방어 준비·전투력 보존 철수를 요구한다", () => {
    expect(definition.objectives).toEqual([
      expect.objectContaining({ id: "delay-southward-advance", required: true }),
      expect.objectContaining({ id: "prepare-follow-on-defense", required: true }),
      expect.objectContaining({ id: "withdraw-with-combat-power", required: true }),
    ]);
    expect(definition.objectives.map(({ label }) => label).join(" ")).not.toMatch(/섬멸|전멸/);
  });

  it("초기 전투와 시간차 증원을 함께 정의한다", () => {
    expect(definition.formations.some(({ entry }) => entry.kind === "present")).toBe(true);
    expect(definition.formations.some(({ entry }) => entry.kind === "elapsed")).toBe(true);

    for (const formation of definition.formations) {
      if (formation.entry.kind === "elapsed") {
        expect(formation.entry.atMs).toBeGreaterThan(0);
        expect(formation.entry.atMs).toBeLessThan(definition.durationMs);
      }
    }
  });
});
