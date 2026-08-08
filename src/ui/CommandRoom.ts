import type {
  CommandProtocolId,
  CommandRoomScenario,
  OfficerTone,
  TimelineTone,
} from "../scenarios/commandRoomScenario";
import { renderTacticalMap } from "./TacticalMap";

const commandProtocols: ReadonlyArray<{
  id: CommandProtocolId;
  label: string;
  description: string;
}> = [
  {
    id: "independent",
    label: "각자 판단",
    description: "장교들이 임무를 받고 각자 판단해 독립적으로 행동합니다.",
  },
  {
    id: "cross-check",
    label: "교차 확인",
    description: "이동 전 정찰대와 수송대가 같은 경로 정보를 확인합니다.",
  },
];

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

function renderProtocolSelector(
  selectedProtocol: CommandProtocolId | null,
  protocolLocked: boolean,
  onSelect: (protocol: CommandProtocolId) => void,
): HTMLElement {
  const selector = element("fieldset", "protocol-selector");
  selector.dataset.locked = String(protocolLocked);
  selector.disabled = protocolLocked;
  selector.setAttribute(
    "aria-describedby",
    "command-protocol-help command-protocol-status",
  );
  if (protocolLocked) selector.setAttribute("aria-disabled", "true");

  selector.append(element("legend", "field-label protocol-label", "명령 프로토콜"));
  const help = element(
    "p",
    "protocol-help",
    "첫 작전 행동 전에 지휘 방식을 선택하십시오.",
  );
  help.id = "command-protocol-help";
  selector.append(help);

  const options = element("div", "protocol-options");
  commandProtocols.forEach((protocol) => {
    const input = element("input", "protocol-input");
    input.type = "radio";
    input.name = "command-protocol";
    input.id = `command-protocol-${protocol.id}`;
    input.value = protocol.id;
    input.checked = selectedProtocol === protocol.id;

    const description = element("span", "protocol-description", protocol.description);
    description.id = `${input.id}-description`;
    input.setAttribute("aria-describedby", description.id);
    input.addEventListener("change", () => {
      if (input.checked) onSelect(protocol.id);
    });

    const choice = element("label", "protocol-choice");
    choice.htmlFor = input.id;
    choice.dataset.selected = String(input.checked);
    choice.append(
      input,
      element("strong", "protocol-name", protocol.label),
      description,
    );
    options.append(choice);
  });

  const selectedLabel = commandProtocols.find(
    (protocol) => protocol.id === selectedProtocol,
  )?.label;
  const status = element(
    "p",
    "protocol-status",
    selectedLabel
      ? protocolLocked
        ? `고정됨: ${selectedLabel}`
        : `선택됨: ${selectedLabel}`
      : "선택되지 않음",
  );
  status.id = "command-protocol-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  selector.append(options, status);
  return selector;
}

function renderMission(
  scenario: CommandRoomScenario,
  selectedProtocol: CommandProtocolId | null,
  protocolLocked: boolean,
  onProtocolSelect: (protocol: CommandProtocolId) => void,
): HTMLElement {
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
  section.append(
    briefing,
    objectiveGroup,
    renderProtocolSelector(selectedProtocol, protocolLocked, onProtocolSelect),
  );
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
  primaryActionDisabled: boolean,
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
        : isCurrent && isFinalPhase && scenario.outcome.tone === "failure"
          ? "failed"
          : isCurrent && isFinalPhase
            ? "complete"
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
  action.disabled = primaryActionDisabled;
  action.setAttribute("aria-disabled", String(primaryActionDisabled));
  action.setAttribute(
    "aria-describedby",
    "command-protocol-status round-progress current-phase-detail",
  );
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
  const stateClass = showOutcome
    ? `outcome-final outcome-${outcome.tone}`
    : "outcome-pending";
  const section = labelledSection(
    "outcome",
    `panel outcome ${stateClass}`,
    outcome.regionLabel,
  );
  section.dataset.outcomeState = showOutcome ? "final" : "pending";
  if (showOutcome) section.dataset.outcomeTone = outcome.tone;
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
  let selectedProtocol: CommandProtocolId | null = null;
  let protocolLocked = false;

  const render = (
    restoreActionFocus = false,
    restoreProtocolFocus = false,
  ): void => {
    root.replaceChildren();
    const simulation =
      selectedProtocol === null || selectedProtocol === "independent"
        ? scenario
        : scenario.protocolSimulations[selectedProtocol];
    const activeScenario: CommandRoomScenario = {
      ...scenario,
      ...simulation,
    };
    const currentPhase = activeScenario.timeline.phases[currentPhaseIndex];
    const isFinalPhase =
      currentPhaseIndex === activeScenario.timeline.phases.length - 1;

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
      if (currentPhaseIndex === 0 && selectedProtocol === null) return;
      if (isFinalPhase) {
        currentPhaseIndex = 0;
        selectedProtocol = null;
        protocolLocked = false;
      } else {
        if (currentPhaseIndex === 0) protocolLocked = true;
        currentPhaseIndex += 1;
      }
      render(true);
    };
    const selectProtocol = (protocol: CommandProtocolId): void => {
      if (protocolLocked) return;
      selectedProtocol = protocol;
      render(false, true);
    };
    const grid = element("main", "command-grid");
    grid.append(
      renderTacticalMap(activeScenario, currentPhaseIndex),
      renderMission(
        activeScenario,
        selectedProtocol,
        protocolLocked,
        selectProtocol,
      ),
      renderOfficers(activeScenario, currentPhaseIndex),
      renderTimeline(
        activeScenario,
        currentPhaseIndex,
        currentPhaseIndex === 0 && selectedProtocol === null,
        advance,
      ),
      renderHarness(activeScenario),
      renderOutcome(activeScenario, isFinalPhase),
    );

    const footer = element("footer", "screen-footer", scenario.footer);
    shell.append(header, grid, footer);
    root.append(shell);
    if (restoreActionFocus) {
      root.querySelector<HTMLButtonElement>(".primary-action")?.focus();
    } else if (restoreProtocolFocus && selectedProtocol) {
      root
        .querySelector<HTMLInputElement>(
          `#command-protocol-${selectedProtocol}`,
        )
        ?.focus();
    }
  };

  render();
}
