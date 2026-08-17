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
});
