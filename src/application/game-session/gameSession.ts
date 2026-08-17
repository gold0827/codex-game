import type { CampaignDefinition } from "../../campaign";
import {
  createGameController,
  type GameSnapshot,
  type HarnessAxis,
  type PlayerSpeed,
} from "../../game";
import type { RandomSeed } from "../../simulation/seededRandom";
import type { HarnessConfiguration } from "../../simulation/simulationTypes";
import type { CampaignTilePosition } from "../../campaign";
import type { SpatialSignalKind, SpatialSignalStrength } from "../../simulation/simulationTypes";

export type GameCommand =
  | Readonly<{ type: "configure-harness"; axis: HarnessAxis; value: number }>
  | Readonly<{ type: "set-harness"; harness: HarnessConfiguration }>
  | Readonly<{ type: "start-attempt" }>
  | Readonly<{ type: "set-player-speed"; speed: PlayerSpeed }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "resume" }>
  | Readonly<{ type: "inspect-officer"; officerId: string }>
  | Readonly<{
      type: "issue-spatial-signal";
      signal: SpatialSignalKind;
      strength: SpatialSignalStrength;
      position: CampaignTilePosition;
    }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{
      type: "route-report";
      reportId: string;
      recipientOfficerId: string;
    }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{ type: "authorize-officer"; officerId: string }>
  /** @deprecated Remove with route tutorial and legacy operation controls. */
  | Readonly<{ type: "prioritize-verification"; reportId: string }>
  | Readonly<{ type: "continue-campaign" }>
  | Readonly<{ type: "choose-lesson"; lessonId: string }>
  | Readonly<{ type: "reset" }>;

export type GameSession = Readonly<{
  read: () => GameSnapshot;
  dispatch: (command: GameCommand) => GameSnapshot;
  advance: (realElapsedMs: number) => GameSnapshot;
}>;

export function createGameSession(
  campaign: CampaignDefinition,
  baseSeed: RandomSeed,
): GameSession {
  const controller = createGameController(campaign, baseSeed);

  const dispatch = (command: GameCommand): GameSnapshot => {
    switch (command.type) {
      case "configure-harness":
        return controller.configureHarness(command.axis, command.value);
      case "set-harness":
        return controller.setHarness(command.harness);
      case "start-attempt":
        return controller.startAttempt();
      case "set-player-speed":
        return controller.setPlayerSpeed(command.speed);
      case "pause":
        return controller.pause();
      case "resume":
        return controller.resume();
      case "inspect-officer":
        return controller.inspectOfficer(command.officerId);
      case "issue-spatial-signal":
        return controller.issueSpatialSignal(command.signal, command.strength, command.position);
      case "route-report":
        return controller.routeReport(command.reportId, command.recipientOfficerId);
      case "authorize-officer":
        return controller.authorizeOfficer(command.officerId);
      case "prioritize-verification":
        return controller.prioritizeVerification(command.reportId);
      case "continue-campaign":
        return controller.continueCampaign();
      case "choose-lesson":
        return controller.chooseLesson(command.lessonId);
      case "reset":
        return controller.reset();
    }
  };

  return {
    read: controller.snapshot,
    dispatch,
    advance: controller.tick,
  };
}
