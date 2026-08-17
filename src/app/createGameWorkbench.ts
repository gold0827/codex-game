import { createBrowserAudio, createBrowserCampaignRepository, createBrowserFrameScheduler } from "../platform/browser/adapters";
import { mountGameWorkbench, type GameWorkbench } from "./GameWorkbench";
import { productionSoundtrackCatalog } from "./musicCatalog";

type AuthoredCampaign = Parameters<typeof mountGameWorkbench>[1];

export function mountProductionGame(root: HTMLElement, campaign: AuthoredCampaign): GameWorkbench {
  return mountGameWorkbench(root, campaign, {
    repository: createBrowserCampaignRepository(campaign),
    frameScheduler: createBrowserFrameScheduler(),
    audioFactory: () => createBrowserAudio(productionSoundtrackCatalog),
    audioCredits: productionSoundtrackCatalog,
  });
}
