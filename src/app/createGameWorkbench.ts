import { createBrowserAudio, createBrowserCampaignRepository, createBrowserFrameScheduler } from "../platform/browser/adapters";
import { mountGameWorkbench, type GameWorkbench } from "./GameWorkbench";

type AuthoredCampaign = Parameters<typeof mountGameWorkbench>[1];

export function mountProductionGame(root: HTMLElement, campaign: AuthoredCampaign): GameWorkbench {
  const audio = createBrowserAudio();
  return mountGameWorkbench(root, campaign, {
    repository: createBrowserCampaignRepository(campaign),
    frameScheduler: createBrowserFrameScheduler(),
    audioFactory: () => audio,
  });
}
