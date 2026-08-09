import { describe, expect, it } from "vitest";

import { validateCampaignDefinition, type CampaignScene } from "../../src/campaign";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

const expectedSceneIds = [
  "signal-school",
  "flooded-convoy",
  "misaddressed-artillery",
  "inspection-ambush",
  "night-switchboard",
  "orchard-siege",
  "greenhouse-epilogue",
];
const koreanText = /[가-힣]/;

function nonRetryPathsReachEpilogue(
  scene: CampaignScene,
  scenesById: ReadonlyMap<string, CampaignScene>,
  visited: ReadonlySet<string> = new Set(),
): boolean {
  if (scene.identity.kind === "epilogue") {
    return true;
  }

  if (visited.has(scene.identity.id)) {
    return false;
  }

  const nextVisited = new Set(visited).add(scene.identity.id);
  const advancingTransitions = scene.transitions.filter(
    ({ outcomeId, targetSceneId }) =>
      outcomeId !== "retry" && targetSceneId !== scene.identity.id,
  );

  return (
    advancingTransitions.length > 0 &&
    advancingTransitions.every(({ targetSceneId }) => {
      const target = scenesById.get(targetSceneId);
      return target !== undefined && nonRetryPathsReachEpilogue(target, scenesById, nextVisited);
    })
  );
}

describe("complete campaign", () => {
  it("exports one valid JSON-round-trippable production definition", () => {
    expect(validateCampaignDefinition(completeCampaign)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(JSON.parse(JSON.stringify(completeCampaign))).toEqual(completeCampaign);
  });

  it("owns the exact tutorial-to-epilogue scene order and kinds", () => {
    expect(completeCampaign.scenes.map(({ identity }) => identity.id)).toEqual(
      expectedSceneIds,
    );
    expect(completeCampaign.scenes.map(({ identity }) => identity.kind)).toEqual([
      "tutorial",
      "operation",
      "operation",
      "operation",
      "operation",
      "operation",
      "epilogue",
    ]);
  });

  it("keeps the recurring roster dispositions stable and every report in-roster", () => {
    expect(
      completeCampaign.officers.map(({ id, disposition }) => ({ id, disposition })),
    ).toEqual([
      { id: "major-baek", disposition: "action" },
      { id: "captain-han", disposition: "verification" },
      { id: "lieutenant-kim", disposition: "communication" },
    ]);

    const officerIds = new Set(completeCampaign.officers.map(({ id }) => id));
    completeCampaign.scenes.forEach((scene) => {
      scene.beats.forEach((beat) => {
        beat.reports.forEach(({ officerId }) => expect(officerIds.has(officerId)).toBe(true));
      });
    });
  });

  it("writes every reader-facing campaign surface directly in Korean", () => {
    expect(completeCampaign.title).toMatch(koreanText);
    completeCampaign.officers.forEach(({ name, rank, role }) => {
      expect([name, rank, role].every((value) => koreanText.test(value))).toBe(true);
    });

    completeCampaign.scenes.forEach((scene) => {
      expect(Object.values(scene.copy).every((value) => koreanText.test(value))).toBe(true);
      scene.objectives.forEach(({ description }) => expect(description).toMatch(koreanText));
      scene.guidance.forEach(({ instruction }) => expect(instruction).toMatch(koreanText));
      scene.beats.forEach(({ headline, description, reports }) => {
        expect(headline).toMatch(koreanText);
        expect(description).toMatch(koreanText);
        reports.forEach(({ text }) => expect(text).toMatch(koreanText));
      });
    });
  });

  it("authors distinct objectives, tuning, timed beats, reports, and threats per playable scene", () => {
    const playableScenes: readonly CampaignScene[] = completeCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    );

    expect(
      new Set(playableScenes.map(({ objectives }) => JSON.stringify(objectives))).size,
    ).toBe(playableScenes.length);
    expect(
      new Set(playableScenes.map(({ gameplayTuning }) => JSON.stringify(gameplayTuning))).size,
    ).toBe(playableScenes.length);

    playableScenes.forEach((scene) => {
      expect(scene.objectives.length).toBeGreaterThan(0);
      expect(scene.beats.length).toBeGreaterThanOrEqual(3);
      expect(scene.beats.flatMap(({ reports }) => reports).length).toBeGreaterThan(0);
      expect(scene.beats.flatMap(({ threats }) => threats).length).toBeGreaterThan(0);
      expect(scene.beats.map(({ timeMs }) => timeMs)).toEqual(
        [...scene.beats].map(({ timeMs }) => timeMs).sort((left, right) => left - right),
      );
    });
  });

  it("authors executable pause, inspect, route, and resume guidance", () => {
    expect(completeCampaign.scenes[0].guidance).toMatchObject([
      {
        action: "pause",
        target: { kind: "operation-clock" },
        completionEvent: "operation-paused",
      },
      {
        action: "inspect",
        target: { kind: "officer", officerId: "major-baek" },
        completionEvent: "officer-inspected",
      },
      {
        action: "route",
        target: {
          kind: "report-recipient",
          reportId: "school-han-address",
          recipientOfficerId: "major-baek",
        },
        completionEvent: "report-routed",
      },
      {
        action: "resume",
        target: { kind: "operation-clock" },
        completionEvent: "operation-resumed",
      },
    ]);
  });

  it("keeps retries in place and makes every advancing path reach the epilogue", () => {
    const scenesById = new Map(
      completeCampaign.scenes.map((scene) => [scene.identity.id, scene]),
    );
    const playableScenes: readonly CampaignScene[] = completeCampaign.scenes.filter(
      ({ identity }) => identity.kind !== "epilogue",
    );

    playableScenes.forEach((scene) => {
      expect(scene.transitions.find(({ outcomeId }) => outcomeId === "retry")).toEqual({
        outcomeId: "retry",
        targetSceneId: scene.identity.id,
      });
      expect(nonRetryPathsReachEpilogue(scene, scenesById)).toBe(true);
    });
    expect(completeCampaign.scenes.at(-1)?.transitions).toEqual([]);
  });
});
