import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createProductionCampaignOperationFactory,
  type CampaignOperationFactory,
} from "../../src/application/campaign-operation";
import {
  mountGameWorkbench,
  type GameWorkbench,
} from "../../src/app/GameWorkbench";
import { mountProductionGame } from "../../src/app/createGameWorkbench";
import { chuncheonAutonomousBattle } from "../../src/scenarios/chuncheonAutonomousBattle";
import { chuncheonCampaign } from "../../src/scenarios/chuncheonCampaign";
import type { GameFrameScheduler } from "../../src/ui/GameApp";

class InertScheduler implements GameFrameScheduler {
  request(): number { return 1; }
  cancel(): void {}
}

describe("game workbench operation assembly", () => {
  let workbench: GameWorkbench;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    workbench?.destroy();
    vi.restoreAllMocks();
  });

  it("fixes production assembly to the canonical campaign", () => {
    expectTypeOf(mountProductionGame).parameters.toEqualTypeOf<[root: HTMLElement]>();
  });

  it("passes its operation factory into fresh and restarted sessions", () => {
    const operationFactory: CampaignOperationFactory = vi.fn(
      createProductionCampaignOperationFactory(chuncheonAutonomousBattle),
    );
    const root = document.querySelector<HTMLElement>("#root")!;
    workbench = mountGameWorkbench(root, chuncheonCampaign, {
      frameScheduler: new InertScheduler(),
      operationFactory,
    });

    workbench.session().dispatch({ type: "start-attempt" });
    expect(operationFactory).toHaveBeenCalledTimes(1);
    expect(workbench.session().read().operation?.battleId).toBe(
      chuncheonAutonomousBattle.id,
    );

    workbench.restartGame();
    workbench.session().dispatch({ type: "start-attempt" });
    expect(operationFactory).toHaveBeenCalledTimes(2);
  });
});
