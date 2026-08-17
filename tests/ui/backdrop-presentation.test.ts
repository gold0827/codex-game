import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import { renderBriefingView } from "../../src/presentation/phases/briefingView";
import { renderDebriefView } from "../../src/presentation/phases/debriefView";
import { renderEpilogueView } from "../../src/presentation/phases/epilogueView";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { bridgeDefenseCampaign } from "../../src/scenarios/bridgeDefenseOperation";

describe("authored phase backdrops", () => {
  const campaignView = {
    title: bridgeDefenseCampaign.title,
    sceneCount: bridgeDefenseCampaign.scenes.length,
    officers: bridgeDefenseCampaign.officers,
  };
  const dispatch = () => undefined;

  it("projects the authored identifier and exposes a stable phase-root style key", () => {
    const snapshot = createGameSession(bridgeDefenseCampaign, "backdrop-dusk").read();
    const dusk = projectGameViewModel(snapshot, campaignView);
    const dawnSnapshot = structuredClone(snapshot);
    Object.assign(dawnSnapshot.scene.presentation, { backdropId: "haein-river-dawn" });
    const dawn = projectGameViewModel(dawnSnapshot, campaignView);

    const briefing = renderBriefingView(dusk, dispatch);
    const debrief = renderDebriefView(dusk, dispatch);
    const epilogue = renderEpilogueView(dawn, dispatch);

    expect(dusk.backdrop).toEqual({ id: "haein-river-dusk", style: "haein-river-dusk" });
    expect(dawn.backdrop).toEqual({ id: "haein-river-dawn", style: "haein-river-dawn" });
    expect([briefing, debrief, epilogue].map(({ dataset }) => ({
      phase: dataset.phase,
      id: dataset.backdropId,
      style: dataset.backdropStyle,
    }))).toEqual([
      { phase: "briefing", id: "haein-river-dusk", style: "haein-river-dusk" },
      { phase: "debrief", id: "haein-river-dusk", style: "haein-river-dusk" },
      { phase: "epilogue", id: "haein-river-dawn", style: "haein-river-dawn" },
    ]);
  });

  it("preserves an unknown authored identifier while selecting the readable default", () => {
    const snapshot = structuredClone(
      createGameSession(bridgeDefenseCampaign, "backdrop-fallback").read(),
    );
    Object.assign(snapshot.scene.presentation, { backdropId: "unreleased-scene" });

    const view = projectGameViewModel(snapshot, campaignView);
    const briefing = renderBriefingView(view, dispatch);

    expect(view.backdrop).toEqual({ id: "unreleased-scene", style: "default" });
    expect(briefing.dataset.backdropId).toBe("unreleased-scene");
    expect(briefing.dataset.backdropStyle).toBe("default");
  });
});
