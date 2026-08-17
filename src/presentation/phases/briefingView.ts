import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";
import { renderHarnessControls } from "../gameChrome";

export function renderBriefingView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const main = node("main", "briefing-screen");
  main.dataset.phase = "briefing";
  const copy = node("section", "briefing-copy panel-card");
  const briefing = view.briefing;
  copy.append(
    node("p", "eyebrow", `라운드 ${briefing?.round ?? 1}`),
    node("h2", undefined, "작전 브리핑"),
    node("p", "briefing-lead", briefing?.briefing ?? ""),
    node("p", "lesson-copy", briefing?.lesson ?? ""),
    node("h3", undefined, "작전 목표"),
  );
  const objectives = node("ul", "briefing-objectives");
  briefing?.objectives.forEach((objective) => {
    objectives.append(node("li", objective.required ? "required-objective" : "optional-objective", objective.label));
  });
  const start = commandButton("작전 시작", "start-attempt", { type: "start-attempt" }, dispatch, {
    focusKey: "pause-operation",
  });
  start.classList.add("primary-button");
  copy.append(objectives, start);
  main.append(copy, renderHarnessControls(view, dispatch));
  return main;
}
