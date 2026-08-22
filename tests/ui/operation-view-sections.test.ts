import { describe, expect, it, vi } from "vitest";

import { createProductionCampaignOperationFactory } from "../../src/application/campaign-operation";
import { createGameSession } from "../../src/application/game-session";
import type { CommandDispatcher } from "../../src/presentation/dom";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { renderOperationCommandBar } from "../../src/presentation/phases/operation/commandBarSection";
import { renderFormationsSection } from "../../src/presentation/phases/operation/formationsSection";
import { renderHarnessSection } from "../../src/presentation/phases/operation/harnessSection";
import { renderObjectivesSection } from "../../src/presentation/phases/operation/objectivesSection";
import { renderRecentEventsSection } from "../../src/presentation/phases/operation/recentEventsSection";
import { renderTraceSection } from "../../src/presentation/phases/operation/traceSection";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

function operationView(selectedActorId: string | null = null) {
  const session = createGameSession(chuncheonCampaign, "operation-sections", undefined, {
    operationFactory: createProductionCampaignOperationFactory(chuncheonAutonomousBattle),
  });
  session.dispatch({ type: "start-attempt" });
  session.advance(250);
  const view = projectGameViewModel(session.read(), {
    title: chuncheonCampaign.title,
    sceneCount: chuncheonCampaign.scenes.length,
    roles: chuncheonCampaign.roles,
  }, selectedActorId);
  if (!view.operation) throw new Error("The operation section fixture must be running.");
  return { operation: view.operation, session };
}

describe("canonical operation section renderers", () => {
  it("renders command, harness, objective, and recent-event sections from projected fields", () => {
    const { session } = operationView();
    const formationId = session.read().operation?.formations[0]?.id;
    if (!formationId) throw new Error("A formation is required for an intervention receipt.");
    session.dispatch({ type: "set-formation-intent", formationId, intentId: "hold" });
    const projected = projectGameViewModel(session.read(), {
      title: chuncheonCampaign.title,
      sceneCount: chuncheonCampaign.scenes.length,
      roles: chuncheonCampaign.roles,
    }).operation;
    if (!projected) throw new Error("The projected operation must be present.");
    const dispatch = vi.fn<CommandDispatcher>();

    const commandBar = renderOperationCommandBar(projected, dispatch);
    commandBar.querySelector<HTMLButtonElement>('[data-action="pause"]')?.click();
    expect(dispatch).toHaveBeenCalledWith({ type: "pause" }, undefined, "pause-operation");
    expect(commandBar.querySelector(".intervention-accepted")?.textContent)
      .toContain("편성 개입 접수");

    expect(renderHarnessSection(projected.harness).querySelector(".canonical-policy-list"))
      .not.toBeNull();
    expect(renderObjectivesSection(projected.objectives).querySelectorAll(".objective-row"))
      .toHaveLength(chuncheonAutonomousBattle.objectives.length);
    expect(renderRecentEventsSection(projected.recentEvents).querySelector(".event-flow-list"))
      .not.toBeNull();
  });

  it("keeps actor selection and formation interventions behind narrow callbacks", () => {
    const { operation } = operationView();
    const dispatch = vi.fn<CommandDispatcher>();
    const onSelectActor = vi.fn<(actorId: string) => void>();
    const section = renderFormationsSection({
      formations: operation.formations,
      remainingBudget: operation.interventionBudget.remaining,
    }, dispatch, onSelectActor);

    section.querySelector<HTMLButtonElement>(".actor-select")?.click();
    expect(onSelectActor).toHaveBeenCalledWith(operation.formations[0]?.actors[0]?.id);

    const formation = operation.formations[0];
    if (!formation) throw new Error("A formation is required for intervention controls.");
    const card = section.querySelector<HTMLElement>(`[data-formation-id="${formation.id}"]`)!;
    const inputs = card.querySelectorAll<HTMLInputElement>("input");
    inputs[0]!.value = "delay-and-withdraw";
    card.querySelector<HTMLButtonElement>('[data-action="set-formation-intent"]')?.click();
    inputs[1]!.value = "verify-before-contact";
    card.querySelector<HTMLButtonElement>('[data-action="issue-guidance"]')?.click();

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "set-formation-intent",
      formationId: formation.id,
      intentId: "delay-and-withdraw",
    }, undefined, `formation-${formation.id}-set-intent`);
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "issue-guidance",
      guidanceId: "verify-before-contact",
      recipientFormationIds: [formation.id],
    }, undefined, `formation-${formation.id}-issue-guidance`);
  });

  it("does not render intervention controls for hostile formations", () => {
    const { operation } = operationView();
    const section = renderFormationsSection({
      formations: operation.formations,
      remainingBudget: operation.interventionBudget.remaining,
    }, vi.fn<CommandDispatcher>(), vi.fn());
    const hostile = operation.formations.find(({ sideId }) => sideId === "kpa");
    if (!hostile) throw new Error("The Chuncheon fixture must include a hostile formation.");
    const card = section.querySelector<HTMLElement>(`[data-formation-id="${hostile.id}"]`)!;

    expect(card.querySelector('[data-action="set-formation-intent"]')).toBeNull();
    expect(card.querySelector('[data-action="issue-guidance"]')).toBeNull();
  });

  it("explains a rejected intervention against a formation outside player control", () => {
    const { session } = operationView();
    const hostile = session.read().operation?.formations.find(({ sideId }) => sideId === "kpa");
    if (!hostile) throw new Error("The Chuncheon fixture must include a hostile formation.");

    session.dispatch({
      type: "set-formation-intent",
      formationId: hostile.id,
      intentId: "retreat",
    });
    const projected = projectGameViewModel(session.read(), {
      title: chuncheonCampaign.title,
      sceneCount: chuncheonCampaign.scenes.length,
      roles: chuncheonCampaign.roles,
    }).operation;
    if (!projected) throw new Error("The projected operation must be present.");

    expect(renderOperationCommandBar(projected, vi.fn<CommandDispatcher>()).textContent)
      .toContain("통제 권한이 없는 편성입니다.");
  });

  it("renders the selected actor's ordered five-stage trace and the empty state", () => {
    const unselected = operationView().operation;
    expect(renderTraceSection(unselected.selectedActor).textContent)
      .toContain("행동 주체를 선택하면 판단 과정을 확인할 수 있습니다.");

    const actorId = unselected.formations[0]?.actors[0]?.id;
    if (!actorId) throw new Error("An actor is required for the trace fixture.");
    const selected = operationView(actorId).operation.selectedActor;
    const trace = renderTraceSection(selected);
    expect(trace.querySelectorAll(".decision-stage")).toHaveLength(5);
    expect([...trace.querySelectorAll(".decision-stage strong")].map(({ textContent }) => textContent))
      .toEqual(["정보 수신", "정보 검증", "권한 판단", "행동 실행", "결과 피드백"]);
  });
});
