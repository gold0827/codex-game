import { describe, expect, it } from "vitest";

import {
  createGameSession,
  type GameSession,
} from "../../src/application/game-session";
import { projectGameViewModel } from "../../src/presentation/gameViewModel";
import {
  bridgeDefenseCampaign,
  bridgeDefenseOperation,
} from "../../src/scenarios/bridgeDefenseOperation";
import { completeBridgeTutorial } from "../fixtures/bridge-tutorial";

const campaignView = {
  title: bridgeDefenseCampaign.title,
  sceneCount: bridgeDefenseCampaign.scenes.length,
  officers: bridgeDefenseCampaign.officers,
};

function finishOperation(session: GameSession): void {
  const remaining = bridgeDefenseOperation.encounterParameters.durationMs -
    (session.read().operation?.elapsedMs ?? 0);
  session.advance(remaining + 1);
}

describe("bridge prototype end-to-end", () => {
  it("turns the taught bridge signal into success, epilogue, and reset", () => {
    const session = createGameSession(bridgeDefenseCampaign, 1);
    completeBridgeTutorial(session);

    session.advance(18_000);
    expect(session.read().operation?.threats[0]).toMatchObject({
      id: "bridge-east-bank-artillery",
      result: "blocked",
    });
    expect(session.read().operationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "threat-resolved",
        data: expect.objectContaining({
          threatId: "bridge-east-bank-artillery",
          result: "blocked",
        }),
      }),
    ]));

    finishOperation(session);
    expect(session.read()).toMatchObject({
      phase: "debrief",
      debrief: { status: "success" },
      operation: {
        objectives: [
          expect.objectContaining({ id: "preserve-haein-bridge", completed: true }),
          expect.objectContaining({ id: "protect-civilian-column", completed: true }),
        ],
      },
    });

    const lesson = session.read().debrief?.lessonChoices[0];
    if (!lesson) throw new Error("Successful bridge defense must offer a lesson.");
    session.dispatch({ type: "choose-lesson", lessonId: lesson.id });
    expect(session.read()).toMatchObject({
      phase: "epilogue",
      scene: { identity: { id: "bridge-defense-complete" } },
    });

    session.dispatch({ type: "reset" });
    expect(session.read()).toMatchObject({
      phase: "briefing",
      attemptNumber: 1,
      scene: { identity: { id: "haein-bridge-defense" } },
    });
  });

  it("explains a failed bridge attempt in Korean and retries the same round", () => {
    const session = createGameSession(bridgeDefenseCampaign, 0);
    completeBridgeTutorial(session);
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "avoid",
      strength: 3,
      position: { x: 22, y: 3 },
    });
    session.dispatch({
      type: "issue-spatial-signal",
      signal: "investigate",
      strength: 1,
      position: { x: 11, y: 7 },
    });
    finishOperation(session);

    const view = projectGameViewModel(session.read(), campaignView);
    expect(session.read()).toMatchObject({
      phase: "debrief",
      debrief: { status: "retry" },
      operation: {
        result: {
          failureCauses: expect.arrayContaining([
            expect.objectContaining({ objectiveId: "preserve-haein-bridge" }),
          ]),
        },
      },
    });
    expect(view.debrief?.failures.length).toBeGreaterThan(0);
    expect(view.debrief?.copy).toContain("다음 시도");
    expect(view.debrief?.failures.every(({ reason, objective }) =>
      /[가-힣]/.test(reason) && /[가-힣]/.test(objective)
    )).toBe(true);
    expect(JSON.stringify(view.debrief)).not.toMatch(
      /threat-not-neutralized|point-not-preserved|bridge-north-bank-misinformation/,
    );

    session.dispatch({ type: "continue-campaign" });
    expect(session.read()).toMatchObject({
      phase: "briefing",
      attemptNumber: 2,
      scene: { identity: { id: "haein-bridge-defense" } },
    });
  });

  it("replays the same seed and commands into the same final snapshot", () => {
    const first = createGameSession(bridgeDefenseCampaign, 1);
    const second = createGameSession(bridgeDefenseCampaign, 1);
    completeBridgeTutorial(first);
    completeBridgeTutorial(second);
    finishOperation(first);
    finishOperation(second);

    expect(second.read()).toEqual(first.read());
  });
});
