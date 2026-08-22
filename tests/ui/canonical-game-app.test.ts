import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProductionCampaignOperationFactory } from "../../src/application/campaign-operation";
import { createGameSession } from "../../src/application/game-session";
import { mountGameApp, type GameApp } from "../../src/ui/GameApp";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

describe("canonical game app", () => {
  let root: HTMLElement;
  let app: GameApp;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.querySelector<HTMLElement>("#root")!;
    const session = createGameSession(
      chuncheonCampaign,
      "canonical-browser",
      undefined,
      { operationFactory: createProductionCampaignOperationFactory(chuncheonAutonomousBattle) },
    );
    app = mountGameApp(root, chuncheonCampaign, session);
  });

  afterEach(() => app.destroy());

  it("renders arbitrary formations, objective evidence, and local actor inspection", () => {
    root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]')?.click();

    expect(root.querySelectorAll(".formation-card")).toHaveLength(
      chuncheonAutonomousBattle.formations.length,
    );
    expect(root.querySelectorAll(".actor-select")).toHaveLength(
      chuncheonAutonomousBattle.formations.reduce(
        (total, formation) => total + formation.actors.length,
        0,
      ),
    );
    expect(root.querySelectorAll(".objective-evidence-list li").length).toBeGreaterThan(0);

    app.session.advance(250);
    app.render();
    const actor = root.querySelector<HTMLButtonElement>(".actor-select");
    actor?.click();
    expect(root.querySelectorAll(".decision-stage-list li")).toHaveLength(5);
    expect(root.querySelector(".decision-stage-list")?.textContent).toContain("정보 수신");
    expect(root.querySelector('[data-action="inspect-actor"]')).not.toBeNull();
    expect(app.session.read()).not.toHaveProperty("selectedActorId");
  });

  it("offers formation-level interventions without actor commands", () => {
    root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]')?.click();
    expect(root.querySelector('[data-action="set-formation-intent"]')).not.toBeNull();
    expect(root.querySelector('[data-action="issue-guidance"]')).not.toBeNull();
    expect(root.querySelector('[data-action="authorize-officer"]')).toBeNull();
    expect(root.querySelector('[data-action="route-report"]')).toBeNull();
    expect(root.querySelector('[data-action="prioritize-verification"]')).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-action="set-formation-intent"]')?.click();
    expect(root.querySelector(".intervention-accepted")?.textContent).toContain("편성 개입 접수");
  });
});
