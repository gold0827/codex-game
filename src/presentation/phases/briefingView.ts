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
  const lessons = node("section", "briefing-officer-lessons");
  lessons.dataset.region = "officer-lessons";
  if (briefing?.officerLessons.length) {
    lessons.append(node("h3", undefined, "장교가 기억한 교훈"));
    briefing.officerLessons.forEach((memory) => {
      const item = node("article", "briefing-officer-memory");
      item.append(node("strong", undefined, memory.officer));
      const summaries = node("ul");
      memory.lessons.forEach((summary) => summaries.append(node("li", undefined, summary)));
      item.append(summaries);
      lessons.append(item);
    });
  }
  const start = commandButton("작전 시작", "start-attempt", { type: "start-attempt" }, dispatch, {
    focusKey: "pause-operation",
  });
  start.classList.add("primary-button");
  copy.append(objectives);
  if (briefing?.officerLessons.length) copy.append(lessons);
  copy.append(start);
  main.append(copy, renderHarnessControls(view, dispatch));
  return main;
}
