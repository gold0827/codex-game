import type {
  CommandRoomScenario,
  OfficerTone,
  TimelineTone,
} from "../scenarios/commandRoomScenario";
import { renderTacticalMap } from "./TacticalMap";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function labelledSection(
  region: string,
  className: string,
  label: string,
): HTMLElement {
  const section = element("section", className);
  section.dataset.region = region;
  section.setAttribute("aria-labelledby", `${region}-title`);
  const heading = element("h2", "section-heading", label);
  heading.id = `${region}-title`;
  section.append(heading);
  return section;
}

function renderMission(scenario: CommandRoomScenario): HTMLElement {
  const { mission } = scenario;
  const section = labelledSection("mission", "panel mission", mission.regionLabel);
  section.append(element("h3", "mission-title", mission.title));

  const briefing = element("div", "briefing-grid");
  const briefingBlock = element("div", "briefing-block");
  briefingBlock.append(
    element("span", "field-label", mission.briefingLabel),
    element("p", "field-copy", mission.briefing),
  );
  const commandBlock = element("div", "briefing-block command-block");
  commandBlock.append(
    element("span", "field-label", mission.commandLabel),
    element("p", "field-copy", mission.command),
  );
  briefing.append(briefingBlock, commandBlock);

  const objectiveGroup = element("div", "objectives");
  objectiveGroup.append(element("span", "field-label", mission.objectiveLabel));
  const objectiveList = element("ul", "objective-list");
  mission.objectives.forEach((objective) => {
    objectiveList.append(element("li", "objective-item", objective));
  });
  objectiveGroup.append(objectiveList);
  section.append(briefing, objectiveGroup);
  return section;
}

function renderOfficerStatus(tone: OfficerTone, status: string): HTMLElement {
  const statusNode = element("span", `status-chip status-${tone}`, status);
  statusNode.dataset.status = tone;
  return statusNode;
}

function renderOfficers(
  scenario: CommandRoomScenario,
  currentPhaseIndex: number,
): HTMLElement {
  const { officers } = scenario;
  const phase = scenario.timeline.phases[currentPhaseIndex];
  const section = labelledSection(
    "officers",
    "panel officers",
    officers.regionLabel,
  );
  section.append(element("p", "section-summary", phase.officerSummary));

  const list = element("div", "officer-list");
  officers.entries.forEach((officer, index) => {
    const update = phase.officerUpdates[index];
    const card = element("article", "officer-card");
    card.dataset.officer = officer.callSign;

    const indexNode = element("span", "officer-index", String(index + 1).padStart(2, "0"));
    indexNode.setAttribute("aria-hidden", "true");
    const identity = element("div", "officer-identity");
    identity.append(
      element("h3", "officer-name", officer.name),
      element("p", "officer-assignment", `${officer.assignment} · ${officer.callSign}`),
    );
    const header = element("header", "officer-header");
    header.append(indexNode, identity, renderOfficerStatus(update.tone, update.status));

    const readiness = element("div", "readiness");
    readiness.append(
      element("span", "field-label", officer.readinessLabel),
      element("strong", "readiness-value", officer.readiness),
    );
    const meter = element("span", "readiness-meter");
    meter.setAttribute("aria-hidden", "true");
    const fill = element("span", "readiness-fill");
    fill.style.width = officer.readiness;
    meter.append(fill);
    readiness.append(meter);

    const report = element("blockquote", "officer-report");
    report.append(
      element("span", "field-label", officer.reportLabel),
      element("p", undefined, update.report),
    );
    card.append(header, readiness, report);
    list.append(card);
  });
  section.append(list);
  return section;
}

function renderTimelineStatus(tone: TimelineTone, status: string): HTMLElement {
  const node = element("span", `timeline-status timeline-${tone}`, status);
  node.dataset.timelineStatus = tone;
  return node;
}

function renderTimeline(
  scenario: CommandRoomScenario,
  currentPhaseIndex: number,
  onPrimaryAction: () => void,
): HTMLElement {
  const { timeline } = scenario;
  const currentPhase = timeline.phases[currentPhaseIndex];
  const phaseCount = timeline.phases.length;
  const section = labelledSection(
    "timeline",
    "panel timeline",
    timeline.regionLabel,
  );
  const progressText = `${timeline.progressLabel} ${currentPhaseIndex + 1} / ${phaseCount}`;
  const progress = element("p", "section-summary", progressText);
  progress.id = "round-progress";

  const progressMeter = element("progress", "round-progress-meter");
  progressMeter.max = phaseCount;
  progressMeter.value = currentPhaseIndex + 1;
  progressMeter.setAttribute(
    "aria-label",
    `${phaseCount}단계 중 ${currentPhaseIndex + 1}단계`,
  );

  const current = element("div", "current-phase");
  current.setAttribute("role", "status");
  current.setAttribute("aria-live", "polite");
  current.setAttribute("aria-atomic", "true");
  current.append(
    element("span", "field-label", "현재 단계"),
    element("h3", "current-phase-title", currentPhase.title),
  );
  const currentDetail = element("p", "current-phase-detail", currentPhase.detail);
  currentDetail.id = "current-phase-detail";
  current.append(currentDetail);
  section.append(progress, progressMeter, current);

  const list = element("ol", "timeline-list");
  timeline.phases.forEach((entry, index) => {
    const isCurrent = index === currentPhaseIndex;
    const isFinalPhase = index === phaseCount - 1;
    const tone: TimelineTone =
      index < currentPhaseIndex
        ? "complete"
        : isCurrent && isFinalPhase
          ? "failed"
          : isCurrent
            ? "active"
            : "pending";
    const status =
      index < currentPhaseIndex
        ? "완료"
        : isCurrent && isFinalPhase
          ? "결과"
          : isCurrent
            ? "현재"
            : "대기";
    const item = element("li", `timeline-item timeline-item-${tone}`);
    if (isCurrent) item.setAttribute("aria-current", "step");
    item.append(
      element("time", "timeline-time", entry.time),
      element("span", "timeline-marker"),
    );
    const copy = element("div", "timeline-copy");
    const heading = element("div", "timeline-heading");
    heading.append(
      element("h3", "timeline-title", entry.title),
      renderTimelineStatus(tone, status),
    );
    copy.append(heading, element("p", "timeline-detail", entry.detail));
    item.append(copy);
    list.append(item);
  });
  const action = element("button", "primary-action", currentPhase.actionLabel);
  action.type = "button";
  action.setAttribute("aria-describedby", "round-progress current-phase-detail");
  action.addEventListener("click", onPrimaryAction);
  action.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPrimaryAction();
    }
  });
  section.append(list, action);
  return section;
}

function renderHarness(scenario: CommandRoomScenario): HTMLElement {
  const { harness } = scenario;
  const section = labelledSection("harness", "panel harness", harness.regionLabel);

  const unavailable = element("div", "unavailable-banner");
  unavailable.append(
    element("span", "lock-icon", "×"),
    element("strong", undefined, harness.unavailableLabel),
  );
  section.append(unavailable, element("p", "harness-explanation", harness.explanation));

  const controlList = element("fieldset", "control-list");
  controlList.disabled = true;
  controlList.setAttribute("aria-disabled", "true");
  harness.controls.forEach((control) => {
    const card = element("div", "control-card");
    const heading = element("div", "control-heading");
    heading.append(
      element("h3", "control-name", control.name),
      element("span", "control-setting", control.setting),
    );
    const button = element("button", "control-button", control.setting);
    button.type = "button";
    button.disabled = true;
    button.setAttribute("aria-label", `${control.name}: ${control.setting}`);
    button.setAttribute("aria-disabled", "true");
    card.append(heading, element("p", "control-description", control.description), button);
    controlList.append(card);
  });
  section.append(controlList);
  return section;
}

function renderOutcome(
  scenario: CommandRoomScenario,
  showOutcome: boolean,
): HTMLElement {
  const { outcome } = scenario;
  const stateClass = showOutcome ? "outcome-final" : "outcome-pending";
  const section = labelledSection(
    "outcome",
    `panel outcome ${stateClass}`,
    outcome.regionLabel,
  );
  section.dataset.outcomeState = showOutcome ? "final" : "pending";
  section.setAttribute("aria-live", "polite");
  const verdict = element(
    "span",
    "outcome-verdict",
    showOutcome ? outcome.verdict : outcome.pendingVerdict,
  );
  const copy = element("div", "outcome-copy");
  copy.append(
    verdict,
    element(
      "h3",
      "outcome-title",
      showOutcome ? outcome.title : outcome.pendingTitle,
    ),
    element(
      "p",
      "outcome-description",
      showOutcome ? outcome.description : outcome.pendingDescription,
    ),
  );
  section.append(copy);
  if (showOutcome) {
    const metric = element("div", "outcome-metric");
    metric.append(
      element("span", "field-label", outcome.metricLabel),
      element("strong", "metric-value", outcome.metric),
    );
    section.append(metric);
  }
  return section;
}

export function renderCommandRoom(
  root: HTMLElement,
  scenario: CommandRoomScenario,
): void {
  let currentPhaseIndex = 0;

  const render = (restoreActionFocus = false): void => {
    root.replaceChildren();
    const currentPhase = scenario.timeline.phases[currentPhaseIndex];
    const isFinalPhase = currentPhaseIndex === scenario.timeline.phases.length - 1;

    const shell = element("div", "command-room");
    const header = element("header", "topbar");
    const brand = element("div", "brand");
    brand.append(
      element("p", "eyebrow", scenario.identity.eyebrow),
      element("h1", "screen-title", scenario.identity.title),
    );
    const round = element("div", "round-identity");
    round.append(
      element("strong", "round-label", scenario.identity.round),
      element("span", "operation-clock", `작전 시각 ${currentPhase.time}`),
    );
    const signal = element("span", "signal-warning", scenario.identity.signal);
    header.append(brand, round, signal);

    const advance = (): void => {
      currentPhaseIndex = isFinalPhase ? 0 : currentPhaseIndex + 1;
      render(true);
    };
    const grid = element("main", "command-grid");
    grid.append(
      renderTacticalMap(scenario, currentPhaseIndex),
      renderMission(scenario),
      renderOfficers(scenario, currentPhaseIndex),
      renderTimeline(scenario, currentPhaseIndex, advance),
      renderHarness(scenario),
      renderOutcome(scenario, isFinalPhase),
    );

    const footer = element("footer", "screen-footer", scenario.footer);
    shell.append(header, grid, footer);
    root.append(shell);
    if (restoreActionFocus) {
      root.querySelector<HTMLButtonElement>(".primary-action")?.focus();
    }
  };

  render();
}
