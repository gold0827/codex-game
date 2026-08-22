import { node, type CommandDispatcher } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";
import { renderFormationInterventions } from "./interventions";

type OperationViewModel = NonNullable<GameViewModel["operation"]>;

export type FormationsSectionProps = Readonly<{
  formations: OperationViewModel["formations"];
  remainingBudget: OperationViewModel["interventionBudget"]["remaining"];
}>;

export function renderFormationsSection(
  props: FormationsSectionProps,
  dispatch: CommandDispatcher,
  onSelectActor: (actorId: string) => void,
): HTMLElement {
  const formations = node("section", "formation-panel panel-card");
  formations.dataset.region = "formations";
  const heading = node("header", "formation-dock-heading");
  heading.append(
    node("p", "eyebrow", "자율 편성"),
    node("h2", undefined, "전투 집단"),
  );
  const list = node("div", "formation-dock-list");
  list.dataset.scrollKey = "formation-dock";
  props.formations.forEach((formation) => {
    const card = node("article", "formation-card");
    card.dataset.formationId = formation.id;
    card.dataset.controllable = String(formation.controllable);
    card.classList.add(formation.controllable ? "formation-controllable" : "formation-observed");
    card.append(
      node("strong", undefined, `${formation.label} · ${formation.status}`),
      node(
        "p",
        undefined,
        `${formation.controllable ? "아군 지휘망" : "적군 관측 대상"} · 행동 주체 ${formation.actorCount}명`,
      ),
    );
    const actorList = node("div", "actor-roster");
    actorList.dataset.scrollKey = `formation-${formation.id}-actors`;
    formation.actors.forEach((actor) => {
      const inspect = node("button", "game-button", `${actor.label} · ${actor.conditionLabel}`);
      inspect.type = "button";
      inspect.dataset.action = "inspect-actor";
      inspect.dataset.actorId = actor.id;
      inspect.dataset.focusKey = `dock-inspect-${actor.id}`;
      inspect.setAttribute("aria-pressed", String(actor.selected));
      inspect.title = `${actor.label} · ${actor.conditionLabel}`;
      inspect.addEventListener("click", () => onSelectActor(actor.id));
      inspect.classList.add("actor-select");
      actorList.append(inspect);
    });
    card.append(actorList);
    if (formation.controllable) {
      card.append(renderFormationInterventions(
        { formation, remainingBudget: props.remainingBudget },
        dispatch,
      ));
    }
    list.append(card);
  });
  formations.append(heading, list);
  return formations;
}
