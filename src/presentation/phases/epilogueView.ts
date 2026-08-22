import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";

export function renderEpilogueView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const main = node("main", "epilogue-screen");
  main.dataset.phase = "epilogue";
  main.dataset.backdropId = view.backdrop.id;
  main.dataset.backdropStyle = view.backdrop.style;
  const copy = node("section", "epilogue-copy");
  copy.append(
    node("p", "eyebrow", "지휘 종료"),
    node("h2", undefined, view.epilogue.title),
    node("p", "epilogue-subtitle", view.epilogue.subtitle),
    node("p", undefined, view.epilogue.briefing),
    node("blockquote", undefined, view.epilogue.success),
  );
  const reset = commandButton("처음부터", "reset-campaign", { type: "reset" }, dispatch, {
    focusKey: "start-attempt",
  });
  reset.classList.add("primary-button");
  copy.append(reset);
  main.append(copy);
  return main;
}
