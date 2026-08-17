import {
  GameSessionError,
  type GameCommand,
  type GameSession,
} from "../application/game-session";
import { type CommandDispatcher, node } from "../presentation/dom";
import {
  mountCanvasBattlefield,
  type MountedCanvasBattlefield,
} from "../presentation/battlefield/canvasBattlefield";
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
import { projectBattlefieldFrame } from "../presentation/operation/battlefieldProjector";
import type { GameAudio } from "./GameAudio";

export type { GameFrameScheduler } from "../presentation/gameEffects";

export type GameAppOptions = Readonly<{
  frameScheduler?: GameFrameScheduler;
  audio?: GameAudio;
  reducedMotion?: boolean;
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
    setSoundtrack: () => undefined,
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
  let battlefield: MountedCanvasBattlefield | null = null;
  let selectedSignalPosition: Readonly<{ x: number; y: number }> | null = null;
  const reducedMotion = options.reducedMotion ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

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
    const battlefieldFrame = projectBattlefieldFrame(snapshot, {
      reducedMotion,
      effectTrack: effects.effectTrack,
    });
    if (battlefieldFrame) {
      battlefield ??= mountCanvasBattlefield(scheduler, {
        onTileSelected: (position) => {
          selectedSignalPosition = position;
          render();
        },
      });
      battlefield.update(battlefieldFrame);
    } else if (battlefield) {
      battlefield.destroy();
      battlefield = null;
      selectedSignalPosition = null;
    }
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
    else if (view.phase === "operation" && battlefield) {
      shell.append(renderOperationView(view, dispatch, battlefield.element, {
        selectedSignalPosition,
      }));
    }
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
      battlefield?.destroy();
      battlefield = null;
      effects.destroy();
      root.replaceChildren();
    },
  };
}
