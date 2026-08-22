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
  intent.placeholder = "새 지휘 의도";
  intent.setAttribute("aria-label", `${formation.label} 지휘 의도`);
  intent.dataset.draftKey = `formation-${formation.id}-intent`;
  intent.dataset.focusKey = `formation-${formation.id}-intent-input`;
  const guidance = node("input");
  guidance.placeholder = "편성 지침";
  guidance.setAttribute("aria-label", `${formation.label} 하네스 지침`);
  guidance.dataset.draftKey = `formation-${formation.id}-guidance`;
  guidance.dataset.focusKey = `formation-${formation.id}-guidance-input`;
  intervention.append(
    intent,
    commandButton(
      "의도 갱신",
      "set-formation-intent",
      { type: "set-formation-intent", formationId: formation.id, intentId: formation.intent },
      (command, cue, focusKey) => {
        if (command.type === "set-formation-intent") {
          dispatch({ ...command, intentId: intent.value.trim() || formation.intent }, cue, focusKey);
        }
      },
      {
        disabled: remainingBudget < 1,
        focusKey: `formation-${formation.id}-set-intent`,
      },
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
      {
        disabled: remainingBudget < 1,
        focusKey: `formation-${formation.id}-issue-guidance`,
      },
    ),
  );
  return intervention;
}
