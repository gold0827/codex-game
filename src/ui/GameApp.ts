import type { CampaignDefinition, CampaignGuidanceStep } from "../campaign";
import {
  GameSessionError,
  type GameSession,
  type GameSnapshot,
  type HarnessAxis,
  type PlayerSpeed,
} from "../application/game-session";
import type {
  OfficerDecisionSnapshot,
  OfficerIntent,
  VerificationState,
} from "../simulation/simulationTypes";
import type { GameAudio, GameAudioCue } from "./GameAudio";
import {
  renderGameBattlefield,
  type ThreatImpactSnapshot,
} from "./GameBattlefield";

export type GameFrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type GameAppOptions = Readonly<{
  frameScheduler?: GameFrameScheduler;
  audio?: GameAudio;
}>;

export type GameApp = Readonly<{
  session: GameSession;
  render: () => void;
  destroy: () => void;
}>;

const harnessLabels: Readonly<
  Record<HarnessAxis, Readonly<{ name: string; low: string; high: string }>>
> = {
  informationReach: { name: "정보 공유", low: "직무 격리", high: "광역 공유" },
  authorityClarity: { name: "권한 명료도", low: "승인 대기", high: "현장 자율" },
  verificationDepth: { name: "교차 검증", low: "속도 우선", high: "전건 확인" },
  feedbackCompression: { name: "피드백 압축", low: "전문 공유", high: "핵심 요약" },
};

const dispositionLabels = {
  action: "행동 우선",
  verification: "증거 우선",
  communication: "전달 우선",
} as const;

const intentLabels: Readonly<Record<OfficerIntent, string>> = {
  "advance-locally": "현장 전진",
  "engage-threat": "위협 대응",
  "secure-objective": "목표 확보",
  "cross-check-report": "보고 대조",
  "inspect-source": "출처 확인",
  "hold-for-evidence": "근거 대기",
  "route-report": "보고 전달",
  "broadcast-update": "상황 전파",
  "compress-feedback": "피드백 압축",
};

const verificationLabels: Readonly<Record<VerificationState, string>> = {
  unverified: "미검증",
  pending: "검증 대기",
  verified: "검증 완료",
  contradicted: "모순 확인",
};

function pendingDecisionLabel(decision: OfficerDecisionSnapshot | null): string {
  return decision ? `판단 준비 중 · ${intentLabels[decision.intent]}` : "대기 중";
}

const phaseLabels = {
  briefing: "브리핑",
  operation: "작전 중",
  debrief: "결과 보고",
  epilogue: "졸업",
} as const;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function button(
  label: string,
  action: string,
  onClick: () => void,
  options: Readonly<{ disabled?: boolean; pressed?: boolean; focusKey?: string }> = {},
): HTMLButtonElement {
  const result = node("button", "game-button", label);
  result.type = "button";
  result.dataset.action = action;
  result.dataset.focusKey = options.focusKey ?? action;
  result.disabled = options.disabled ?? false;
  if (options.pressed !== undefined) {
    result.setAttribute("aria-pressed", String(options.pressed));
  }
  result.addEventListener("click", onClick);
  return result;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function guidanceTargetLabel(step: CampaignGuidanceStep): string {
  if (step.action === "pause") return "작전 일시정지";
  if (step.action === "resume") return "작전 재개";
  if (step.action === "inspect") return `장교 ${step.target.officerId}`;
  return `보고 ${step.target.reportId} → ${step.target.recipientOfficerId}`;
}

function isGuidanceTarget(
  snapshot: GameSnapshot,
  action: CampaignGuidanceStep["action"],
  targetId?: string,
): boolean {
  const step = snapshot.tutorial.active ? snapshot.tutorial.currentStep : null;
  if (!step || step.action !== action) return false;
  if (step.action === "inspect") return step.target.officerId === targetId;
  if (step.action === "route") return step.target.reportId === targetId;
  return true;
}

function renderMeter(label: string, value: number): HTMLElement {
  const row = node("div", "metric-row");
  const heading = node("span", "metric-label", label);
  const score = node("strong", "metric-score", `${Math.round(value)}`);
  const track = node("span", "metric-track");
  const fill = node("span", "metric-fill");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.append(fill);
  row.append(heading, track, score);
  return row;
}

export function mountGameApp(
  root: HTMLElement,
  campaign: CampaignDefinition,
  session: GameSession,
  options: GameAppOptions = {},
): GameApp {
  const scheduler = options.frameScheduler ?? { request: () => 0, cancel: () => undefined };
  const audio = options.audio ?? {
    cue: () => undefined,
    muted: () => true,
    setMuted: () => undefined,
    dispose: () => undefined,
  } satisfies GameAudio;
  let frameHandle: number | null = null;
  let previousFrameTime: number | null = null;
  let message = "";
  let previousPhase = session.read().phase;
  let knownThreatIds = new Set<string>();
  const threatImpacts = new Map<string, ThreatImpactSnapshot>();
  let destroyed = false;

  const cancelFrame = (): void => {
    if (frameHandle !== null) scheduler.cancel(frameHandle);
    frameHandle = null;
    previousFrameTime = null;
  };

  const syncFrameLoop = (): void => {
    const snapshot = session.read();
    if (snapshot.phase !== "operation" || snapshot.paused || destroyed) {
      cancelFrame();
      return;
    }
    if (frameHandle === null) frameHandle = scheduler.request(onFrame);
  };

  const announceAudioState = (snapshot: GameSnapshot): void => {
    const currentThreatIds = new Set(snapshot.operation?.threats.map(({ id }) => id));
    if ([...currentThreatIds].some((id) => !knownThreatIds.has(id))) {
      audio.cue("threat");
    }
    knownThreatIds = currentThreatIds;
    if (previousPhase === "operation" && snapshot.phase === "debrief") {
      audio.cue(snapshot.debrief?.status === "success" ? "success" : "failure");
    }
    previousPhase = snapshot.phase;
  };

  const recordThreatImpacts = (snapshot: GameSnapshot): void => {
    const operation = snapshot.operation;
    if (!operation) return;
    operation.threats.forEach((threat) => {
      const objective = operation.objectives.find(({ id }) => id === threat.target);
      const unit = operation.units.find(({ lane }) => lane === threat.lane);
      const observed = objective
        ? { label: "목표", value: objective.progress }
        : unit
          ? { label: "체력", value: unit.health }
          : null;
      if (!observed) return;
      const previous = threatImpacts.get(threat.id);
      threatImpacts.set(threat.id, {
        label: observed.label,
        before: previous?.before ?? observed.value,
        after: observed.value,
      });
    });
  };

  const restoreFocus = (focusKey?: string): void => {
    if (!focusKey) return;
    const candidate = [...root.querySelectorAll<HTMLElement>("[data-focus-key]")].find(
      (element) => element.dataset.focusKey === focusKey,
    );
    candidate?.focus();
  };

  const perform = (
    action: () => void,
    cue: GameAudioCue = "click",
    focusKey?: string,
  ): void => {
    try {
      action();
      message = "";
      audio.cue(cue);
    } catch (error) {
      message =
        error instanceof GameSessionError && error.code === "harness-over-budget"
          ? "자원 한도를 넘었습니다. 다른 지휘 조건을 낮춘 뒤 다시 조정합니다."
          : "명령을 처리하지 못했습니다.";
    }
    render();
    restoreFocus(focusKey);
    syncFrameLoop();
  };

  function onFrame(timestamp: number): void {
    frameHandle = null;
    const elapsed = previousFrameTime === null ? 0 : Math.max(0, timestamp - previousFrameTime);
    previousFrameTime = timestamp;
    if (elapsed > 0) session.advance(elapsed);
    render();
    syncFrameLoop();
  }

  const renderHeader = (snapshot: GameSnapshot): HTMLElement => {
    const header = node("header", "title-hud");
    const identity = node("div", "title-identity");
    identity.append(
      node("p", "eyebrow", campaign.title),
      node("h1", "game-title", snapshot.scene.copy.title),
      node("p", "scene-subtitle", snapshot.scene.copy.subtitle),
    );
    const status = node("dl", "hud-stats");
    const stats = [
      ["장면", `${snapshot.progress.completedSceneIds.length + 1}/${campaign.scenes.length}`],
      ["시도", `${snapshot.attemptNumber}`],
      ["경과", formatTime(snapshot.operation?.elapsedMs ?? 0)],
      ["속도", `${snapshot.playerSpeed}×`],
      ["상태", phaseLabels[snapshot.phase]],
    ];
    stats.forEach(([term, value]) => {
      const item = node("div", "hud-stat");
      item.append(node("dt", undefined, term), node("dd", undefined, value));
      status.append(item);
    });
    const mute = button(audio.muted() ? "소리 켜기" : "음소거", "toggle-mute", () => {
      audio.setMuted(!audio.muted());
      render();
      restoreFocus("toggle-mute");
    });
    mute.setAttribute("aria-pressed", String(audio.muted()));
    header.append(identity, status, mute);
    return header;
  };

  const renderHarnessControls = (snapshot: GameSnapshot): HTMLElement => {
    const panel = node("section", "briefing-harness panel-card");
    panel.dataset.region = "harness-controls";
    panel.append(node("p", "eyebrow", "지휘 조건 설정"), node("h2", undefined, "지휘 조건"));
    const controls = node("div", "harness-controls");
    (Object.keys(harnessLabels) as HarnessAxis[]).forEach((axis) => {
      const label = harnessLabels[axis];
      const card = node("label", "harness-control");
      const heading = node("span", "harness-control-head");
      heading.append(
        node("strong", undefined, label.name),
        node("output", undefined, percentage(snapshot.harness[axis])),
      );
      const input = node("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = String(snapshot.harness[axis]);
      input.dataset.harnessAxis = axis;
      input.disabled = snapshot.phase !== "briefing";
      input.setAttribute("aria-label", label.name);
      input.addEventListener("change", () => {
        perform(() => session.dispatch({ type: "configure-harness", axis, value: Number(input.value) }), "click", `harness-${axis}`);
      });
      input.dataset.focusKey = `harness-${axis}`;
      const limits = node("span", "harness-limits");
      limits.append(node("span", undefined, label.low), node("span", undefined, label.high));
      const cost = snapshot.harnessBudget.axisCosts[axis];
      card.append(heading, input, limits, node("small", "axis-cost", `비용 ${cost}`));
      controls.append(card);
    });
    const budget = node(
      "p",
      `budget-line${snapshot.harnessBudget.remaining < 0 ? " budget-over" : ""}`,
      `자원 ${snapshot.harnessBudget.spent}/${snapshot.harnessBudget.available} · 남음 ${snapshot.harnessBudget.remaining}`,
    );
    panel.append(controls, budget);
    return panel;
  };

  const renderBriefing = (snapshot: GameSnapshot): HTMLElement => {
    const main = node("main", "briefing-screen");
    main.dataset.phase = "briefing";
    const copy = node("section", "briefing-copy panel-card");
    copy.append(
      node("p", "eyebrow", `라운드 ${snapshot.progress.completedSceneIds.length + 1}`),
      node("h2", undefined, "작전 브리핑"),
      node("p", "briefing-lead", snapshot.briefing?.copy.briefing ?? ""),
      node("p", "lesson-copy", snapshot.briefing?.copy.lesson ?? ""),
    );
    const objectiveHeading = node("h3", undefined, "작전 목표");
    const objectives = node("ul", "briefing-objectives");
    snapshot.briefing?.objectives.forEach((objective) => {
      objectives.append(
        node("li", objective.required ? "required-objective" : "optional-objective", `${objective.required ? "필수" : "선택"} · ${objective.description}`),
      );
    });
    const start = button("작전 시작", "start-attempt", () => {
      perform(() => session.dispatch({ type: "start-attempt" }), "click", "pause-operation");
    });
    start.classList.add("primary-button");
    copy.append(objectiveHeading, objectives, start);
    main.append(copy, renderHarnessControls(snapshot));
    return main;
  };

  const renderTutorial = (snapshot: GameSnapshot): HTMLElement | null => {
    const step = snapshot.tutorial.active ? snapshot.tutorial.currentStep : null;
    if (!step) return null;
    const tutorial = node("aside", "tutorial-guidance");
    tutorial.dataset.tutorialAction = step.action;
    tutorial.setAttribute("role", "status");
    tutorial.append(
      node("strong", undefined, `훈련 ${snapshot.tutorial.currentStepIndex + 1}/${snapshot.scene.guidance.length}`),
      node("span", undefined, step.instruction),
      node("small", undefined, `대상 · ${guidanceTargetLabel(step)}`),
    );
    return tutorial;
  };

  const renderTimeControls = (snapshot: GameSnapshot): HTMLElement => {
    const controls = node("div", "time-controls");
    controls.setAttribute("aria-label", "작전 시간 제어");
    const pauseAction = snapshot.paused ? "resume" : "pause";
    const pause = button(
      snapshot.paused ? "재개" : "일시정지",
      pauseAction,
      () => perform(() => session.dispatch({ type: snapshot.paused ? "resume" : "pause" }), "click", snapshot.paused ? "resume-operation" : "pause-operation"),
      { pressed: snapshot.paused, focusKey: snapshot.paused ? "resume-operation" : "pause-operation" },
    );
    if (isGuidanceTarget(snapshot, snapshot.paused ? "resume" : "pause")) {
      pause.classList.add("guidance-target");
    }
    controls.append(pause);
    ([0.5, 1, 2] as PlayerSpeed[]).forEach((speed) => {
      const speedButton = button(
        `${speed}배`,
        `speed-${speed}`,
        () => perform(() => session.dispatch({ type: "set-player-speed", speed }), "click", `speed-${speed}`),
        { pressed: snapshot.playerSpeed === speed },
      );
      controls.append(speedButton);
    });
    return controls;
  };

  const renderOperationStatus = (snapshot: GameSnapshot): HTMLElement => {
    const operation = snapshot.operation;
    const panel = node("section", "operation-status panel-card");
    panel.append(node("p", "eyebrow", "작전 상태"), node("h2", undefined, "작전 현황"));
    if (!operation) return panel;
    panel.append(
      renderMeter("목표 진척", operation.metrics.objectiveProgress),
      renderMeter("민간 안전", operation.metrics.civilianSafety),
      renderMeter("보급", operation.metrics.logistics),
      renderMeter("조직 신뢰", operation.metrics.organizationTrust),
      renderMeter("자율도", operation.metrics.autonomyScore),
    );
    const backlog = node("p", "backlog-line", `신호 적체 ${operation.metrics.signalBacklog} · 직접 개입 ${operation.metrics.interventionCount}`);
    panel.append(backlog);
    const objectives = node("div", "objective-progress");
    operation.objectives.forEach((objective) => {
      const authored = snapshot.scene.objectives.find(({ id }) => id === objective.id);
      const item = node("div", `objective-row${objective.completed ? " objective-complete" : ""}`);
      item.append(
        node("span", undefined, authored?.description ?? objective.id),
        node("strong", undefined, `${Math.round(objective.progress)}%`),
      );
      objectives.append(item);
    });
    panel.append(objectives);
    return panel;
  };

  const renderOfficerPanel = (snapshot: GameSnapshot): HTMLElement => {
    const operation = snapshot.operation;
    const panel = node("section", "officer-panel panel-card");
    panel.dataset.region = "officers";
    panel.append(node("p", "eyebrow", "자율 장교"), node("h2", undefined, "장교 판단"));
    if (!operation) return panel;
    const list = node("div", "officer-list");
    operation.officers.forEach((officer) => {
      const authored = campaign.officers.find(({ id }) => id === officer.id);
      const unit = operation.units.find(({ officerId }) => officerId === officer.id);
      const selected = snapshot.selectedOfficerId === officer.id;
      const card = node("article", `officer-card${selected ? " officer-selected" : ""}`);
      card.dataset.officerId = officer.id;
      if (isGuidanceTarget(snapshot, "inspect", officer.id)) card.classList.add("guidance-target");
      const inspect = button(
        `${authored?.rank ?? ""} ${authored?.name ?? officer.id}`.trim(),
        "inspect-officer",
        () => perform(() => session.dispatch({ type: "inspect-officer", officerId: officer.id }), "click", `inspect-${officer.id}`),
        { pressed: selected, focusKey: `inspect-${officer.id}` },
      );
      inspect.classList.add("officer-select");
      const facts = node("dl", "officer-facts");
      const entries = [
        ["성향", dispositionLabels[officer.disposition]],
        ["의도", intentLabels[officer.intent]],
        ["확신", percentage(officer.confidence)],
        ["현재 믿음", officer.currentBelief?.assertion ?? "관측 없음"],
        ["검증", officer.currentBelief ? verificationLabels[officer.currentBelief.verificationState] : "해당 없음"],
        ["다음 판단", pendingDecisionLabel(officer.pendingDecision)],
        ["체력", unit ? `${Math.round(unit.health)}%` : "배치 없음"],
        ["권한", officer.authorized ? "예외 승인" : "기본 경계"],
      ];
      entries.forEach(([term, value]) => {
        facts.append(node("dt", undefined, term), node("dd", undefined, value));
      });
      const authorize = button(
        "예외 권한 승인",
        "authorize-officer",
        () => perform(() => session.dispatch({ type: "authorize-officer", officerId: officer.id }), "click", `authorize-${officer.id}`),
        { disabled: remainingInterventions(snapshot) <= 0 || officer.authorized, focusKey: `authorize-${officer.id}` },
      );
      card.append(inspect, facts, authorize);
      list.append(card);
    });
    panel.append(list);
    return panel;
  };

  const preferredRecipient = (snapshot: GameSnapshot, reportId: string): string => {
    const step = snapshot.tutorial.currentStep;
    if (snapshot.tutorial.active && step?.action === "route" && step.target.reportId === reportId) {
      return step.target.recipientOfficerId;
    }
    return campaign.officers[0]?.id ?? "";
  };

  const renderReports = (snapshot: GameSnapshot): HTMLElement => {
    const operation = snapshot.operation;
    const panel = node("section", "report-panel panel-card");
    panel.dataset.region = "reports";
    panel.append(node("p", "eyebrow", "보고 통신"), node("h2", undefined, "보고 기록"));
    if (!operation) return panel;
    const list = node("div", "report-list");
    operation.messages.slice().reverse().forEach((report) => {
      const card = node("article", "report-card");
      card.dataset.reportId = report.authoredReportId;
      if (isGuidanceTarget(snapshot, "route", report.authoredReportId)) card.classList.add("guidance-target");
      const author = campaign.officers.find(({ id }) => id === report.sourceOfficerId);
      const recipientNames = report.recipientOfficerIds.map(
        (id) => campaign.officers.find((officer) => officer.id === id)?.name ?? id,
      );
      card.append(
        node("p", "report-meta", `${formatTime(report.createdAtMs)} · ${author?.name ?? report.sourceOfficerId} · ${report.deliveryState === "delivered" ? "전달됨" : "대기"}`),
        node("blockquote", undefined, report.text),
        node("p", "report-detail", `수신 ${recipientNames.join(", ") || "없음"} · 신뢰 ${percentage(report.reliability)} · ${verificationLabels[report.verificationState]}`),
      );
      const actions = node("div", "report-actions");
      const recipient = node("select");
      recipient.setAttribute("aria-label", "보고 수신 장교");
      campaign.officers.forEach((officer) => {
        const option = node("option", undefined, `${officer.rank} ${officer.name}`);
        option.value = officer.id;
        option.selected = officer.id === preferredRecipient(snapshot, report.authoredReportId);
        recipient.append(option);
      });
      const route = button(
        "보고 전달",
        "route-report",
        () => perform(() => session.dispatch({ type: "route-report", reportId: report.authoredReportId, recipientOfficerId: recipient.value }), "report", `route-${report.authoredReportId}`),
        { disabled: remainingInterventions(snapshot) <= 0, focusKey: `route-${report.authoredReportId}` },
      );
      const verify = button(
        "검증 우선",
        "prioritize-verification",
        () => perform(() => session.dispatch({ type: "prioritize-verification", reportId: report.authoredReportId }), "report", `verify-${report.authoredReportId}`),
        { disabled: remainingInterventions(snapshot) <= 0 || report.prioritized, focusKey: `verify-${report.authoredReportId}` },
      );
      actions.append(recipient, route, verify);
      card.append(actions);
      list.append(card);
    });
    if (!operation.messages.length) list.append(node("p", "empty-copy", "아직 수신된 보고가 없습니다."));
    panel.append(list);
    return panel;
  };

  const remainingInterventions = (snapshot: GameSnapshot): number =>
    Math.max(
      0,
      snapshot.scene.gameplayTuning.interventionBudget -
        (snapshot.operation?.metrics.interventionCount ?? 0),
    );

  const renderOperation = (snapshot: GameSnapshot): HTMLElement => {
    const main = node("main", "operation-screen");
    main.dataset.phase = "operation";
    const tutorial = renderTutorial(snapshot);
    if (tutorial) main.append(tutorial);
    const commandBar = node("section", "operation-commandbar");
    commandBar.append(
      node("div", "operation-clock", formatTime(snapshot.operation?.elapsedMs ?? 0)),
      renderTimeControls(snapshot),
      node("div", "intervention-budget", `남은 직접 개입 ${remainingInterventions(snapshot)}회`),
    );
    const grid = node("div", "operation-grid");
    const left = node("aside", "operation-sidebar operation-sidebar-left");
    left.append(renderOperationStatus(snapshot), renderHarnessControls(snapshot));
    const center = node("section", "battlefield-column");
    center.append(renderGameBattlefield(snapshot, campaign, threatImpacts));
    const right = node("aside", "operation-sidebar operation-sidebar-right");
    right.append(renderOfficerPanel(snapshot), renderReports(snapshot));
    grid.append(left, center, right);
    main.append(commandBar, grid);
    return main;
  };

  const renderDebrief = (snapshot: GameSnapshot): HTMLElement => {
    const main = node("main", `debrief-screen debrief-${snapshot.debrief?.status ?? "retry"}`);
    main.dataset.phase = "debrief";
    const card = node("section", "debrief-card panel-card");
    const success = snapshot.debrief?.status === "success";
    card.append(
      node("p", "eyebrow", success ? "작전 종료" : "재정비"),
      node("h2", undefined, success ? "작전 완료" : "작전 재정비"),
      node("p", "debrief-copy", snapshot.debrief?.copy ?? ""),
      node("p", "lesson-copy", snapshot.scene.copy.lesson),
    );
    const next = button(success ? "다음 작전" : "다시 시도", "continue-campaign", () => {
      perform(() => session.dispatch({ type: "continue-campaign" }), success ? "success" : "failure", "start-attempt");
    });
    next.classList.add("primary-button");
    card.append(next);
    main.append(card);
    return main;
  };

  const renderEpilogue = (snapshot: GameSnapshot): HTMLElement => {
    const main = node("main", "epilogue-screen");
    main.dataset.phase = "epilogue";
    const copy = node("section", "epilogue-copy");
    copy.append(
      node("p", "eyebrow", "지휘 종료"),
      node("h2", undefined, snapshot.scene.copy.title),
      node("p", "epilogue-subtitle", snapshot.scene.copy.subtitle),
      node("p", undefined, snapshot.scene.copy.briefing),
      node("blockquote", undefined, snapshot.scene.copy.success),
    );
    const reset = button("처음부터", "reset-campaign", () => {
      perform(() => session.dispatch({ type: "reset" }), "click", "start-attempt");
    });
    reset.classList.add("primary-button");
    copy.append(reset);
    const garden = node("section", "pixel-garden");
    garden.setAttribute("aria-label", "전장을 떠나 바질을 돌보는 조용한 온실");
    garden.innerHTML = '<span class="garden-sun"></span><span class="garden-house"></span><span class="garden-person"></span><span class="garden-can"></span><span class="garden-plant plant-one"></span><span class="garden-plant plant-two"></span><span class="garden-plant plant-three"></span>';
    main.append(copy, garden);
    return main;
  };

  function render(): void {
    if (destroyed) return;
    const snapshot = session.read();
    recordThreatImpacts(snapshot);
    announceAudioState(snapshot);
    const shell = node("div", "game-shell");
    shell.style.setProperty("--scene-accent", snapshot.scene.presentation.accentColor);
    shell.dataset.phase = snapshot.phase;
    shell.append(renderHeader(snapshot));
    if (message) {
      const notice = node("p", "game-notice", message);
      notice.setAttribute("role", "alert");
      shell.append(notice);
    }
    if (snapshot.phase === "briefing") shell.append(renderBriefing(snapshot));
    else if (snapshot.phase === "operation") shell.append(renderOperation(snapshot));
    else if (snapshot.phase === "debrief") shell.append(renderDebrief(snapshot));
    else shell.append(renderEpilogue(snapshot));
    root.replaceChildren(shell);
  }

  render();
  syncFrameLoop();

  return {
    session,
    render,
    destroy: () => {
      destroyed = true;
      cancelFrame();
      audio.dispose();
      root.replaceChildren();
    },
  };
}
