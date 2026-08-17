import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";

export function renderEpilogueView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const main = node("main", "epilogue-screen");
  main.dataset.phase = "epilogue";
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
  const garden = node("section", "pixel-garden");
  garden.setAttribute("aria-label", "전장을 떠나 바질을 돌보는 조용한 온실");
  garden.innerHTML = '<span class="garden-sun"></span><span class="garden-house"></span><span class="garden-person"></span><span class="garden-can"></span><span class="garden-plant plant-one"></span><span class="garden-plant plant-two"></span><span class="garden-plant plant-three"></span>';
  main.append(copy, garden);
  return main;
}
