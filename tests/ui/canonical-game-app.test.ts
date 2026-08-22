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

    const battlefield = root.querySelector<HTMLElement>('[data-region="battlefield"]');
    expect(battlefield).not.toBeNull();
    expect(battlefield?.querySelectorAll("canvas")).toHaveLength(1);
    expect(battlefield?.dataset.visualState).toBe("degraded");
    expect(battlefield?.dataset.operationState).toBe("running");
    expect(battlefield?.dataset.formationCount).toBe("7");
    expect(battlefield?.dataset.actorCount).toBe("21");
    expect(battlefield?.dataset.controlledFormationCount).toBe("3");
    expect(battlefield?.dataset.uncontrolledFormationCount).toBe("4");
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
    const actor = root.querySelector<HTMLButtonElement>(".battlefield-actor-pip");
    actor?.click();
    expect(root.querySelectorAll(".decision-stage-list li")).toHaveLength(5);
    expect(root.querySelector(".decision-stage-list")?.textContent).toContain("정보 수신");
    expect(root.querySelector('[data-action="inspect-actor"]')).not.toBeNull();
    expect(app.session.read()).not.toHaveProperty("selectedActorId");

    const selectedActor = root.querySelector<HTMLButtonElement>(
      `.battlefield-actor-pip[data-actor-id="${actor?.dataset.actorId}"]`,
    );
    selectedActor?.focus();
    app.render();
    expect((document.activeElement as HTMLElement | null)?.dataset.actorId)
      .toBe(actor?.dataset.actorId);

    const dockActor = root.querySelector<HTMLButtonElement>(".actor-select");
    dockActor?.focus();
    app.render();
    expect(document.activeElement?.classList.contains("actor-select")).toBe(true);
    expect((document.activeElement as HTMLElement | null)?.dataset.actorId)
      .toBe(dockActor?.dataset.actorId);
  });

  it("offers formation-level interventions without actor commands", () => {
    root.querySelector<HTMLButtonElement>('[data-action="start-attempt"]')?.click();
    expect(root.querySelector('[data-action="set-formation-intent"]')).not.toBeNull();
    expect(root.querySelector('[data-action="issue-guidance"]')).not.toBeNull();
    expect(root.querySelector('[data-action="authorize-officer"]')).toBeNull();
    expect(root.querySelector('[data-action="route-report"]')).toBeNull();
    expect(root.querySelector('[data-action="prioritize-verification"]')).toBeNull();

    const guidance = root.querySelector<HTMLInputElement>('[aria-label$="하네스 지침"]');
    const formationDock = root.querySelector<HTMLElement>(".formation-dock-list");
    guidance?.focus();
    if (guidance) {
      guidance.value = "우회로 경계 강화";
      guidance.setSelectionRange(3, 7);
    }
    if (formationDock) formationDock.scrollLeft = 180;

    app.render();

    const restoredGuidance = root.querySelector<HTMLInputElement>('[aria-label$="하네스 지침"]');
    expect(restoredGuidance?.value).toBe("우회로 경계 강화");
    expect(document.activeElement).toBe(restoredGuidance);
    expect(restoredGuidance?.selectionStart).toBe(3);
    expect(restoredGuidance?.selectionEnd).toBe(7);
    expect(root.querySelector<HTMLElement>(".formation-dock-list")?.scrollLeft).toBe(180);

    restoredGuidance?.closest(".formation-card")
      ?.querySelector<HTMLButtonElement>('[data-action="issue-guidance"]')
      ?.click();
    expect(root.querySelector(".intervention-accepted")?.textContent).toContain("편성 개입 접수");
    expect(root.querySelector<HTMLInputElement>('[aria-label$="하네스 지침"]')?.value)
      .toBe("우회로 경계 강화");
  });

  it("finishes the Chuncheon campaign without legacy epilogue framing", () => {
    app.session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 1,
        authorityClarity: 1,
        verificationDepth: 1,
        feedbackCompression: 0,
      },
    });
    app.session.dispatch({ type: "start-attempt" });
    app.session.advance(chuncheonAutonomousBattle.durationMs);
    app.render();

    const lesson = root.querySelector<HTMLButtonElement>('[data-action="choose-lesson"]');
    expect(lesson).not.toBeNull();
    lesson?.click();

    expect(root.querySelector('[data-phase="epilogue"]')).not.toBeNull();
    expect(root.textContent).toContain("춘천지구 지연전 종료");
    expect(root.textContent).not.toMatch(/학교|훈련|온실|바질/);
    expect(root.querySelector(".pixel-garden")).toBeNull();
  });
});
