import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import type { CampaignDefinition } from "../../src/campaign";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import { bridgeDefenseCampaign } from "../../src/scenarios/bridgeDefenseOperation";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

describe("game presentation view model", () => {
  const campaignView = {
    title: completeCampaign.title,
    sceneCount: completeCampaign.scenes.length,
    officers: completeCampaign.officers,
  };

  it("projects authored briefing state into player-facing values", () => {
    const session = createGameSession(completeCampaign, "view-model-briefing");
    const view = projectGameViewModel(session.read(), campaignView);

    expect(view.phase).toBe("briefing");
    expect(view.header.stats).toContainEqual(["상태", "브리핑"]);
    expect(view.briefing?.objectives[0]?.label).toMatch(/^필수 · /);
    expect(view.harness.map(({ displayedValue }) => displayedValue)).toEqual(
      Object.values(session.read().harness).map((value) => `${Math.round(value * 100)}%`),
    );
  });

  it("projects live operation diagnostics into display-safe labels", () => {
    const session = createGameSession(completeCampaign, "view-model-operation");
    session.dispatch({ type: "start-attempt" });
    session.advance(4_000);
    const snapshot = session.read();
    const view = projectGameViewModel(snapshot, campaignView);

    expect(view.operation?.metrics.map(([label]) => label)).toEqual([
      "목표 진척",
      "민간 안전",
      "보급",
      "조직 신뢰",
      "자율도",
    ]);
    expect(view.operation?.officers[0]?.facts.flat()).not.toContain(
      snapshot.operation?.officers[0]?.committedAction?.trace.topReason,
    );
    expect(view.operation?.officers[0]?.facts).toContainEqual([
      "의도",
      expect.any(String),
    ]);
    expect(view.operation?.officers[0]).toMatchObject({
      role: completeCampaign.officers[0]?.role,
      facts: expect.arrayContaining([
        ["역할", completeCampaign.officers[0]?.role],
        ["의도", expect.any(String)],
        ["상태", expect.any(String)],
      ]),
    });
    expect(view.operation?.recipients[0]?.label).toContain(completeCampaign.officers[0]?.name);
    expect(view.operation?.events.length).toBeGreaterThan(0);
    expect(view.operation?.events.every(({ label }) => !/[A-Za-z]{4}/.test(label))).toBe(true);
  });

  it("uses readable officer name and role fallbacks when roster lookup is missing", () => {
    const session = createGameSession(completeCampaign, "missing-officer-role");
    session.dispatch({ type: "start-attempt" });
    const view = projectGameViewModel(session.read(), {
      title: completeCampaign.title,
      sceneCount: completeCampaign.scenes.length,
      officers: [],
    });

    expect(view.operation?.officers[0]).toMatchObject({
      name: "소속 미상 장교",
      role: "역할 정보 없음",
      facts: expect.arrayContaining([["역할", "역할 정보 없음"]]),
    });
    expect(view.operation?.officers[0]?.name).not.toBe(
      session.read().operation?.officers[0]?.id,
    );
  });

  it("joins authored beat copy and report tone by stable identifiers", () => {
    const session = createGameSession(bridgeDefenseCampaign, "authored-operation-copy");
    session.dispatch({ type: "start-attempt" });
    const snapshot = session.read();
    const beat = snapshot.scene.beats[0];
    const authoredReport = beat?.reports[0];
    const view = projectGameViewModel(snapshot, {
      title: bridgeDefenseCampaign.title,
      sceneCount: bridgeDefenseCampaign.scenes.length,
      officers: bridgeDefenseCampaign.officers,
    });
    const beatEvent = view.operation?.events.find(({ kind }) => kind === "beat-activated");
    const report = view.operation?.reports.find(
      ({ authoredReportId }) => authoredReportId === authoredReport?.id,
    );

    expect(beatEvent).toMatchObject({
      label: beat?.headline,
      description: beat?.description,
    });
    expect(view.operation?.events.map(({ sequence }) => sequence)).toEqual(
      [...(view.operation?.events ?? [])].map(({ sequence }) => sequence).sort((a, b) => b - a),
    );
    expect(report).toMatchObject({
      authoredReportId: authoredReport?.id,
      tone: "확신",
    });
  });

  it("uses readable fallbacks when authored beat and report lookups are missing", () => {
    const session = createGameSession(bridgeDefenseCampaign, "missing-authored-copy");
    session.dispatch({ type: "start-attempt" });
    const snapshot = structuredClone(session.read());
    snapshot.replay.forEach((event) => {
      if (event.kind === "beat-activated") {
        Object.assign(event.data, { beatId: "missing-beat-id" });
      }
    });
    Object.assign(snapshot.scene, { beats: [] });

    const view = projectGameViewModel(snapshot, {
      title: bridgeDefenseCampaign.title,
      sceneCount: bridgeDefenseCampaign.scenes.length,
      officers: bridgeDefenseCampaign.officers,
    });
    const beatEvent = view.operation?.events.find(({ kind }) => kind === "beat-activated");

    expect(beatEvent).toMatchObject({
      label: "새 작전 상황",
      description: "상황 설명을 확인할 수 없습니다.",
    });
    expect(view.operation?.reports[0]?.tone).toBe("어조 정보 없음");
    expect(`${beatEvent?.label} ${beatEvent?.description}`).not.toContain("missing-beat-id");
  });

  it("projects tutorial targets as authored report and roster copy with safe fallbacks", () => {
    const session = createGameSession(completeCampaign, "readable-guidance-targets");
    session.dispatch({ type: "start-attempt" });
    const operation = session.read();
    const routeStep = operation.scene.guidance.find(({ action }) => action === "route");
    if (!routeStep || routeStep.action !== "route") throw new Error("Expected route guidance.");
    const reportBeat = operation.scene.beats.find((beat) =>
      beat.reports.some(({ id }) => id === routeStep.target.reportId),
    );
    session.advance(
      (reportBeat?.timeMs ?? 0) / operation.scene.gameplayTuning.simulationSpeed,
    );
    session.dispatch({ type: "pause" });

    const inspectView = projectGameViewModel(session.read(), campaignView);
    expect(inspectView.tutorial?.target).toBe("소령 백돌격");
    expect(inspectView.tutorial?.target).not.toContain("major-baek");

    session.dispatch({ type: "inspect-officer", officerId: "major-baek" });
    const routeSnapshot = session.read();
    const routeView = projectGameViewModel(routeSnapshot, campaignView);
    const reportCopy = routeView.operation?.reports.find(
      ({ authoredReportId }) => authoredReportId === routeStep.target.reportId,
    )?.text;
    expect(routeView.tutorial?.target).toBe(`“${reportCopy}” → 소령 백돌격`);
    expect(routeView.tutorial?.target).not.toMatch(/school-han-address|major-baek/);

    const fallbackSnapshot = structuredClone(routeSnapshot);
    const fallbackStep = fallbackSnapshot.tutorial.currentStep;
    if (!fallbackStep || fallbackStep.action !== "route") {
      throw new Error("Expected cloned route guidance.");
    }
    Object.assign(fallbackStep.target, {
      reportId: "missing-report-id",
      recipientOfficerId: "missing-officer-id",
    });
    const fallbackView = projectGameViewModel(fallbackSnapshot, campaignView);
    expect(fallbackView.tutorial?.target).toBe(
      "“보고 내용을 확인할 수 없음” → 수신 장교 정보 없음",
    );
    expect(fallbackView.tutorial?.target).not.toMatch(/missing-report-id|missing-officer-id/);
  });

  it("projects the latest intervention costs with Korean action copy and reset semantics", () => {
    const session = createGameSession(completeCampaign, "intervention-feedback-view-model");
    session.dispatch({ type: "start-attempt" });
    session.dispatch({
      type: "route-report",
      reportId: "school-baek-ready",
      recipientOfficerId: "captain-han",
    });

    const routed = projectGameViewModel(session.read(), campaignView).operation
      ?.interventionFeedback;
    expect(routed).toEqual({
      action: "보고 전달 · 대위 한확인 수신",
      autonomyCost: 15,
      logisticsCost: 2,
      count: 1,
    });
    expect(JSON.stringify(routed)).not.toMatch(
      /route-report|school-baek-ready|captain-han/,
    );

    session.dispatch({ type: "authorize-officer", officerId: "captain-han" });
    expect(projectGameViewModel(session.read(), campaignView).operation?.interventionFeedback)
      .toMatchObject({
        action: "예외 권한 부여 · 대위 한확인",
        count: 2,
      });

    session.dispatch({ type: "reset" });
    session.dispatch({ type: "start-attempt" });
    expect(session.read().lastIntervention).toBeNull();
    expect(projectGameViewModel(session.read(), campaignView).operation?.interventionFeedback)
      .toBeNull();
  });

  it("keeps runtime and authored report identities separate after routing", () => {
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable report scene.");
    }
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [];
    const session = createGameSession(campaign, "runtime-report-view-model");
    session.dispatch({ type: "start-attempt" });
    const original = session.read().operation?.messages[0];
    if (!original) throw new Error("Expected an authored report message.");
    session.dispatch({
      type: "route-report",
      reportId: original.id,
      recipientOfficerId: "captain-han",
    });

    const view = projectGameViewModel(session.read(), {
      title: campaign.title,
      sceneCount: campaign.scenes.length,
      officers: campaign.officers,
    });
    const reports = view.operation?.reports.filter(
      ({ authoredReportId }) => authoredReportId === original.authoredReportId,
    );

    expect(reports).toHaveLength(2);
    expect(reports?.map(({ id }) => id)).toEqual([
      expect.stringMatching(/^intervention-route-/),
      original.id,
    ]);
    expect(reports?.every(({ authoredReportId }) => authoredReportId === original.authoredReportId))
      .toBe(true);
  });

  it("projects weak transmissions from queued through contradicted without leaking authored copy", () => {
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable report scene.");
    }
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [];
    const session = createGameSession(campaign, "weak-report-view-model");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0.5,
        authorityClarity: 0.5,
        verificationDepth: 0.4,
        feedbackCompression: 0,
      },
    });
    session.dispatch({ type: "start-attempt" });
    const queuedSnapshot = session.read();
    const queued = queuedSnapshot.operation?.messages[0];
    if (!queued) throw new Error("Expected a queued report message.");
    const queuedReport = projectGameViewModel(queuedSnapshot, campaignView).operation?.reports
      .find(({ id }) => id === queued.id);

    expect(queued.receivedText).toBe(`[불확실한 송신] ${queued.text}`);
    expect(queuedReport).toMatchObject({
      deliveryState: "queued",
      status: "전송 대기 · 아직 수신되지 않음",
      text: "수신 대기 중 · 전달 후 수신 문구를 확인할 수 있습니다.",
    });
    expect(queuedReport?.text).not.toContain(queued.text);

    session.advance(
      queued.deliveryAtMs / queuedSnapshot.scene.gameplayTuning.simulationSpeed,
    );
    const delivered = session.read().operation?.messages.find(({ id }) => id === queued.id);
    if (!delivered) throw new Error("Expected a delivered report message.");
    session.dispatch({
      type: "inspect-officer",
      officerId: delivered.recipientOfficerIds[0] ?? "",
    });
    const deliveredView = projectGameViewModel(session.read(), campaignView);
    const deliveredReport = deliveredView.operation?.reports.find(({ id }) => id === queued.id);
    const selectedOfficer = deliveredView.operation?.officers.find(({ selected }) => selected);

    expect(deliveredReport).toMatchObject({
      deliveryState: "delivered",
      verificationState: "pending",
      status: "수신됨 · 검증 대기",
      text: queued.receivedText,
    });
    expect(selectedOfficer?.facts).toContainEqual(["현재 믿음", queued.receivedText]);

    session.advance(6_000 / queuedSnapshot.scene.gameplayTuning.simulationSpeed);
    const contradictedReport = projectGameViewModel(session.read(), campaignView).operation?.reports
      .find(({ id }) => id === queued.id);
    expect(contradictedReport).toMatchObject({
      verificationState: "contradicted",
      status: "수신됨 · 모순 확인",
      text: queued.receivedText,
    });
  });

  it("shows verified reports as confirmed authored copy", () => {
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene || scene.identity.kind === "epilogue") {
      throw new Error("Expected a playable report scene.");
    }
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [];
    const session = createGameSession(campaign, "verified-report-view-model");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0.5,
        authorityClarity: 0.5,
        verificationDepth: 0.4,
        feedbackCompression: 1,
      },
    });
    session.dispatch({ type: "start-attempt" });
    const operation = session.read();
    const report = operation.operation?.messages[0];
    if (!report) throw new Error("Expected a verifiable report message.");
    session.advance(
      (report.deliveryAtMs + 6_000) / operation.scene.gameplayTuning.simulationSpeed,
    );

    const projected = projectGameViewModel(session.read(), campaignView).operation?.reports
      .find(({ id }) => id === report.id);
    expect(projected).toMatchObject({
      deliveryState: "delivered",
      verificationState: "verified",
      status: "검증 완료 · 원문 확인",
      text: report.text,
    });
  });

  it("projects a spatial signal tutorial as one Korean battlefield target", () => {
    const campaign = structuredClone(completeCampaign) as CampaignDefinition;
    const scene = campaign.scenes[0];
    if (!scene) throw new Error("Expected a tutorial scene.");
    (scene as { guidance: CampaignDefinition["scenes"][number]["guidance"] }).guidance = [{
      id: "defend-crossing",
      instruction: "교량에 방어 신호를 보낸다.",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "defend",
        strength: 2,
        position: { x: 12, y: 8 },
      },
      completionEvent: "spatial-signal-issued",
    }];
    const session = createGameSession(campaign, "signal-view-model");
    session.dispatch({ type: "start-attempt" });

    const view = projectGameViewModel(session.read(), {
      title: campaign.title,
      sceneCount: campaign.scenes.length,
      officers: campaign.officers,
    });

    expect(view.tutorial).toMatchObject({
      action: "signal",
      target: "방어 신호 · 강도 2 · 타일 12, 8",
      signal: {
        kind: "defend",
        label: "방어",
        strength: 2,
        position: { x: 12, y: 8 },
      },
    });
  });

  it("projects structured operation failures into player-facing debrief guidance", () => {
    const session = createGameSession(completeCampaign, "view-model-debrief");
    session.dispatch({
      type: "set-harness",
      harness: {
        informationReach: 0,
        authorityClarity: 0,
        verificationDepth: 0,
        feedbackCompression: 0,
      },
    });
    session.dispatch({ type: "start-attempt" });
    const operation = session.read();
    session.advance(
      operation.scene.encounterParameters.durationMs /
        operation.scene.gameplayTuning.simulationSpeed +
        1,
    );

    const view = projectGameViewModel(session.read(), campaignView);

    expect(view.debrief?.success).toBe(false);
    expect(view.debrief?.objectives).toHaveLength(operation.scene.objectives.length);
    expect(view.debrief?.objectives.some(({ passed }) => !passed)).toBe(true);
    expect(view.debrief?.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "보고가 필요한 장교에게 전달되지 않았습니다.",
          officer: "소령 백돌격",
        }),
      ]),
    );
    expect(JSON.stringify(view.debrief)).not.toMatch(
      /point-not-preserved|threat-not-neutralized|report-not-routed|signal-school:event/,
    );
  });

  it("projects successful lesson choices with officer names", () => {
    const session = createGameSession(completeCampaign, 0);
    session.dispatch({ type: "start-attempt" });
    const operation = session.read();
    session.advance(
      operation.scene.encounterParameters.durationMs /
        operation.scene.gameplayTuning.simulationSpeed +
        1,
    );

    const view = projectGameViewModel(session.read(), campaignView);

    expect(view.debrief?.success).toBe(true);
    expect(view.debrief?.lessonChoices).toHaveLength(completeCampaign.officers.length);
    expect(view.debrief?.lessonChoices[0]?.officer).toBe("소령 백돌격");
  });
});
