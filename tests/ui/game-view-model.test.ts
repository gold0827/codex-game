import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

describe("game presentation view model", () => {
  const campaignView = {
    title: completeCampaign.title,
    sceneCount: completeCampaign.scenes.length,
    officers: completeCampaign.officers,
  };

  it("projects authored briefing state into player-facing values", () => {
    const session = createGameSession(completeCampaign, "view-model-briefing");
    const view = projectGameViewModel(session.read(), campaignView);

    expect(view.phase).toBe("briefing");
    expect(view.header.stats).toContainEqual(["상태", "브리핑"]);
    expect(view.briefing?.objectives[0]?.label).toMatch(/^필수 · /);
    expect(view.harness.map(({ displayedValue }) => displayedValue)).toEqual(
      Object.values(session.read().harness).map((value) => `${Math.round(value * 100)}%`),
    );
  });

  it("projects live operation diagnostics into display-safe labels", () => {
    const session = createGameSession(completeCampaign, "view-model-operation");
    session.dispatch({ type: "start-attempt" });
    session.advance(4_000);
    const snapshot = session.read();
    const view = projectGameViewModel(snapshot, campaignView);

    expect(view.operation?.metrics.map(([label]) => label)).toEqual([
      "목표 진척",
      "민간 안전",
      "보급",
      "조직 신뢰",
      "자율도",
    ]);
    expect(view.operation?.officers[0]?.facts.flat()).not.toContain(
      snapshot.operation?.officers[0]?.pendingDecision?.reason,
    );
    expect(view.operation?.battlefield.units[0]?.intentLabel).toBeTruthy();
    expect(view.operation?.recipients[0]?.label).toContain(completeCampaign.officers[0]?.name);
    expect(view.operation?.events.length).toBeGreaterThan(0);
    expect(view.operation?.events.every(({ label }) => !/[A-Za-z]{4}/.test(label))).toBe(true);
  });
});
