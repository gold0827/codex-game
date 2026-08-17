import type { CampaignScene, SceneKind } from "../../campaign";
import {
  type CampaignDocument,
  type CampaignDocumentDiagnostic,
} from "./CampaignDocument";

export type CampaignWorkshopOptions = Readonly<{
  onClose: () => void;
  onRestart: () => void;
  onDocumentChange?: () => void;
}>;

export type CampaignWorkshop = Readonly<{
  render: () => void;
  showDiagnostics: (diagnostics: readonly CampaignDocumentDiagnostic[]) => void;
  destroy: () => void;
}>;

type NoticeKind = "success" | "error";
type JsonField = "guidance" | "beats" | "objectives" | "transitions";

const sceneKinds = ["tutorial", "operation", "epilogue"] as const;
const sceneKindLabels: Readonly<Record<SceneKind, string>> = {
  tutorial: "훈련",
  operation: "작전",
  epilogue: "졸업",
};

const copyFields = [
  ["title", "제목"],
  ["subtitle", "부제"],
  ["briefing", "브리핑"],
  ["lesson", "교훈"],
  ["success", "성공 문구"],
  ["failure", "실패 문구"],
] as const;

const presentationFields = [
  ["mapId", "지도 ID"],
  ["backdropId", "배경 ID"],
  ["soundtrackId", "음악 ID"],
  ["accentColor", "강조 색상"],
] as const;

const encounterFields = [
  ["durationMs", "작전 시간(ms)"],
] as const;

const tuningFields = [
  ["startingResources", "시작 자원"],
  ["interventionBudget", "개입 예산"],
  ["simulationSpeed", "시뮬레이션 속도"],
] as const;

const jsonFields = [
  ["guidance", "안내 단계"],
  ["beats", "진행 비트"],
  ["objectives", "목표"],
  ["transitions", "전환"],
] as const satisfies readonly (readonly [JsonField, string])[];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function actionButton(label: string, action: string): HTMLButtonElement {
  const result = element("button", "editor-button", label);
  result.type = "button";
  result.dataset.action = action;
  return result;
}

function diagnosticCategory(diagnostic: CampaignDocumentDiagnostic): string {
  if (diagnostic.kind === "json") return "JSON 형식 오류";
  if (diagnostic.kind === "shape") return "필드 형식 오류";
  if (diagnostic.kind === "validation") return "캠페인 연결 오류";
  if (diagnostic.kind === "storage") return "저장소 오류";
  return "장면 오류";
}

export function mountCampaignWorkshop(
  root: HTMLElement,
  campaignDocument: CampaignDocument,
  options: CampaignWorkshopOptions,
): CampaignWorkshop {
  let selectedSceneId = campaignDocument.listScenes()[0]?.identity.id ?? "";
  let notice: Readonly<{ kind: NoticeKind; lines: readonly string[] }> | null = null;
  let exchangeSource = "";
  let destroyed = false;

  const setNotice = (
    kind: NoticeKind,
    lines: readonly string[],
    rerender = true,
  ): void => {
    notice = { kind, lines };
    if (rerender) render();
  };

  const showDiagnostics = (
    diagnostics: readonly CampaignDocumentDiagnostic[],
  ): void => {
    setNotice(
      "error",
      diagnostics.map(
        (diagnostic) => `${diagnostic.path}: ${diagnosticCategory(diagnostic)}`,
      ),
    );
  };

  const field = (
    labelText: string,
    path: string,
    value: string | number,
    type: "text" | "number" = "text",
  ): HTMLLabelElement => {
    const label = element("label", "editor-field");
    const title = element("span", "editor-field-label", labelText);
    const input = element("input");
    input.type = type;
    input.dataset.field = path;
    input.value = String(value);
    if (type === "number") input.step = "any";
    label.append(title, input);
    return label;
  };

  const section = (title: string): HTMLElement => {
    const result = element("fieldset", "editor-section");
    result.append(element("legend", undefined, title));
    return result;
  };

  const inputValue = (path: string): string => {
    const input = root.querySelector<HTMLInputElement>(`[data-field="${path}"]`);
    if (!input) throw new Error(`Missing editor input: ${path}`);
    return input.value;
  };

  const numberValue = (
    path: string,
    diagnostics: string[],
  ): number | undefined => {
    const source = inputValue(path).trim();
    const value = source === "" ? Number.NaN : Number(source);
    if (!Number.isFinite(value)) {
      diagnostics.push(`${path}: 숫자 오류`);
      return undefined;
    }
    return value;
  };

  const jsonValue = (
    path: JsonField,
    diagnostics: string[],
  ): unknown[] | undefined => {
    try {
      const value = JSON.parse(inputValue(path)) as unknown;
      if (!Array.isArray(value)) {
        diagnostics.push(`${path}: 배열 형식 오류`);
        return undefined;
      }
      return value;
    } catch {
      diagnostics.push(`${path}: JSON 형식 오류`);
      return undefined;
    }
  };

  const readReplacement = (scene: CampaignScene): CampaignScene | undefined => {
    const diagnostics: string[] = [];
    const kind = inputValue("identity.kind");
    if (!sceneKinds.includes(kind as SceneKind)) {
      diagnostics.push("identity.kind: 필드 형식 오류");
    }

    const durationMs = numberValue("encounterParameters.durationMs", diagnostics);
    const startingResources = numberValue("gameplayTuning.startingResources", diagnostics);
    const interventionBudget = numberValue("gameplayTuning.interventionBudget", diagnostics);
    const simulationSpeed = numberValue("gameplayTuning.simulationSpeed", diagnostics);
    const guidance = jsonValue("guidance", diagnostics);
    const beats = jsonValue("beats", diagnostics);
    const objectives = jsonValue("objectives", diagnostics);
    const transitions = jsonValue("transitions", diagnostics);

    if (diagnostics.length > 0) {
      setNotice("error", diagnostics);
      return undefined;
    }

    return {
      identity: { id: scene.identity.id, kind: kind as SceneKind },
      copy: {
        title: inputValue("copy.title"),
        subtitle: inputValue("copy.subtitle"),
        briefing: inputValue("copy.briefing"),
        lesson: inputValue("copy.lesson"),
        success: inputValue("copy.success"),
        failure: inputValue("copy.failure"),
      },
      presentation: {
        mapId: inputValue("presentation.mapId"),
        backdropId: inputValue("presentation.backdropId"),
        soundtrackId: inputValue("presentation.soundtrackId"),
        accentColor: inputValue("presentation.accentColor"),
      },
      mapTopology: scene.mapTopology,
      guidance: guidance as CampaignScene["guidance"],
      beats: beats as CampaignScene["beats"],
      objectives: objectives as CampaignScene["objectives"],
      transitions: transitions as CampaignScene["transitions"],
      encounterParameters: {
        durationMs: durationMs!,
      },
      gameplayTuning: {
        startingResources: startingResources!,
        interventionBudget: interventionBudget!,
        simulationSpeed: simulationSpeed!,
      },
    };
  };

  const applyScene = (): void => {
    const scene = campaignDocument.scene(selectedSceneId);
    if (!scene) {
      setNotice("error", [`scenes: 장면 오류`]);
      return;
    }
    const replacement = readReplacement(scene);
    if (!replacement) return;
    const result = campaignDocument.replaceScene(selectedSceneId, replacement);
    if (!result.ok) {
      showDiagnostics(result.diagnostics);
      return;
    }
    options.onDocumentChange?.();
    setNotice("success", ["장면 변경을 적용했습니다."]);
  };

  const save = (): void => {
    const result = campaignDocument.save();
    if (!result.ok) {
      showDiagnostics(result.diagnostics);
      return;
    }
    setNotice("success", ["로컬 저장을 완료했습니다."]);
  };

  const exportCampaign = (): void => {
    exchangeSource = campaignDocument.exportJson();
    setNotice("success", ["현재 캠페인을 JSON으로 내보냈습니다."]);
  };

  const importCampaign = (): void => {
    const exchange = root.querySelector<HTMLTextAreaElement>("[data-field='campaign-json']");
    exchangeSource = exchange?.value ?? "";
    const result = campaignDocument.importJson(exchangeSource);
    if (!result.ok) {
      showDiagnostics(result.diagnostics);
      return;
    }
    selectedSceneId = campaignDocument.listScenes()[0]?.identity.id ?? "";
    options.onDocumentChange?.();
    setNotice("success", ["JSON 캠페인을 불러왔습니다."]);
  };

  const restore = (): void => {
    const result = campaignDocument.restore();
    if (!result.ok) {
      showDiagnostics(result.diagnostics);
      return;
    }
    selectedSceneId = campaignDocument.listScenes()[0]?.identity.id ?? "";
    options.onDocumentChange?.();
    options.onRestart();
    setNotice("success", ["원본 캠페인으로 복원했습니다."]);
  };

  const renderForm = (scene: CampaignScene): HTMLElement => {
    const form = element("form", "campaign-editor-form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      applyScene();
    });

    const identity = section("장면 식별");
    const id = field("장면 ID", "identity.id", scene.identity.id);
    id.querySelector("input")!.readOnly = true;
    const kindLabel = element("label", "editor-field");
    kindLabel.append(element("span", "editor-field-label", "장면 종류"));
    const kind = element("select");
    kind.dataset.field = "identity.kind";
    sceneKinds.forEach((value) => {
      const option = element("option", undefined, sceneKindLabels[value]);
      option.value = value;
      option.selected = value === scene.identity.kind;
      kind.append(option);
    });
    kindLabel.append(kind);
    identity.append(id, kindLabel);

    const copy = section("문구");
    copyFields.forEach(([key, label]) => copy.append(field(label, `copy.${key}`, scene.copy[key])));

    const presentation = section("표현");
    presentationFields.forEach(([key, label]) =>
      presentation.append(field(label, `presentation.${key}`, scene.presentation[key])),
    );

    const encounter = section("전투 수치");
    encounterFields.forEach(([key, label]) =>
      encounter.append(field(label, `encounterParameters.${key}`, scene.encounterParameters[key], "number")),
    );
    tuningFields.forEach(([key, label]) =>
      encounter.append(field(label, `gameplayTuning.${key}`, scene.gameplayTuning[key], "number")),
    );

    const nested = section("중첩 배열 · JSON");
    nested.classList.add("editor-section-wide");
    jsonFields.forEach(([key, labelText]) => {
      const label = element("label", "editor-json-field");
      label.append(element("span", "editor-field-label", labelText));
      const textarea = element("textarea");
      textarea.dataset.field = key;
      textarea.spellcheck = false;
      textarea.value = JSON.stringify(scene[key], null, 2);
      label.append(textarea);
      nested.append(label);
    });

    const submit = actionButton("장면 변경 적용", "apply-scene");
    submit.type = "submit";
    submit.classList.add("editor-button-primary");
    form.append(identity, copy, presentation, encounter, nested, submit);
    return form;
  };

  function render(): void {
    if (destroyed) return;
    const scenes = campaignDocument.listScenes();
    if (!scenes.some((scene) => scene.identity.id === selectedSceneId)) {
      selectedSceneId = scenes[0]?.identity.id ?? "";
    }
    const scene = campaignDocument.scene(selectedSceneId);
    const shell = element("section", "campaign-editor");
    shell.setAttribute("aria-label", "캠페인 편집기");

    const header = element("header", "campaign-editor-header");
    const heading = element("div");
    heading.append(
      element("p", "editor-eyebrow", "캠페인 편집 도구"),
      element("h1", undefined, "전체 장면 편집기"),
    );
    const close = actionButton("편집기 닫기", "close-editor");
    close.addEventListener("click", options.onClose);
    header.append(heading, close);

    const toolbar = element("div", "campaign-editor-toolbar");
    const selectorLabel = element("label", "editor-scene-selector");
    selectorLabel.append(element("span", undefined, "장면"));
    const selector = element("select");
    selector.dataset.action = "select-scene";
    scenes.forEach((candidate) => {
      const option = element("option", undefined, candidate.copy.title);
      option.value = candidate.identity.id;
      option.selected = candidate.identity.id === selectedSceneId;
      selector.append(option);
    });
    selector.addEventListener("change", () => {
      selectedSceneId = selector.value;
      notice = null;
      render();
    });
    selectorLabel.append(selector);
    const saveButton = actionButton("로컬 저장", "save-campaign");
    saveButton.addEventListener("click", save);
    const restartButton = actionButton("게임 다시 시작", "restart-game");
    restartButton.addEventListener("click", options.onRestart);
    const restoreButton = actionButton("원본 복원", "restore-campaign");
    restoreButton.addEventListener("click", restore);
    toolbar.append(selectorLabel, saveButton, restartButton, restoreButton);

    const content = element("div", "campaign-editor-content");
    if (notice) {
      const status = element("div", `editor-notice editor-notice-${notice.kind}`);
      status.setAttribute("role", notice.kind === "error" ? "alert" : "status");
      notice.lines.forEach((line) => status.append(element("p", undefined, line)));
      content.append(status);
    }
    if (scene) content.append(renderForm(scene));

    const exchange = section("캠페인 JSON 교환");
    exchange.classList.add("campaign-exchange");
    const exchangeText = element("textarea");
    exchangeText.dataset.field = "campaign-json";
    exchangeText.spellcheck = false;
    exchangeText.placeholder = "내보낸 JSON이 여기에 표시됩니다. 가져올 JSON을 붙여 넣을 수도 있습니다.";
    exchangeText.value = exchangeSource;
    exchangeText.addEventListener("input", () => {
      exchangeSource = exchangeText.value;
    });
    const exchangeActions = element("div", "editor-exchange-actions");
    const exportButton = actionButton("JSON 내보내기", "export-campaign");
    exportButton.addEventListener("click", exportCampaign);
    const importButton = actionButton("JSON 가져오기", "import-campaign");
    importButton.addEventListener("click", importCampaign);
    exchangeActions.append(exportButton, importButton);
    exchange.append(exchangeText, exchangeActions);
    content.append(exchange);

    shell.append(header, toolbar, content);
    root.replaceChildren(shell);
  }

  render();

  return {
    render,
    showDiagnostics,
    destroy: () => {
      destroyed = true;
      root.replaceChildren();
    },
  };
}
