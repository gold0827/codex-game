import {
  createBrowserAudio,
  createBrowserCampaignRepository,
  createBrowserFrameScheduler,
  createBrowserStorage,
} from "../platform/browser/adapters";
import { bridgeDefenseCampaign } from "../scenarios/bridgeDefenseOperation";
import { mountGameWorkbench, type GameWorkbench } from "./GameWorkbench";
import { productionSoundtrackCatalog } from "./musicCatalog";
import { createPlayerSettingsStore } from "./PlayerSettings";
import {
  createCampaignCheckpoint,
  createCampaignCheckpointStore,
} from "./CampaignCheckpoint";

type AuthoredCampaign = Parameters<typeof mountGameWorkbench>[1];

export function mountProductionGame(
  root: HTMLElement,
  campaign: AuthoredCampaign = bridgeDefenseCampaign,
): GameWorkbench {
  const storage = createBrowserStorage();
  return mountGameWorkbench(root, campaign, {
    repository: createBrowserCampaignRepository(campaign),
    frameScheduler: createBrowserFrameScheduler(),
    audioFactory: () => createBrowserAudio(productionSoundtrackCatalog),
    audioCredits: productionSoundtrackCatalog,
    editorEnabled: new URLSearchParams(window.location.search).get("editor") === "1",
    fieldManualVariant: "bridge-prototype",
    settingsStore: createPlayerSettingsStore(
      storage,
      `player-settings:${campaign.id}:v1`,
    ),
    checkpoint: createCampaignCheckpoint(createCampaignCheckpointStore(
      storage,
      `campaign-progress:${campaign.id}:v1`,
    )),
  });
}
