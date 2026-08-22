import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCampaignOperation,
  type CampaignOperationFactory,
} from "../../src/application/campaign-operation";
import {
  mountGameWorkbench,
  type GameWorkbench,
} from "../../src/app/GameWorkbench";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import type { GameFrameScheduler } from "../../src/ui/GameApp";

class InertScheduler implements GameFrameScheduler {
  request(): number { return 1; }
  cancel(): void {}
}

describe("game workbench operation assembly", () => {
  let workbench: GameWorkbench;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    workbench?.destroy();
    vi.restoreAllMocks();
  });

  it("passes its operation factory into fresh and restarted sessions", () => {
    const operationFactory: CampaignOperationFactory = vi.fn(
      createCampaignOperation,
    );
    const root = document.querySelector<HTMLElement>("#root")!;
    workbench = mountGameWorkbench(root, completeCampaign, {
      frameScheduler: new InertScheduler(),
      operationFactory,
    });

    workbench.session().dispatch({ type: "start-attempt" });
    expect(operationFactory).toHaveBeenCalledTimes(1);

    workbench.restartGame();
    workbench.session().dispatch({ type: "start-attempt" });
    expect(operationFactory).toHaveBeenCalledTimes(2);
  });
});
