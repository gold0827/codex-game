import { createBrowserAudio, createBrowserFrameScheduler, createBrowserStorage } from "../platform/browser/adapters";
import { mountGameWorkbench, type GameWorkbench } from "../ui/GameWorkbench";

type AuthoredCampaign = Parameters<typeof mountGameWorkbench>[1];

export function mountProductionGame(root: HTMLElement, campaign: AuthoredCampaign): GameWorkbench {
  const audio = createBrowserAudio();
  return mountGameWorkbench(root, campaign, {
    storage: createBrowserStorage(),
    frameScheduler: createBrowserFrameScheduler(),
    audioFactory: () => audio,
  });
}
