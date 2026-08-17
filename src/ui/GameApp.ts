import {
  GameSessionError,
  type GameCommand,
  type GameSession,
} from "../application/game-session";
import { type CommandDispatcher, node } from "../presentation/dom";
import {
  createGameEffects,
  type GameFrameScheduler,
} from "../presentation/gameEffects";
import { renderGameHeader } from "../presentation/gameChrome";
import {
  projectGameViewModel,
  type PresentationCampaign,
} from "../presentation/gameViewModel";
import { renderBriefingView } from "../presentation/phases/briefingView";
import { renderDebriefView } from "../presentation/phases/debriefView";
import { renderEpilogueView } from "../presentation/phases/epilogueView";
import { renderOperationView } from "../presentation/phases/operationView";
import type { GameAudio } from "./GameAudio";

export type { GameFrameScheduler } from "../presentation/gameEffects";

export type GameAppOptions = Readonly<{
  frameScheduler?: GameFrameScheduler;
  audio?: GameAudio;
}>;

export type GameApp = Readonly<{
  session: GameSession;
  render: () => void;
  destroy: () => void;
}>;

type GameAppCampaign = Readonly<{
  title: string;
  scenes: readonly unknown[];
  officers: PresentationCampaign["officers"];
}>;

export function mountGameApp(
  root: HTMLElement,
  campaign: GameAppCampaign,
  session: GameSession,
  options: GameAppOptions = {},
): GameApp {
  const scheduler = options.frameScheduler ?? { request: () => 0, cancel: () => undefined };
  const audio = options.audio ?? {
    cue: () => undefined,
    muted: () => true,
    setMuted: () => undefined,
    dispose: () => undefined,
  } satisfies GameAudio;
  const campaignView: PresentationCampaign = {
    title: campaign.title,
    sceneCount: campaign.scenes.length,
    officers: campaign.officers,
  };
  let message = "";
  let destroyed = false;

  const dispatch: CommandDispatcher = (command: GameCommand, cue = "click", focusKey) => {
    try {
      session.dispatch(command);
      message = "";
      audio.cue(cue);
    } catch (error) {
      message =
        error instanceof GameSessionError && error.code === "harness-over-budget"
          ? "자원 한도를 넘었습니다. 다른 지휘 조건을 낮춘 뒤 다시 조정합니다."
          : "명령을 처리하지 못했습니다.";
    }
    render();
    effects.restoreFocus(focusKey);
    effects.syncFrameLoop();
  };

  function render(): void {
    if (destroyed) return;
    const snapshot = session.read();
    effects.observe(snapshot);
    const view = projectGameViewModel(snapshot, campaignView);
    const shell = node("div", "game-shell");
    shell.style.setProperty("--scene-accent", view.accentColor);
    shell.dataset.phase = view.phase;
    shell.append(renderGameHeader(view, audio, () => {
      audio.setMuted(!audio.muted());
      render();
      effects.restoreFocus("toggle-mute");
    }));
    if (message) {
      const notice = node("p", "game-notice", message);
      notice.setAttribute("role", "alert");
      shell.append(notice);
    }
    if (view.phase === "briefing") shell.append(renderBriefingView(view, dispatch));
    else if (view.phase === "operation") shell.append(renderOperationView(view, dispatch, effects.threatImpacts));
    else if (view.phase === "debrief") shell.append(renderDebriefView(view, dispatch));
    else shell.append(renderEpilogueView(view, dispatch));
    root.replaceChildren(shell);
  }

  const effects = createGameEffects(root, session, scheduler, audio, render);
  render();
  effects.syncFrameLoop();

  return {
    session,
    render,
    destroy: () => {
      destroyed = true;
      effects.destroy();
      root.replaceChildren();
    },
  };
}
