import { commandButton, node, type CommandDispatcher } from "../dom";
import { renderGameBattlefield } from "../gameBattlefield";
import type { GameViewModel, ThreatImpactViewModel } from "../gameViewModel";
import { renderHarnessControls } from "../gameChrome";

function renderMeter(label: string, value: number): HTMLElement {
  const row = node("div", "metric-row");
  const track = node("span", "metric-track");
  const fill = node("span", "metric-fill");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.append(fill);
  row.append(node("span", "metric-label", label), track, node("strong", "metric-score", `${Math.round(value)}`));
  return row;
}

export function renderOperationView(
  view: GameViewModel,
  dispatch: CommandDispatcher,
  threatImpacts: ReadonlyMap<string, ThreatImpactViewModel>,
): HTMLElement {
  const operation = view.operation;
  const main = node("main", "operation-screen");
  main.dataset.phase = "operation";
  if (!operation) return main;
  if (view.tutorial) {
    const tutorial = node("aside", "tutorial-guidance");
    tutorial.dataset.tutorialAction = view.tutorial.action;
    tutorial.setAttribute("role", "status");
    tutorial.append(
      node("strong", undefined, `훈련 ${view.tutorial.position}`),
      node("span", undefined, view.tutorial.instruction),
      node("small", undefined, `대상 · ${view.tutorial.target}`),
    );
    main.append(tutorial);
  }

  const timeControls = node("div", "time-controls");
  timeControls.setAttribute("aria-label", "작전 시간 제어");
  const pauseAction = operation.paused ? "resume" : "pause";
  const pauseFocus = operation.paused ? "resume-operation" : "pause-operation";
  const pause = commandButton(
    operation.paused ? "재개" : "일시정지",
    pauseAction,
    { type: pauseAction },
    dispatch,
    { pressed: operation.paused, focusKey: pauseFocus },
  );
  if (operation.pauseGuided) pause.classList.add("guidance-target");
  timeControls.append(pause);
  operation.speeds.forEach((speed) => timeControls.append(commandButton(
    `${speed}배`,
    `speed-${speed}`,
    { type: "set-player-speed", speed },
    dispatch,
    { pressed: operation.speed === speed },
  )));
  const commandBar = node("section", "operation-commandbar");
  commandBar.append(
    node("div", "operation-clock", operation.elapsed),
    timeControls,
    node("div", "intervention-budget", `남은 직접 개입 ${operation.remainingInterventions}회`),
  );

  const status = node("section", "operation-status panel-card");
  status.append(node("p", "eyebrow", "작전 상태"), node("h2", undefined, "작전 현황"));
  operation.metrics.forEach(([label, value]) => status.append(renderMeter(label, value)));
  status.append(node("p", "backlog-line", operation.backlog));
  const objectives = node("div", "objective-progress");
  operation.objectives.forEach((objective) => {
    const item = node("div", `objective-row${objective.completed ? " objective-complete" : ""}`);
    item.append(node("span", undefined, objective.description), node("strong", undefined, objective.progressLabel));
    objectives.append(item);
  });
  status.append(objectives);

  const officers = node("section", "officer-panel panel-card");
  officers.dataset.region = "officers";
  officers.append(node("p", "eyebrow", "자율 장교"), node("h2", undefined, "장교 판단"));
  const officerList = node("div", "officer-list");
  operation.officers.forEach((officer) => {
    const card = node("article", `officer-card${officer.selected ? " officer-selected" : ""}`);
    card.dataset.officerId = officer.id;
    if (officer.guided) card.classList.add("guidance-target");
    const inspect = commandButton(officer.name, "inspect-officer", { type: "inspect-officer", officerId: officer.id }, dispatch, {
      pressed: officer.selected,
      focusKey: `inspect-${officer.id}`,
    });
    inspect.classList.add("officer-select");
    const facts = node("dl", "officer-facts");
    officer.facts.forEach(([term, value]) => facts.append(node("dt", undefined, term), node("dd", undefined, value)));
    const authorize = commandButton("예외 권한 승인", "authorize-officer", { type: "authorize-officer", officerId: officer.id }, dispatch, {
      disabled: !officer.canAuthorize,
      focusKey: `authorize-${officer.id}`,
    });
    card.append(inspect, facts, authorize);
    officerList.append(card);
  });
  officers.append(officerList);

  const reports = node("section", "report-panel panel-card");
  reports.dataset.region = "reports";
  reports.append(node("p", "eyebrow", "보고 통신"), node("h2", undefined, "보고 기록"));
  const reportList = node("div", "report-list");
  operation.reports.forEach((report) => {
    const card = node("article", "report-card");
    card.dataset.reportId = report.id;
    if (report.guided) card.classList.add("guidance-target");
    card.append(node("p", "report-meta", report.meta), node("blockquote", undefined, report.text), node("p", "report-detail", report.detail));
    const actions = node("div", "report-actions");
    const recipient = node("select");
    recipient.setAttribute("aria-label", "보고 수신 장교");
    operation.recipients.forEach(({ id, label }) => {
      const option = node("option", undefined, label);
      option.value = id;
      option.selected = id === report.recipientId;
      recipient.append(option);
    });
    actions.append(
      recipient,
      commandButton("보고 전달", "route-report", { type: "route-report", reportId: report.id, recipientOfficerId: report.recipientId }, (command, cue, focusKey) => {
        dispatch(command.type === "route-report" ? { ...command, recipientOfficerId: recipient.value } : command, cue, focusKey);
      }, { disabled: !report.canIntervene, focusKey: `route-${report.id}`, cue: "report" }),
      commandButton("검증 우선", "prioritize-verification", { type: "prioritize-verification", reportId: report.id }, dispatch, {
        disabled: !report.canVerify,
        focusKey: `verify-${report.id}`,
        cue: "report",
      }),
    );
    card.append(actions);
    reportList.append(card);
  });
  if (!operation.reports.length) reportList.append(node("p", "empty-copy", "아직 수신된 보고가 없습니다."));
  reports.append(reportList);

  const grid = node("div", "operation-grid");
  const left = node("aside", "operation-sidebar operation-sidebar-left");
  left.append(status, renderHarnessControls(view, dispatch));
  const center = node("section", "battlefield-column");
  center.append(renderGameBattlefield(operation.battlefield, threatImpacts));
  const right = node("aside", "operation-sidebar operation-sidebar-right");
  right.append(officers, reports);
  grid.append(left, center, right);
  main.append(commandBar, grid);
  return main;
}
