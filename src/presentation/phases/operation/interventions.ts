import { commandButton, node, type CommandDispatcher } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type OperationViewModel = NonNullable<GameViewModel["operation"]>;
type FormationViewModel = OperationViewModel["formations"][number];

export type FormationInterventionProps = Readonly<{
  formation: Pick<FormationViewModel, "id" | "intent" | "label">;
  remainingBudget: OperationViewModel["interventionBudget"]["remaining"];
}>;

export function renderFormationInterventions(
  props: FormationInterventionProps,
  dispatch: CommandDispatcher,
): HTMLElement {
  const { formation, remainingBudget } = props;
  const intervention = node("div", "formation-intervention");
  const intent = node("input");
  intent.value = formation.intent;
  intent.setAttribute("aria-label", `${formation.label} 지휘 의도`);
  const guidance = node("input");
  guidance.placeholder = "편성 지침";
  guidance.setAttribute("aria-label", `${formation.label} 하네스 지침`);
  intervention.append(
    intent,
    commandButton(
      "의도 갱신",
      "set-formation-intent",
      { type: "set-formation-intent", formationId: formation.id, intentId: formation.intent },
      (command, cue, focusKey) => {
        if (command.type === "set-formation-intent" && intent.value.trim()) {
          dispatch({ ...command, intentId: intent.value.trim() }, cue, focusKey);
        }
      },
      { disabled: remainingBudget < 1 },
    ),
    guidance,
    commandButton(
      "지침 전달",
      "issue-guidance",
      { type: "issue-guidance", guidanceId: "", recipientFormationIds: [formation.id] },
      (command, cue, focusKey) => {
        if (command.type === "issue-guidance" && guidance.value.trim()) {
          dispatch({ ...command, guidanceId: guidance.value.trim() }, cue, focusKey);
        }
      },
      { disabled: remainingBudget < 1 },
    ),
  );
  return intervention;
}
