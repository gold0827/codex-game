import { node } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type SelectedActorViewModel = NonNullable<GameViewModel["operation"]>["selectedActor"];

export function renderTraceSection(selectedActor: SelectedActorViewModel): HTMLElement {
  const selected = node("section", "selected-actor panel-card");
  selected.append(node("p", "eyebrow", "판단 추적"), node("h2", undefined, "선택 행동 주체"));
  if (!selectedActor) {
    selected.append(node("p", "empty-copy", "행동 주체를 선택하면 판단 과정을 확인할 수 있습니다."));
    return selected;
  }

  selected.append(
    node("strong", undefined, selectedActor.label),
    node("p", undefined, selectedActor.condition),
  );
  const stages = node("ol", "decision-stage-list");
  selectedActor.trace?.stages.forEach((stage) => {
    const item = node("li", `decision-stage stage-${stage.id}`);
    item.append(
      node("strong", undefined, stage.label),
      node("time", undefined, stage.at),
      node("span", undefined, `${stage.state} · 확신 ${stage.confidence}`),
      node("p", undefined, stage.detail),
    );
    stages.append(item);
  });
  if (!selectedActor.trace) {
    stages.append(node("li", "empty-copy", "아직 완료된 판단 주기가 없습니다."));
  }
  selected.append(stages);
  return selected;
}
