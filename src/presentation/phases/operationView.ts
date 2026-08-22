import { node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";
import { renderOperationCommandBar } from "./operation/commandBarSection";
import { renderFormationsSection } from "./operation/formationsSection";
import { renderHarnessSection } from "./operation/harnessSection";
import { renderObjectivesSection } from "./operation/objectivesSection";
import { renderRecentEventsSection } from "./operation/recentEventsSection";
import { renderTraceSection } from "./operation/traceSection";

export function renderOperationView(
  view: GameViewModel,
  dispatch: CommandDispatcher,
  onSelectActor: (actorId: string) => void,
  battlefield: HTMLElement,
): HTMLElement {
  const operation = view.operation;
  const main = node("main", "operation-screen autonomous-operation-screen");
  main.dataset.phase = "operation";
  if (!operation) return main;

  const left = node("aside", "operation-sidebar operation-sidebar-left");
  left.dataset.scrollKey = "operation-left-sidebar";
  left.append(
    renderHarnessSection(operation.harness),
    renderObjectivesSection(operation.objectives),
  );
  const center = node("section", "battlefield-column");
  const battlefieldStage = node("div", "battlefield-stage");
  battlefieldStage.append(battlefield);
  center.append(
    battlefieldStage,
    renderFormationsSection(
      {
        formations: operation.formations,
        remainingBudget: operation.interventionBudget.remaining,
      },
      dispatch,
      onSelectActor,
    ),
  );
  const right = node("aside", "operation-sidebar operation-sidebar-right");
  right.dataset.scrollKey = "operation-right-sidebar";
  right.append(
    renderTraceSection(operation.selectedActor),
    renderRecentEventsSection(operation.recentEvents),
  );
  const grid = node("div", "operation-grid canonical-operation-grid");
  grid.append(left, center, right);
  main.append(renderOperationCommandBar(operation, dispatch), grid);
  return main;
}
