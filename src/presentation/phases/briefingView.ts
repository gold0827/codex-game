import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";
import { renderHarnessControls } from "../gameChrome";

export function renderBriefingView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const main = node("main", "briefing-screen");
  main.dataset.phase = "briefing";
  main.dataset.backdropId = view.backdrop.id;
  main.dataset.backdropStyle = view.backdrop.style;
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
  const lessons = node("section", "briefing-role-lessons");
  lessons.dataset.region = "role-lessons";
  if (briefing?.roleLessons.length) {
    lessons.append(node("h3", undefined, "지휘 역할이 기억한 교훈"));
    briefing.roleLessons.forEach((memory) => {
      const item = node("article", "briefing-role-memory");
      item.append(node("strong", undefined, memory.role));
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
  if (briefing?.roleLessons.length) copy.append(lessons);
  copy.append(start);
  main.append(copy, renderHarnessControls(view, dispatch));
  return main;
}
