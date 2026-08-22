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
import { mountAutonomousBattlefield } from "../presentation/battlefield/autonomousBattlefield";
import { renderBriefingView } from "../presentation/phases/briefingView";
import { renderDebriefView } from "../presentation/phases/debriefView";
import { renderEpilogueView } from "../presentation/phases/epilogueView";
import { renderOperationView } from "../presentation/phases/operationView";
import type { GameAudio } from "./GameAudio";

export type { GameFrameScheduler } from "../presentation/gameEffects";

export type GameAppOptions = Readonly<{
  frameScheduler?: GameFrameScheduler;
  audio?: GameAudio;
  reducedMotion?: boolean | (() => boolean);
  onSnapshot?: (snapshot: ReturnType<GameSession["read"]>) => void;
  onMutedChange?: (muted: boolean) => void;
}>;

export type GameApp = Readonly<{
  session: GameSession;
  render: () => void;
  destroy: () => void;
}>;

type GameAppCampaign = Readonly<{
  title: string;
  scenes: readonly unknown[];
  roles: PresentationCampaign["roles"];
}>;

type RenderContinuity = Readonly<{
  focusKey?: string;
  drafts: ReadonlyMap<string, Readonly<{
    value: string;
    selectionStart: number | null;
    selectionEnd: number | null;
  }>>;
  scrollPositions: ReadonlyMap<string, Readonly<{ left: number; top: number }>>;
}>;

function captureRenderContinuity(root: HTMLElement): RenderContinuity {
  const activeElement = document.activeElement;
  return {
    focusKey: activeElement instanceof HTMLElement && root.contains(activeElement)
      ? activeElement.dataset.focusKey
      : undefined,
    drafts: new Map(
      [...root.querySelectorAll<HTMLInputElement>("input[data-draft-key]")]
        .map((input) => [input.dataset.draftKey ?? "", {
          value: input.value,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
        }] as const),
    ),
    scrollPositions: new Map(
      [...root.querySelectorAll<HTMLElement>("[data-scroll-key]")]
        .map((element) => [element.dataset.scrollKey ?? "", {
          left: element.scrollLeft,
          top: element.scrollTop,
        }] as const),
    ),
  };
}

function restoreRenderContinuity(
  root: HTMLElement,
  continuity: RenderContinuity,
  restoreFocus: (focusKey?: string) => void,
): void {
  for (const input of root.querySelectorAll<HTMLInputElement>("input[data-draft-key]")) {
    const draft = continuity.drafts.get(input.dataset.draftKey ?? "");
    if (draft) input.value = draft.value;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-scroll-key]")) {
    const position = continuity.scrollPositions.get(element.dataset.scrollKey ?? "");
    if (position) {
      element.scrollLeft = position.left;
      element.scrollTop = position.top;
    }
  }
  restoreFocus(continuity.focusKey);
  const focused = document.activeElement;
  if (!(focused instanceof HTMLInputElement)) return;
  const draft = continuity.drafts.get(focused.dataset.draftKey ?? "");
  if (draft && draft.selectionStart !== null && draft.selectionEnd !== null) {
    focused.setSelectionRange(draft.selectionStart, draft.selectionEnd);
  }
}

function isolateOptionalAudio(audio: GameAudio): GameAudio {
  return {
    cue: (cue) => {
      try {
        audio.cue(cue);
      } catch {
        // Optional audio cannot block game commands.
      }
    },
    setSoundtrack: (soundtrackId) => {
      try {
        audio.setSoundtrack(soundtrackId);
      } catch {
        // Keep rendering without music.
      }
    },
    muted: () => {
      try {
        return audio.muted();
      } catch {
        return true;
      }
    },
    setMuted: (muted) => {
      try {
        audio.setMuted(muted);
      } catch {
        // Keep the mute control non-blocking.
      }
    },
    dispose: () => {
      try {
        audio.dispose();
      } catch {
        // Continue the remaining UI teardown.
      }
    },
  };
}

export function mountGameApp(
  root: HTMLElement,
  campaign: GameAppCampaign,
  session: GameSession,
  options: GameAppOptions = {},
): GameApp {
  const scheduler = options.frameScheduler ?? { request: () => 0, cancel: () => undefined };
  const audio = isolateOptionalAudio(options.audio ?? {
    cue: () => undefined,
    setSoundtrack: () => undefined,
    muted: () => true,
    setMuted: () => undefined,
    dispose: () => undefined,
  } satisfies GameAudio);
  const campaignView: PresentationCampaign = {
    title: campaign.title,
    sceneCount: campaign.scenes.length,
    roles: campaign.roles,
  };
  let message = "";
  let destroyed = false;
  let selectedActorId: string | null = null;
  let battlefield: ReturnType<typeof mountAutonomousBattlefield> | null = null;
  const prefersReducedMotion = (): boolean => {
    if (typeof options.reducedMotion === "function") return options.reducedMotion();
    return options.reducedMotion
      ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ?? false;
  };

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

  const inspectActor = (actorId: string): void => {
    selectedActorId = actorId;
    render();
  };

  function render(): void {
    if (destroyed) return;
    const continuity = captureRenderContinuity(root);
    const snapshot = session.read();
    const reducedMotion = prefersReducedMotion();
    options.onSnapshot?.(snapshot);
    effects.observe(snapshot);
    const view = projectGameViewModel(snapshot, campaignView, selectedActorId);
    const shell = node("div", "game-shell");
    shell.dataset.reducedMotion = String(reducedMotion);
    shell.style.setProperty("--scene-accent", view.accentColor);
    shell.dataset.phase = view.phase;
    shell.append(renderGameHeader(view, audio, () => {
      audio.setMuted(!audio.muted());
      options.onMutedChange?.(audio.muted());
      render();
      effects.restoreFocus("toggle-mute");
    }));
    if (message) {
      const notice = node("p", "game-notice", message);
      notice.setAttribute("role", "alert");
      shell.append(notice);
    }
    if (view.phase === "briefing") shell.append(renderBriefingView(view, dispatch));
    else if (view.phase === "operation") {
      battlefield ??= mountAutonomousBattlefield({ onInspectActor: inspectActor });
      battlefield.update(view.operation, reducedMotion);
      shell.append(renderOperationView(
        view,
        dispatch,
        inspectActor,
        battlefield.element,
      ));
    }
    else if (view.phase === "debrief") shell.append(renderDebriefView(view, dispatch));
    else shell.append(renderEpilogueView(view, dispatch));
    root.replaceChildren(shell);
    restoreRenderContinuity(root, continuity, effects.restoreFocus);
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
