import { describe, expect, it } from "vitest";

import { validateCampaignDefinition } from "../../src/campaign";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

describe("춘천지구 전투 prototype campaign", () => {
  it("is a valid operation-to-epilogue campaign", () => {
    expect(validateCampaignDefinition(chuncheonCampaign)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(chuncheonCampaign.scenes.map(({ identity }) => identity.kind)).toEqual([
      "operation",
      "epilogue",
    ]);
  });

  it("binds the campaign operation to the canonical Chuncheon battle facts", () => {
    const operation = chuncheonCampaign.scenes[0];
    if (!operation) throw new Error("춘천지구 작전 국면이 필요합니다.");

    expect(chuncheonCampaign.startSceneId).toBe(chuncheonAutonomousBattle.id);
    expect(operation.identity.id).toBe(chuncheonAutonomousBattle.id);
    expect(operation.encounterParameters.durationMs).toBe(chuncheonAutonomousBattle.durationMs);
    expect(operation.objectives).toEqual(
      chuncheonAutonomousBattle.objectives.map(({ id, label, required }) => ({
        id,
        description: label,
        required,
      })),
    );
    expect(operation.transitions).toEqual(expect.arrayContaining([
      { outcomeId: "objectives-unmet", targetSceneId: operation.identity.id },
      { outcomeId: "objectives-achieved", targetSceneId: "chuncheon-delay-complete" },
    ]));
  });

  it("uses anonymous operational roles and Korean historical framing", () => {
    expect(chuncheonCampaign.officers).toEqual([
      expect.objectContaining({
        id: "forward-delay-command",
        name: "전방 지연대 지휘 역할",
        rank: "익명",
      }),
      expect.objectContaining({
        id: "operations-verification",
        name: "작전 검증 역할",
        rank: "익명",
      }),
      expect.objectContaining({
        id: "rearward-coordination",
        name: "후속 방어선 연락 역할",
        rank: "익명",
      }),
    ]);
    expect(chuncheonCampaign.officers.every((officer) => !("profile" in officer))).toBe(true);

    const playerCopy = [
      chuncheonCampaign.title,
      ...chuncheonCampaign.officers.flatMap(({ name, rank, role }) => [name, rank, role]),
      ...chuncheonCampaign.scenes.flatMap(({ copy }) => Object.values(copy)),
    ].join(" ");
    expect(playerCopy).toMatch(/[가-힣]/);
    expect(playerCopy).toContain("1950년 6월 25일");
    expect(playerCopy).not.toMatch(/학교|훈련|가상 교전|직접\s*통제/);
  });

  it("leaves player control at harness and exception-intervention level", () => {
    const operation = chuncheonCampaign.scenes[0];
    if (!operation) throw new Error("춘천지구 작전 국면이 필요합니다.");

    expect(operation.guidance).toEqual([]);
    expect(operation.gameplayTuning.interventionBudget).toBeGreaterThan(0);
    expect(JSON.stringify(chuncheonCampaign)).not.toMatch(
      /bridge|haein|route-report|spatial-signal|inspect-officer/,
    );
  });
});
