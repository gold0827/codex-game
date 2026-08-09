import type { CampaignDefinition } from "../campaign";
import { createCampaignDocument, type CampaignStorage } from "../editor";
import { createGameController, type GameController } from "../game";
import { mountCampaignEditor, type CampaignEditor } from "./CampaignEditor";
import {
  mountGameApp,
  type GameApp,
  type GameAppOptions,
  type GameFrameScheduler,
} from "./GameApp";
import { createGameAudio, type GameAudio } from "./GameAudio";

export type GameWorkbenchOptions = Readonly<{
  storage?: CampaignStorage;
  storageKey?: string;
  frameScheduler?: GameFrameScheduler;
  audioFactory?: () => GameAudio;
  seed?: string | number;
}>;

export type GameWorkbench = Readonly<{
  document: ReturnType<typeof createCampaignDocument>;
  controller: () => GameController;
  openEditor: () => void;
  closeEditor: () => void;
  restartGame: () => void;
  destroy: () => void;
}>;

function browserStorage(): CampaignStorage {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
}

export function mountGameWorkbench(
  root: HTMLElement,
  authoredCampaign: CampaignDefinition,
  options: GameWorkbenchOptions = {},
): GameWorkbench {
  const storage = options.storage ?? browserStorage();
  const campaignDocument = createCampaignDocument(authoredCampaign, {
    storage,
    storageKey: options.storageKey,
  });
  const loadResult = campaignDocument.load();
  const shell = document.createElement("main");
  shell.className = "game-workbench";
  const gameRoot = document.createElement("div");
  gameRoot.className = "workbench-game";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "workbench-editor-toggle";
  toggle.dataset.action = "open-editor";
  toggle.textContent = "장면 편집";
  const editorRoot = document.createElement("div");
  editorRoot.className = "workbench-editor";
  editorRoot.hidden = true;
  shell.append(gameRoot, toggle, editorRoot);
  if (!loadResult.ok) {
    const startupNotice = document.createElement("div");
    startupNotice.className = "workbench-notice";
    startupNotice.setAttribute("role", "alert");
    startupNotice.textContent = loadResult.diagnostics
      .map((diagnostic) => `${diagnostic.path}: 저장된 캠페인을 불러오지 못했습니다.`)
      .join(" ");
    shell.append(startupNotice);
  }
  root.replaceChildren(shell);

  let generation = 0;
  let gameApp: GameApp;
  let editor: CampaignEditor;
  let editorOpen = false;
  let pausedForEditor = false;
  let destroyed = false;

  const gameOptions = (): GameAppOptions => ({
    frameScheduler: options.frameScheduler,
    audio: (options.audioFactory ?? createGameAudio)(),
  });

  const createFreshGame = (): GameApp => {
    const snapshot = structuredClone(campaignDocument.snapshot());
    const seed = `${String(options.seed ?? "production-campaign")}:restart-${generation}`;
    generation += 1;
    const controller = createGameController(snapshot, seed);
    return mountGameApp(gameRoot, snapshot, controller, gameOptions());
  };

  const restartGame = (): void => {
    if (destroyed) return;
    gameApp.destroy();
    gameApp = createFreshGame();
    pausedForEditor = false;
  };

  const closeEditor = (): void => {
    if (!editorOpen || destroyed) return;
    editorOpen = false;
    editorRoot.hidden = true;
    shell.classList.remove("editor-open");
    toggle.hidden = false;
    if (pausedForEditor && gameApp.controller.snapshot().phase === "operation") {
      gameApp.controller.resume();
      gameApp.render();
    }
    pausedForEditor = false;
  };

  const openEditor = (): void => {
    if (editorOpen || destroyed) return;
    const snapshot = gameApp.controller.snapshot();
    if (snapshot.phase === "operation" && !snapshot.paused) {
      gameApp.controller.pause();
      gameApp.render();
      pausedForEditor = true;
    }
    editorOpen = true;
    editorRoot.hidden = false;
    shell.classList.add("editor-open");
    toggle.hidden = true;
    editor.render();
  };

  gameApp = createFreshGame();
  editor = mountCampaignEditor(editorRoot, campaignDocument, {
    onClose: closeEditor,
    onRestart: restartGame,
  });
  toggle.addEventListener("click", openEditor);

  if (!loadResult.ok) editor.showDiagnostics(loadResult.diagnostics);

  return {
    document: campaignDocument,
    controller: () => gameApp.controller,
    openEditor,
    closeEditor,
    restartGame,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      gameApp.destroy();
      editor.destroy();
      root.replaceChildren();
    },
  };
}
