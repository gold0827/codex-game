import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";

export function renderOperationView(
  view: GameViewModel,
  dispatch: CommandDispatcher,
  onSelectActor: (actorId: string) => void,
): HTMLElement {
  const operation = view.operation;
  const main = node("main", "operation-screen autonomous-operation-screen");
  main.dataset.phase = "operation";
  if (!operation) return main;

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
        : "편성 개입 거부 · 작전이 이미 종료되었습니다.";
    const feedback = node(
      "p",
      `intervention-receipt intervention-${receipt.status}`,
      receiptCopy,
    );
    feedback.setAttribute("role", "status");
    commandBar.append(feedback);
  }

  const status = node("section", "operation-status panel-card");
  status.append(
    node("p", "eyebrow", "하네스 상태"),
    node("h2", undefined, operation.harness.consequenceSummary),
  );
  const policies = node("dl", "canonical-policy-list");
  operation.harness.policies.forEach((policy) => {
    policies.append(node("dt", undefined, policy.label), node("dd", undefined, policy.valueLabel));
  });
  status.append(policies);
  const consequences = node("ul", "canonical-consequence-list");
  operation.harness.consequences.forEach((consequence) => {
    consequences.append(node(
      "li",
      undefined,
      `${consequence.label} · ${consequence.axisLabel} · 심각도 ${consequence.severityLabel}`,
    ));
  });
  if (operation.harness.consequences.length === 0) {
    consequences.append(node("li", "empty-copy", "현재 감지된 부작용이 없습니다."));
  }
  status.append(consequences);

  const objectives = node("section", "objective-progress panel-card");
  objectives.append(node("p", "eyebrow", "목표 판정"), node("h2", undefined, "작전 목표와 근거"));
  operation.objectives.forEach((objective) => {
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

  const formations = node("section", "formation-panel panel-card");
  formations.dataset.region = "formations";
  formations.append(node("p", "eyebrow", "자율 편성"), node("h2", undefined, "전투 집단과 행동 주체"));
  operation.formations.forEach((formation) => {
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
        { disabled: operation.interventionBudget.remaining < 1 },
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
        { disabled: operation.interventionBudget.remaining < 1 },
      ),
    );
    card.append(actorList, intervention);
    formations.append(card);
  });

  const selected = node("section", "selected-actor panel-card");
  selected.append(node("p", "eyebrow", "판단 추적"), node("h2", undefined, "선택 행동 주체"));
  if (!operation.selectedActor) {
    selected.append(node("p", "empty-copy", "행동 주체를 선택하면 판단 과정을 확인할 수 있습니다."));
  } else {
    selected.append(
      node("strong", undefined, `${operation.selectedActor.label} · ${operation.selectedActor.role}`),
      node("p", undefined, operation.selectedActor.condition),
    );
    const stages = node("ol", "decision-stage-list");
    operation.selectedActor.trace?.stages.forEach((stage) => {
      const item = node("li", `decision-stage stage-${stage.id}`);
      item.append(
        node("strong", undefined, stage.label),
        node("time", undefined, stage.at),
        node("span", undefined, `${stage.state} · 확신 ${stage.confidence}`),
        node("p", undefined, stage.detail),
      );
      stages.append(item);
    });
    if (!operation.selectedActor.trace) {
      stages.append(node("li", "empty-copy", "아직 완료된 판단 주기가 없습니다."));
    }
    selected.append(stages);
  }

  const events = node("section", "operation-event-flow panel-card");
  events.append(node("p", "eyebrow", "최근 사건"), node("h2", undefined, "작전 흐름"));
  const eventList = node("ol", "event-flow-list");
  operation.recentEvents.forEach((event) => {
    const item = node("li", `event-flow-item event-${event.kind}`);
    item.dataset.eventSequence = String(event.sequence);
    item.append(node("time", undefined, event.time), node("strong", undefined, event.summary));
    eventList.append(item);
  });
  if (operation.recentEvents.length === 0) {
    eventList.append(node("li", "event-flow-empty", "작전 사건을 기다리는 중"));
  }
  events.append(eventList);

  const grid = node("div", "operation-grid canonical-operation-grid");
  const left = node("aside", "operation-sidebar operation-sidebar-left");
  left.append(status, objectives);
  const center = node("section", "formation-column");
  center.append(formations);
  const right = node("aside", "operation-sidebar operation-sidebar-right");
  right.append(selected, events);
  grid.append(left, center, right);
  main.append(commandBar, grid);
  return main;
}
