import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";

export function renderDebriefView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const debrief = view.debrief;
  const success = debrief?.success ?? false;
  const main = node("main", `debrief-screen debrief-${success ? "success" : "retry"}`);
  main.dataset.phase = "debrief";
  const card = node("section", "debrief-card panel-card");
  card.append(
    node("p", "eyebrow", success ? "작전 종료" : "재정비"),
    node("h2", undefined, success ? "작전 완료" : "작전 재정비"),
    node("p", "debrief-copy", debrief?.copy ?? ""),
    node("p", "lesson-copy", debrief?.lesson ?? ""),
  );
  const next = commandButton(
    success ? "다음 작전" : "다시 시도",
    "continue-campaign",
    { type: "continue-campaign" },
    dispatch,
    { cue: success ? "success" : "failure", focusKey: "start-attempt" },
  );
  next.classList.add("primary-button");
  card.append(next);
  main.append(card);
  return main;
}
