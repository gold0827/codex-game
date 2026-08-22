import { commandButton, node, type CommandDispatcher } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type OperationViewModel = NonNullable<GameViewModel["operation"]>;

export type OperationCommandBarProps = Pick<
  OperationViewModel,
  "clock" | "interventionBudget" | "lastIntervention" | "paused" | "resolution" | "speed" | "speeds"
>;

export function renderOperationCommandBar(
  operation: OperationCommandBarProps,
  dispatch: CommandDispatcher,
): HTMLElement {
  const timeControls = node("div", "time-controls");
  const pauseAction = operation.paused ? "resume" : "pause";
  timeControls.append(commandButton(
    operation.paused ? "재개" : "일시정지",
    pauseAction,
    { type: pauseAction },
    dispatch,
    { pressed: operation.paused, focusKey: `${pauseAction}-operation` },
  ));
  operation.speeds.forEach((speed) => timeControls.append(commandButton(
    `${speed}배`,
    `speed-${speed}`,
    { type: "set-player-speed", speed },
    dispatch,
    { pressed: operation.speed === speed },
  )));

  const commandBar = node("section", "operation-commandbar");
  commandBar.append(
    node("div", "operation-clock", operation.clock.label),
    timeControls,
    node("div", "operation-resolution", operation.resolution.label),
    node("div", "intervention-budget", operation.interventionBudget.label),
  );

  if (operation.lastIntervention) {
    const receipt = operation.lastIntervention;
    const receiptCopy = receipt.status === "accepted"
      ? `편성 개입 접수 · ${receipt.affectedFormationIds.length}개 편성 · 비용 ${receipt.cost}`
      : receipt.reason === "insufficient-budget"
        ? "편성 개입 거부 · 남은 개입 예산이 없습니다."
        : receipt.reason === "formation-not-controllable"
          ? "편성 개입 거부 · 통제 권한이 없는 편성입니다."
          : "편성 개입 거부 · 작전이 이미 종료되었습니다.";
    const feedback = node(
      "p",
      `intervention-receipt intervention-${receipt.status}`,
      receiptCopy,
    );
    feedback.setAttribute("role", "status");
    commandBar.append(feedback);
  }

  return commandBar;
}
