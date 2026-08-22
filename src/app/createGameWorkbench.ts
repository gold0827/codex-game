import {
  createBrowserAudio,
  createBrowserCampaignRepository,
  createBrowserFrameScheduler,
  createBrowserStorage,
} from "../platform/browser/adapters";
import { createProductionCampaignOperationFactory } from "../application/campaign-operation";
import { chuncheonAutonomousBattle } from "../scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../scenarios/chuncheonCampaign";
import { mountGameWorkbench, type GameWorkbench } from "./GameWorkbench";
import { productionSoundtrackCatalog } from "./musicCatalog";
import { createPlayerSettingsStore } from "./PlayerSettings";
import {
  createCampaignCheckpoint,
  createCampaignCheckpointStore,
} from "./CampaignCheckpoint";

export function mountProductionGame(
  root: HTMLElement,
): GameWorkbench {
  const campaign = chuncheonCampaign;
  const storage = createBrowserStorage();
  return mountGameWorkbench(root, campaign, {
    repository: createBrowserCampaignRepository(campaign),
    frameScheduler: createBrowserFrameScheduler(),
    audioFactory: () => createBrowserAudio(productionSoundtrackCatalog),
    audioCredits: productionSoundtrackCatalog,
    editorEnabled: new URLSearchParams(window.location.search).get("editor") === "1",
    settingsStore: createPlayerSettingsStore(
      storage,
      `player-settings:${campaign.id}:v1`,
    ),
    checkpoint: createCampaignCheckpoint(createCampaignCheckpointStore(
      storage,
      `campaign-progress:${campaign.id}:v1`,
    )),
    operationFactory: createProductionCampaignOperationFactory(chuncheonAutonomousBattle),
  });
}
