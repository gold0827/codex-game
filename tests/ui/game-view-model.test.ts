import { describe, expect, it } from "vitest";

import { createGameSession } from "../../src/application/game-session";
import type { CampaignDefinition } from "../../src/campaign";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
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
    expect(view.operation?.recipients[0]?.label).toContain(completeCampaign.officers[0]?.name);
    expect(view.operation?.events.length).toBeGreaterThan(0);
    expect(view.operation?.events.every(({ label }) => !/[A-Za-z]{4}/.test(label))).toBe(true);
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
