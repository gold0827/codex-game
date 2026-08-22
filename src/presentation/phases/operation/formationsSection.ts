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
  formations.append(node("p", "eyebrow", "자율 편성"), node("h2", undefined, "전투 집단과 행동 주체"));
  props.formations.forEach((formation) => {
    const card = node("article", "formation-card");
    card.dataset.formationId = formation.id;
    card.append(
      node("strong", undefined, `${formation.label} · ${formation.status}`),
      node("p", undefined, `위치 ${formation.location} · 의도 ${formation.intent} · ${formation.actorCount}명`),
    );
    const actorList = node("div", "actor-roster");
    formation.actors.forEach((actor) => {
      const inspect = node("button", "game-button", `${actor.label} · ${actor.role} · ${actor.conditionLabel}`);
      inspect.type = "button";
      inspect.dataset.action = "inspect-actor";
      inspect.dataset.focusKey = `inspect-${actor.id}`;
      inspect.setAttribute("aria-pressed", String(actor.selected));
      inspect.addEventListener("click", () => onSelectActor(actor.id));
      inspect.classList.add("actor-select");
      actorList.append(inspect);
    });
    card.append(
      actorList,
      renderFormationInterventions(
        { formation, remainingBudget: props.remainingBudget },
        dispatch,
      ),
    );
    formations.append(card);
  });
  return formations;
}
