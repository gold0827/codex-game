import type {
  CommandRoomScenario,
  OfficerTone,
  TimelineTone,
} from "../scenarios/commandRoomScenario";

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

function renderOfficers(scenario: CommandRoomScenario): HTMLElement {
  const { officers } = scenario;
  const section = labelledSection(
    "officers",
    "panel officers",
    officers.regionLabel,
  );
  section.append(element("p", "section-summary", officers.summary));

  const list = element("div", "officer-list");
  officers.entries.forEach((officer, index) => {
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
    header.append(indexNode, identity, renderOfficerStatus(officer.tone, officer.status));

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
      element("p", undefined, officer.report),
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

function renderTimeline(scenario: CommandRoomScenario): HTMLElement {
  const { timeline } = scenario;
  const section = labelledSection(
    "timeline",
    "panel timeline",
    timeline.regionLabel,
  );
  const progress = element("p", "section-summary");
  progress.append(
    document.createTextNode(`${timeline.progressLabel} `),
    element("strong", undefined, timeline.progress),
  );
  section.append(progress);

  const list = element("ol", "timeline-list");
  timeline.entries.forEach((entry) => {
    const item = element("li", `timeline-item timeline-item-${entry.tone}`);
    item.append(
      element("time", "timeline-time", entry.time),
      element("span", "timeline-marker"),
    );
    const copy = element("div", "timeline-copy");
    const heading = element("div", "timeline-heading");
    heading.append(
      element("h3", "timeline-title", entry.title),
      renderTimelineStatus(entry.tone, entry.status),
    );
    copy.append(heading, element("p", "timeline-detail", entry.detail));
    item.append(copy);
    list.append(item);
  });
  section.append(list);
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

function renderOutcome(scenario: CommandRoomScenario): HTMLElement {
  const { outcome } = scenario;
  const section = labelledSection("outcome", "panel outcome", outcome.regionLabel);
  const verdict = element("span", "outcome-verdict", outcome.verdict);
  const copy = element("div", "outcome-copy");
  copy.append(
    verdict,
    element("h3", "outcome-title", outcome.title),
    element("p", "outcome-description", outcome.description),
  );
  const metric = element("div", "outcome-metric");
  metric.append(
    element("span", "field-label", outcome.metricLabel),
    element("strong", "metric-value", outcome.metric),
  );
  section.append(copy, metric);
  return section;
}

export function renderCommandRoom(
  root: HTMLElement,
  scenario: CommandRoomScenario,
): void {
  root.replaceChildren();

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
    element("span", "operation-clock", scenario.identity.clock),
  );
  const signal = element("span", "signal-warning", scenario.identity.signal);
  header.append(brand, round, signal);

  const grid = element("main", "command-grid");
  grid.append(
    renderMission(scenario),
    renderOfficers(scenario),
    renderTimeline(scenario),
    renderHarness(scenario),
    renderOutcome(scenario),
  );

  const footer = element("footer", "screen-footer", scenario.footer);
  shell.append(header, grid, footer);
  root.append(shell);
}
