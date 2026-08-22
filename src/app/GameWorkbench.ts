import {
  createGameSession,
  type GameSession,
  type GameSessionResume,
} from "../application/game-session";
import type { CampaignOperationFactory } from "../application/campaign-operation";
import {
  createCampaignDocument,
  mountCampaignWorkshop,
  type CampaignDefinition,
  type CampaignRepository,
  type CampaignWorkshop,
} from "../authoring/campaign-workshop";
import {
  mountGameApp,
  type GameApp,
  type GameAppOptions,
  type GameFrameScheduler,
} from "../ui/GameApp";
import type { GameAudio } from "../ui/GameAudio";
import {
  mountPlayerSettingsPanel,
  type PlayerSettingsPanel,
  type PlayerSettingsStore,
} from "./PlayerSettings";
import type { CampaignCheckpoint } from "./CampaignCheckpoint";
import {
  createWorkbenchOverlays,
  type WorkbenchOverlayName,
  type WorkbenchOverlays,
} from "./WorkbenchOverlays";
import {
  createWorkbenchManual,
  type GameAudioCredit,
  type WorkbenchManualVariant,
} from "./WorkbenchManual";

export type { PlayerSettings, PlayerSettingsStore, PlayerUiScale } from "./PlayerSettings";
export type { GameAudioCredit } from "./WorkbenchManual";

export type GameWorkbenchOptions = Readonly<{
  repository?: CampaignRepository;
  frameScheduler?: GameFrameScheduler;
  audioFactory?: () => GameAudio;
  audioCredits?: readonly GameAudioCredit[];
  seed?: string | number;
  editorEnabled?: boolean;
  fieldManualVariant?: WorkbenchManualVariant;
  settingsStore?: PlayerSettingsStore;
  checkpoint?: CampaignCheckpoint;
  operationFactory?: CampaignOperationFactory;
}>;

export type GameWorkbench = Readonly<{
  document: ReturnType<typeof createCampaignDocument>;
  session: () => GameSession;
  openTool: (name: WorkbenchOverlayName) => void;
  closeTool: (name: WorkbenchOverlayName) => void;
  restartGame: () => void;
  destroy: () => void;
}>;

export function mountGameWorkbench(
  root: HTMLElement,
  authoredCampaign: CampaignDefinition,
  options: GameWorkbenchOptions = {},
): GameWorkbench {
  const campaignDocument = createCampaignDocument(authoredCampaign, {
    repository: options.repository,
  });
  const loadResult = campaignDocument.load();
  const editorEnabled = options.editorEnabled ?? true;
  const shell = document.createElement("main");
  shell.className = "game-workbench";
  const gameRoot = document.createElement("div");
  gameRoot.className = "workbench-game";
  const tools = document.createElement("div");
  tools.className = "workbench-tools";
  const manualToggle = document.createElement("button");
  manualToggle.type = "button";
  manualToggle.className = "workbench-tool-toggle workbench-manual-toggle";
  manualToggle.dataset.action = "open-manual";
  manualToggle.setAttribute("aria-haspopup", "dialog");
  manualToggle.setAttribute("aria-controls", "field-manual");
  manualToggle.textContent = "작전 교범";
  const settingsToggle = document.createElement("button");
  settingsToggle.type = "button";
  settingsToggle.className = "workbench-tool-toggle workbench-settings-toggle";
  settingsToggle.dataset.action = "open-settings";
  settingsToggle.setAttribute("aria-haspopup", "dialog");
  settingsToggle.setAttribute("aria-controls", "player-settings");
  settingsToggle.textContent = "설정";
  const editorToggle = document.createElement("button");
  editorToggle.type = "button";
  editorToggle.className = "workbench-tool-toggle workbench-editor-toggle";
  editorToggle.dataset.action = "open-editor";
  editorToggle.textContent = "장면 편집";
  tools.append(manualToggle, settingsToggle);
  if (editorEnabled) tools.append(editorToggle);
  let requestManualClose = (): void => undefined;
  const manual = createWorkbenchManual({
    variant: options.fieldManualVariant ?? "complete-campaign",
    audioCredits: options.audioCredits,
    onRequestClose: () => requestManualClose(),
  });
  const editorRoot = document.createElement("div");
  editorRoot.className = "workbench-editor";
  editorRoot.hidden = true;
  shell.append(gameRoot, tools, manual.element, editorRoot);
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
  let activeAudio: GameAudio | null = null;
  let settingsPanel: PlayerSettingsPanel;
  let workshop: CampaignWorkshop;
  let overlays: WorkbenchOverlays;
  let destroyed = false;

  const openTool = (name: WorkbenchOverlayName): void => {
    if (!destroyed) overlays.open(name);
  };

  const closeTool = (name: WorkbenchOverlayName): void => {
    if (!destroyed) overlays.close(name);
  };

  requestManualClose = () => closeTool("manual");

  const gameOptions = (audio: GameAudio | undefined): GameAppOptions => ({
    frameScheduler: options.frameScheduler,
    audio,
    reducedMotion: () => settingsPanel.read().reducedMotion,
    onSnapshot: (snapshot) => options.checkpoint?.capture(snapshot),
    onMutedChange: (muted) => settingsPanel.setMuted(muted),
  });

  const createFreshGame = (resume?: GameSessionResume): GameApp => {
    const snapshot = structuredClone(campaignDocument.snapshot());
    const seed = `${String(options.seed ?? "production-campaign")}:restart-${generation}`;
    const session = createGameSession(snapshot, seed, resume, {
      operationFactory: options.operationFactory,
    });
    generation += 1;
    const audio = options.audioFactory?.();
    activeAudio = audio ?? null;
    settingsPanel.connectAudio(activeAudio);
    return mountGameApp(gameRoot, snapshot, session, gameOptions(audio));
  };

  const restartGame = (): void => {
    if (destroyed) return;
    options.checkpoint?.clear();
    gameApp.destroy();
    gameApp = createFreshGame();
    overlays.resetPauseOwnership();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") overlays.closeActive();
  };

  settingsPanel = mountPlayerSettingsPanel(shell, shell, {
    store: options.settingsStore,
    onRequestClose: () => closeTool("settings"),
    onChange: () => {
      if (generation > 0) gameApp.render();
    },
    onLoadFailure: () => {
      const notice = document.createElement("div");
      notice.className = "workbench-notice";
      notice.setAttribute("role", "alert");
      notice.textContent = "저장된 설정을 불러오지 못해 기본값을 사용합니다.";
      shell.append(notice);
    },
    onNewGame: () => {
      restartGame();
      closeTool("settings");
    },
  });
  const restored = options.checkpoint?.restore();
  if (restored?.recoveredFromFailure) {
    const notice = document.createElement("div");
    notice.className = "workbench-notice";
    notice.setAttribute("role", "alert");
    notice.textContent = "저장된 진행을 불러오지 못해 새 게임으로 시작했습니다.";
    shell.append(notice);
  }
  try {
    gameApp = createFreshGame(restored?.resume);
  } catch {
    options.checkpoint?.clear();
    gameApp = createFreshGame();
    const notice = document.createElement("div");
    notice.className = "workbench-notice";
    notice.setAttribute("role", "alert");
    notice.textContent = "저장된 진행이 현재 캠페인과 맞지 않아 새 게임으로 시작했습니다.";
    shell.append(notice);
  }
  workshop = mountCampaignWorkshop(editorRoot, campaignDocument, {
    onClose: () => closeTool("editor"),
    onRestart: restartGame,
  });
  overlays = createWorkbenchOverlays({
    shell,
    gameRoot,
    tools,
    adapters: {
      manual: {
        show: manual.show,
        hide: manual.hide,
        focusTrigger: () => { manualToggle.focus(); },
      },
      settings: {
        show: () => { settingsPanel.open(); },
        hide: () => { settingsPanel.close(); },
        focusTrigger: () => { settingsToggle.focus(); },
      },
      ...(editorEnabled ? {
        editor: {
          show: () => {
            editorRoot.hidden = false;
            workshop.render();
          },
          hide: () => { editorRoot.hidden = true; },
          focusTrigger: () => { editorToggle.focus(); },
        },
      } : {}),
    },
    operation: {
      read: () => gameApp.session.read(),
      pause: () => {
        gameApp.session.dispatch({ type: "pause" });
        gameApp.render();
      },
      resume: () => {
        gameApp.session.dispatch({ type: "resume" });
        gameApp.render();
      },
    },
  });
  manualToggle.addEventListener("click", () => openTool("manual"));
  settingsToggle.addEventListener("click", () => openTool("settings"));
  if (editorEnabled) editorToggle.addEventListener("click", () => openTool("editor"));
  document.addEventListener("keydown", handleKeyDown);

  if (!loadResult.ok) workshop.showDiagnostics(loadResult.diagnostics);

  return {
    document: campaignDocument,
    session: () => gameApp.session,
    openTool,
    closeTool,
    restartGame,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      gameApp.destroy();
      manual.destroy();
      settingsPanel.destroy();
      workshop.destroy();
      document.removeEventListener("keydown", handleKeyDown);
      root.replaceChildren();
    },
  };
}
