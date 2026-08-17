import type { GameAudio } from "../ui/GameAudio";
import { node } from "./dom";
import type { GameViewModel } from "./gameViewModel";

export function renderGameHeader(
  view: GameViewModel,
  audio: GameAudio,
  onToggleMute: () => void,
): HTMLElement {
  const header = node("header", "title-hud");
  const identity = node("div", "title-identity");
  identity.append(
    node("p", "eyebrow", view.header.campaignTitle),
    node("h1", "game-title", view.header.title),
    node("p", "scene-subtitle", view.header.subtitle),
  );
  const status = node("dl", "hud-stats");
  view.header.stats.forEach(([term, value]) => {
    const item = node("div", "hud-stat");
    item.append(node("dt", undefined, term), node("dd", undefined, value));
    status.append(item);
  });
  const mute = node("button", "game-button", audio.muted() ? "소리 켜기" : "음소거");
  mute.type = "button";
  mute.dataset.action = "toggle-mute";
  mute.dataset.focusKey = "toggle-mute";
  mute.setAttribute("aria-pressed", String(audio.muted()));
  mute.addEventListener("click", onToggleMute);
  header.append(identity, status, mute);
  return header;
}

export function renderHarnessControls(
  view: GameViewModel,
  dispatch: import("./dom").CommandDispatcher,
): HTMLElement {
  const panel = node("section", "briefing-harness panel-card");
  panel.dataset.region = "harness-controls";
  panel.append(node("p", "eyebrow", "지휘 조건 설정"), node("h2", undefined, "지휘 조건"));
  const controls = node("div", "harness-controls");
  view.harness.forEach((item) => {
    const card = node("label", "harness-control");
    const heading = node("span", "harness-control-head");
    heading.append(node("strong", undefined, item.name), node("output", undefined, item.displayedValue));
    const input = node("input");
    input.type = "range";
    input.min = "0";
    input.max = "1";
    input.step = "0.05";
    input.value = String(item.value);
    input.dataset.harnessAxis = item.axis;
    input.dataset.focusKey = `harness-${item.axis}`;
    input.disabled = item.disabled;
    input.setAttribute("aria-label", item.name);
    input.addEventListener("change", () => dispatch(
      { type: "configure-harness", axis: item.axis, value: Number(input.value) },
      "click",
      `harness-${item.axis}`,
    ));
    const limits = node("span", "harness-limits");
    limits.append(node("span", undefined, item.low), node("span", undefined, item.high));
    card.append(heading, input, limits, node("small", "axis-cost", `비용 ${item.cost}`));
    controls.append(card);
  });
  panel.append(
    controls,
    node(
      "p",
      `budget-line${view.budget.remaining < 0 ? " budget-over" : ""}`,
      `자원 ${view.budget.spent}/${view.budget.available} · 남음 ${view.budget.remaining}`,
    ),
  );
  return panel;
}
