import { node } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type ObjectivesViewModel = NonNullable<GameViewModel["operation"]>["objectives"];

export function renderObjectivesSection(objectivesView: ObjectivesViewModel): HTMLElement {
  const objectives = node("section", "objective-progress panel-card");
  objectives.append(node("p", "eyebrow", "목표 판정"), node("h2", undefined, "작전 목표와 근거"));
  objectivesView.forEach((objective) => {
    const card = node("article", `objective-row objective-${objective.state}`);
    card.append(
      node("strong", undefined, `${objective.label} · ${objective.requirement}`),
      node("span", undefined, `${objective.stateLabel} · ${objective.progressLabel}`),
    );
    const evidence = node("ul", "objective-evidence-list");
    objective.evidence.forEach((fact) => evidence.append(node(
      "li",
      fact.satisfied ? "evidence-satisfied" : "evidence-unsatisfied",
      `${fact.label} · ${fact.summary} · ${fact.status}`,
    )));
    card.append(evidence);
    objectives.append(card);
  });
  return objectives;
}
