import { describe, expect, it } from "vitest";

import { createCampaignOperation } from "../../src/application/campaign-operation";
import { createCampaignRun } from "../../src/campaign";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import { BALANCED_HARNESS } from "../../src/simulation/simulationTypes";

describe("campaign to operation application seam", () => {
  it("runs a CampaignRun launch through the real headless operation runtime", () => {
    const run = createCampaignRun(completeCampaign, "headless-campaign-run");
    const launch = run.read().launch;
    if (!launch) throw new Error("Expected a playable campaign launch.");
    const operation = createCampaignOperation(launch, BALANCED_HARNESS);

    expect(() => operation.result()).toThrow(/terminates/);
    operation.simulation.advance(launch.scene.encounterParameters.durationMs);
    const terminal = operation.result();
    const resolved = run.resolve(terminal);

    expect(terminal).toMatchObject({
      sceneId: launch.scene.identity.id,
      outcomeId: terminal.status === "success" ? "success" : "retry",
    });
    expect(resolved.status).toBe(terminal.status === "success" ? "lesson" : "operation");
    if (terminal.status === "success") {
      expect(terminal.lessonChoices).toHaveLength(launch.officers.length);
      expect(run.decide({ lessonId: terminal.lessonChoices[0]!.id }).progress.currentSceneId)
        .not.toBe(launch.scene.identity.id);
    } else {
      expect(resolved.launch?.seed).toBe(launch.seed);
    }
  });

  it("applies bounded lesson memory only to its officer's next operation profile", () => {
    const officerId = completeCampaign.officers[0]!.id;
    const baselineRun = createCampaignRun(completeCampaign, "experienced-officer");
    const experiencedRun = createCampaignRun(completeCampaign, "experienced-officer", [{
      officerId,
      lessons: [{ id: "first-lesson", officerId, summary: "첫 작전의 교훈" }],
    }]);
    const baselineLaunch = baselineRun.read().launch;
    const experiencedLaunch = experiencedRun.read().launch;
    if (!baselineLaunch || !experiencedLaunch) throw new Error("Expected playable launches.");

    const baseline = createCampaignOperation(baselineLaunch, BALANCED_HARNESS).simulation.snapshot();
    const experiencedOperation = createCampaignOperation(
      experiencedLaunch,
      BALANCED_HARNESS,
    );
    const experienced = experiencedOperation.simulation.snapshot();
    const repeated = createCampaignOperation(
      experiencedLaunch,
      BALANCED_HARNESS,
    ).simulation.snapshot();

    const baselineOfficer = baseline.officers.find(({ id }) => id === officerId)!;
    const experiencedOfficer = experienced.officers.find(({ id }) => id === officerId)!;
    expect(experiencedOfficer.experienceLevel).toBe(1);
    expect(experiencedOfficer.profile.discipline).toBeGreaterThan(
      baselineOfficer.profile.discipline,
    );
    expect(experiencedOfficer.profile.stressTolerance).toBeGreaterThan(
      baselineOfficer.profile.stressTolerance,
    );
    expect(experiencedOfficer.decisionCadenceMs).toBeLessThan(
      baselineOfficer.decisionCadenceMs,
    );
    expect(experienced.officers.slice(1).map(({ profile }) => profile)).toEqual(
      baseline.officers.slice(1).map(({ profile }) => profile),
    );
    expect(repeated.officers).toEqual(experienced.officers);
  });
});
