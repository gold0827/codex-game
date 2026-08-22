import { describe, expect, it } from "vitest";

import {
  CampaignRunError,
  createCampaignRun,
  type OfficerLesson,
  type OperationResult,
} from "../../src/campaign";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";

const officerId = chuncheonCampaign.officers[0]!.id;

function lesson(id: string, summary = id): OfficerLesson {
  return { id, officerId, summary };
}

function result(
  sceneId: string,
  status: OperationResult["status"],
  lessonChoices: readonly OfficerLesson[] = [],
): OperationResult {
  return {
    sceneId,
    status,
    outcomeId: status === "success" ? "objectives-achieved" : "retry",
    lessonChoices,
  };
}

describe("CampaignRun", () => {
  it("retries with the same seed and the exact pre-attempt memory", () => {
    const run = createCampaignRun(chuncheonCampaign, "stable-retry", [
      { officerId, lessons: [lesson("before-attempt")] },
    ]);
    const first = run.read();
    const leakedLaunch = first.launch as unknown as {
      memory: Array<{ lessons: OfficerLesson[] }>;
    };
    leakedLaunch.memory[0]!.lessons.push(lesson("operation-only"));

    const retried = run.resolve(
      result(first.progress.currentSceneId, "retry", [lesson("failed-lesson")]),
    );

    expect(retried).toMatchObject({ status: "operation", attemptNumber: 2 });
    expect(retried.launch?.seed).toBe(first.launch?.seed);
    expect(retried.memory.find(({ officerId: id }) => id === officerId)?.lessons).toEqual([
      lesson("before-attempt"),
    ]);
    expect(retried.progress).toEqual(first.progress);
  });

  it("commits only a selected successful lesson and caps recent lessons at two", () => {
    const run = createCampaignRun(chuncheonCampaign, 99, [
      { officerId, lessons: [lesson("old-1"), lesson("old-2")] },
    ]);
    const firstSceneId = run.read().progress.currentSceneId;

    const waiting = run.resolve(
      result(firstSceneId, "success", [lesson("selected"), lesson("not-selected")]),
    );
    expect(waiting).toMatchObject({ status: "lesson", launch: null });
    expect(waiting.memory.find(({ officerId: id }) => id === officerId)?.lessons).toEqual([
      lesson("old-1"),
      lesson("old-2"),
    ]);

    const advanced = run.decide({ lessonId: "selected" });
    expect(advanced.status).toBe("complete");
    expect(advanced.progress.currentSceneId).not.toBe(firstSceneId);
    expect(advanced.memory.find(({ officerId: id }) => id === officerId)?.lessons).toEqual([
      lesson("old-2"),
      lesson("selected"),
    ]);
    expect(advanced.memory.flatMap(({ lessons }) => lessons)).not.toContainEqual(
      lesson("not-selected"),
    );

  });

  it("rejects stale results and unoffered decisions without changing state", () => {
    const run = createCampaignRun(chuncheonCampaign, "atomic");
    const initial = run.read();

    expect(() => run.resolve(result("stale-scene", "retry"))).toThrow(CampaignRunError);
    expect(run.read()).toEqual(initial);

    run.resolve(result(initial.progress.currentSceneId, "success", [lesson("offered")]));
    const waiting = run.read();
    expect(() => run.decide({ lessonId: "invented" })).toThrow(CampaignRunError);
    expect(run.read()).toEqual(waiting);
  });
});
