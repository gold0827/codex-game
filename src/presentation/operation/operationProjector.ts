import type { GameSnapshot } from "../../application/game-session";
import type { BattlefieldFrame } from "../battlefield/battlefieldFrame";
import {
  projectHudViewModel,
  type HudViewModel,
  type PresentationCampaign,
} from "../gameViewModel";
import { projectBattlefieldFrame } from "./battlefieldProjector";

export type { HudViewModel } from "../gameViewModel";

export type OperationPresentation = Readonly<{
  battlefield: BattlefieldFrame | null;
  hud: HudViewModel;
}>;

export function projectOperationPresentation(
  snapshot: GameSnapshot,
  campaign: PresentationCampaign,
): OperationPresentation {
  return {
    battlefield: projectBattlefieldFrame(snapshot),
    hud: projectHudViewModel(snapshot, campaign),
  };
}
