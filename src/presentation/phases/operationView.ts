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
): HTMLElement {
  const operation = view.operation;
  const main = node("main", "operation-screen autonomous-operation-screen");
  main.dataset.phase = "operation";
  if (!operation) return main;

  const left = node("aside", "operation-sidebar operation-sidebar-left");
  left.append(
    renderHarnessSection(operation.harness),
    renderObjectivesSection(operation.objectives),
  );
  const center = node("section", "formation-column");
  center.append(renderFormationsSection(
    {
      formations: operation.formations,
      remainingBudget: operation.interventionBudget.remaining,
    },
    dispatch,
    onSelectActor,
  ));
  const right = node("aside", "operation-sidebar operation-sidebar-right");
  right.append(
    renderTraceSection(operation.selectedActor),
    renderRecentEventsSection(operation.recentEvents),
  );
  const grid = node("div", "operation-grid canonical-operation-grid");
  grid.append(left, center, right);
  main.append(renderOperationCommandBar(operation, dispatch), grid);
  return main;
}
