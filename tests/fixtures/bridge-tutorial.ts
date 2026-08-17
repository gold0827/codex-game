import { expect } from "vitest";

import type { GameSession } from "../../src/application/game-session";
import { bridgeDefenseMapSkin } from "../../src/scenarios/bridgeDefenseOperation";

export function completeBridgeTutorial(session: GameSession): void {
  const bridge = bridgeDefenseMapSkin.crossings[1];
  if (!bridge) throw new Error("Missing bridge crossing fixture.");

  session.dispatch({ type: "start-attempt" });
  expect(session.read().tutorial.currentStep?.action).toBe("pause");
  session.dispatch({ type: "pause" });
  expect(session.read().tutorial.currentStep?.action).toBe("inspect");
  session.dispatch({ type: "inspect-officer", officerId: "captain-han" });
  expect(session.read().tutorial.currentStep?.action).toBe("signal");
  session.dispatch({
    type: "issue-spatial-signal",
    signal: "defend",
    strength: 2,
    position: bridge.position,
  });
  expect(session.read().tutorial.currentStep?.action).toBe("resume");
  session.dispatch({ type: "resume" });
  expect(session.read().tutorial.currentStep).toBeNull();
}
