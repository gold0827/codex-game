import { createGameSession, type GameSession } from "../application/game-session";
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

export type GameAudioCredit = Readonly<{
  title: string;
  author: string;
  sourcePageUrl: string;
  license: string;
  licenseUrl: string;
}>;

export type GameWorkbenchOptions = Readonly<{
  repository?: CampaignRepository;
  frameScheduler?: GameFrameScheduler;
  audioFactory?: () => GameAudio;
  audioCredits?: readonly GameAudioCredit[];
  seed?: string | number;
}>;

export type GameWorkbench = Readonly<{
  document: ReturnType<typeof createCampaignDocument>;
  session: () => GameSession;
  openManual: () => void;
  closeManual: () => void;
  openEditor: () => void;
  closeEditor: () => void;
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
  const editorToggle = document.createElement("button");
  editorToggle.type = "button";
  editorToggle.className = "workbench-tool-toggle workbench-editor-toggle";
  editorToggle.dataset.action = "open-editor";
  editorToggle.textContent = "장면 편집";
  tools.append(manualToggle, editorToggle);
  const manualRoot = document.createElement("div");
  manualRoot.id = "field-manual";
  manualRoot.className = "workbench-manual";
  manualRoot.hidden = true;
  manualRoot.setAttribute("role", "dialog");
  manualRoot.setAttribute("aria-modal", "true");
  manualRoot.setAttribute("aria-labelledby", "field-manual-title");
  manualRoot.innerHTML = `
    <article class="field-manual">
      <header class="field-manual-header">
        <div>
          <p class="field-manual-eyebrow">FIELD OPERATIONS / 01</p>
          <h1 id="field-manual-title">작전 교범</h1>
        </div>
        <button type="button" class="editor-button" data-action="close-manual">교범 닫기</button>
      </header>
      <div class="field-manual-content">
        <p class="field-manual-lead">명령을 반복하는 대신 자율 장교가 판단할 조건을 설계한다.</p>
        <section>
          <h2>1. 브리핑에서 지휘 조건 설정</h2>
          <p>정보 도달, 권한 명료성, 검증 깊이, 피드백 압축을 조정한다. 배정 자원 안에서 설정을 마치고 작전을 시작한다.</p>
        </section>
        <section>
          <h2>2. 자율 작전 관찰</h2>
          <p>장교들은 설정된 조건에 따라 스스로 이동하고 보고한다. 전장, 장교의 의도, 위험 신호, 수신 보고를 함께 살핀다.</p>
        </section>
        <section>
          <h2>3. 시간 통제</h2>
          <p>일시정지로 판단할 시간을 확보하고 0.5배속, 1배속, 2배속으로 흐름을 조절한다. 교범을 열면 진행 중인 작전도 멈춘다.</p>
        </section>
        <section>
          <h2>4. 제한된 직접 개입</h2>
          <p>보고 전달, 권한 승인, 검증 우선은 직접 개입 횟수를 사용한다. 남은 횟수를 확인하고 자율성을 보완할 때만 개입한다.</p>
        </section>
        <section>
          <h2>5. 여섯 작전과 졸업</h2>
          <p>통신학교 튜토리얼부터 최종작전까지 여섯 작전을 순서대로 완료한다. 실패하면 같은 작전을 재정비하고, 모두 통과하면 졸업 장면에 도착한다.</p>
        </section>
        <section>
          <h2>별도 도구 · 장면 편집</h2>
          <p>게임 밖의 장면 편집에서 모든 장면의 문구, 연출, 수치와 사건 데이터를 확인하고 바꿀 수 있다. 변경 사항은 캠페인을 재시작할 때 적용된다.</p>
        </section>
      </div>
    </article>
  `;
  if (options.audioCredits && options.audioCredits.length > 0) {
    const creditSection = document.createElement("section");
    creditSection.className = "audio-credits";
    const creditHeading = document.createElement("h2");
    creditHeading.textContent = "배경음악 출처";
    const creditSummary = document.createElement("p");
    creditSummary.textContent = "아래 음원은 원작자가 CC0 1.0으로 공개했습니다.";
    const creditList = document.createElement("ul");
    creditList.className = "audio-credit-list";
    options.audioCredits.forEach((credit) => {
      const item = document.createElement("li");
      const source = document.createElement("a");
      source.href = credit.sourcePageUrl;
      source.target = "_blank";
      source.rel = "noreferrer";
      source.textContent = `${credit.title} — ${credit.author}`;
      const licenseLink = document.createElement("a");
      licenseLink.href = credit.licenseUrl;
      licenseLink.target = "_blank";
      licenseLink.rel = "noreferrer";
      licenseLink.textContent = credit.license;
      item.append(source, document.createTextNode(" · "), licenseLink);
      creditList.append(item);
    });
    creditSection.append(creditHeading, creditSummary, creditList);
    manualRoot.querySelector(".field-manual-content")?.append(creditSection);
  }
  const editorRoot = document.createElement("div");
  editorRoot.className = "workbench-editor";
  editorRoot.hidden = true;
  shell.append(gameRoot, tools, manualRoot, editorRoot);
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
  let workshop: CampaignWorkshop;
  let manualOpen = false;
  let pausedForManual = false;
  let editorOpen = false;
  let pausedForEditor = false;
  let destroyed = false;

  const gameOptions = (): GameAppOptions => ({
    frameScheduler: options.frameScheduler,
    audio: options.audioFactory?.(),
  });

  const createFreshGame = (): GameApp => {
    const snapshot = structuredClone(campaignDocument.snapshot());
    const seed = `${String(options.seed ?? "production-campaign")}:restart-${generation}`;
    generation += 1;
    const session = createGameSession(snapshot, seed);
    return mountGameApp(gameRoot, snapshot, session, gameOptions());
  };

  const restartGame = (): void => {
    if (destroyed) return;
    gameApp.destroy();
    gameApp = createFreshGame();
    pausedForManual = false;
    pausedForEditor = false;
  };

  const closeEditor = (): void => {
    if (!editorOpen || destroyed) return;
    editorOpen = false;
    editorRoot.hidden = true;
    shell.classList.remove("editor-open");
    tools.hidden = false;
    if (pausedForEditor && gameApp.session.read().phase === "operation") {
      gameApp.session.dispatch({ type: "resume" });
      gameApp.render();
    }
    pausedForEditor = false;
  };

  const closeManual = (): void => {
    if (!manualOpen || destroyed) return;
    manualOpen = false;
    manualRoot.hidden = true;
    shell.classList.remove("manual-open");
    tools.hidden = false;
    if (pausedForManual && gameApp.session.read().phase === "operation") {
      gameApp.session.dispatch({ type: "resume" });
      gameApp.render();
    }
    pausedForManual = false;
  };

  const openEditor = (): void => {
    if (editorOpen || destroyed) return;
    if (manualOpen) closeManual();
    const snapshot = gameApp.session.read();
    if (snapshot.phase === "operation" && !snapshot.paused) {
      gameApp.session.dispatch({ type: "pause" });
      gameApp.render();
      pausedForEditor = true;
    }
    editorOpen = true;
    editorRoot.hidden = false;
    shell.classList.add("editor-open");
    tools.hidden = true;
    workshop.render();
  };

  const openManual = (): void => {
    if (manualOpen || destroyed) return;
    if (editorOpen) closeEditor();
    const snapshot = gameApp.session.read();
    if (snapshot.phase === "operation" && !snapshot.paused) {
      gameApp.session.dispatch({ type: "pause" });
      gameApp.render();
      pausedForManual = true;
    }
    manualOpen = true;
    manualRoot.hidden = false;
    shell.classList.add("manual-open");
    tools.hidden = true;
    const manualContent = manualRoot.querySelector<HTMLElement>(".field-manual-content");
    if (manualContent) manualContent.scrollTop = 0;
    manualRoot.querySelector<HTMLButtonElement>('[data-action="close-manual"]')?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (manualOpen) closeManual();
      else if (editorOpen) closeEditor();
    }
  };

  gameApp = createFreshGame();
  workshop = mountCampaignWorkshop(editorRoot, campaignDocument, {
    onClose: closeEditor,
    onRestart: restartGame,
  });
  manualToggle.addEventListener("click", openManual);
  editorToggle.addEventListener("click", openEditor);
  manualRoot
    .querySelector<HTMLButtonElement>('[data-action="close-manual"]')
    ?.addEventListener("click", closeManual);
  document.addEventListener("keydown", handleKeyDown);

  if (!loadResult.ok) workshop.showDiagnostics(loadResult.diagnostics);

  return {
    document: campaignDocument,
    session: () => gameApp.session,
    openManual,
    closeManual,
    openEditor,
    closeEditor,
    restartGame,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      gameApp.destroy();
      workshop.destroy();
      document.removeEventListener("keydown", handleKeyDown);
      root.replaceChildren();
    },
  };
}
