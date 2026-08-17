import {
  bridgeDefenseCampaign,
  bridgeDefenseMapSkin,
} from "../../src/scenarios/bridgeDefenseOperation";
import { createFixtureAction, nextFrame } from "./chrome-fixture-helpers";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Chrome fixture root is missing.");

const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  errors.push(values.map(String).join(" "));
  originalConsoleError(...values);
};

const settingsKey = `player-settings:${bridgeDefenseCampaign.id}:v1`;
const progressKey = `campaign-progress:${bridgeDefenseCampaign.id}:v1`;
localStorage.removeItem(settingsKey);
localStorage.removeItem(progressKey);
localStorage.removeItem(`campaign-document:${bridgeDefenseCampaign.id}`);

async function waitFor(condition: () => boolean, maxFrames = 180): Promise<boolean> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (condition()) return true;
    await nextFrame();
  }
  return condition();
}

async function waitForDuration(
  condition: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (condition()) return true;
    await nextFrame();
  }
  return condition();
}

const action = createFixtureAction(root);

const selectedTile = (canvas: HTMLCanvasElement): Readonly<{ x: number; y: number }> | null => {
  const [x, y] = (canvas.dataset.selectedTile ?? "").split(",").map(Number);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
};

function moveSelectionTo(
  canvas: HTMLCanvasElement,
  target: Readonly<{ x: number; y: number }>,
): boolean {
  canvas.focus();
  for (let move = 0; move < 64; move += 1) {
    const selected = selectedTile(canvas);
    if (selected?.x === target.x && selected.y === target.y) return true;
    const key = selected === null || selected.x < target.x
      ? "ArrowRight"
      : selected.x > target.x
        ? "ArrowLeft"
        : selected.y < target.y
          ? "ArrowDown"
          : "ArrowUp";
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }
  const selected = selectedTile(canvas);
  return selected?.x === target.x && selected.y === target.y;
}

function overlaps(left: DOMRect, right: DOMRect): boolean {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

const mapPreview = new URLSearchParams(window.location.search).has("map-preview");
await import("../../src/main");
const bridgeBriefing = root.textContent?.includes(
  bridgeDefenseCampaign.scenes[0].copy.briefing,
) ?? false;

action("start-attempt").click();
action("pause").click();
const inspectGuidanceText = root.querySelector<HTMLElement>(".tutorial-guidance")?.textContent ?? "";
root.querySelector<HTMLElement>('[data-officer-id="captain-han"]')
  ?.querySelector<HTMLButtonElement>('[data-action="inspect-officer"]')
  ?.click();

const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
const battlefield = root.querySelector<HTMLElement>("[data-region='battlefield']");
const grid = root.querySelector<HTMLElement>(".operation-grid");
const controls = root.querySelector<HTMLElement>("[data-region='spatial-signal']");
const tutorialGuidance = root.querySelector<HTMLElement>(".tutorial-guidance");
if (!canvas || !battlefield || !grid || !controls || !tutorialGuidance) {
  throw new Error("Production operation UI did not mount.");
}

const targetBeforeSignal = {
  tutorialAction: root.querySelector<HTMLElement>(".tutorial-guidance")?.dataset.tutorialAction,
  guidanceTile: canvas.dataset.guidanceTile,
  controlsGuided: controls.classList.contains("guidance-target"),
  kind: controls.querySelector<HTMLSelectElement>("[data-signal-kind]")?.value,
  strength: controls.querySelector<HTMLSelectElement>("[data-signal-strength]")?.value,
};
const assetsReady = await waitFor(() =>
  canvas.dataset.spriteAssets === "ready" &&
  canvas.dataset.mapAssets === "ready" &&
  canvas.dataset.spriteImage === "ready" &&
  canvas.dataset.mapImage === "ready"
);
type RuntimeMapPlacement = Readonly<{
  id: string;
  kind: string;
  position: Readonly<{ x: number; y: number }>;
}>;
type RuntimeMapManifest = Readonly<{
  skins?: Readonly<Record<string, Readonly<{
    tiles?: readonly RuntimeMapPlacement[];
    props?: readonly RuntimeMapPlacement[];
  }>>>;
}>;
const mapManifestResponse = await fetch(new URL(
  "assets/visual/maps/battlefield/manifest.json",
  document.baseURI,
));
const mapManifest = await mapManifestResponse.json() as RuntimeMapManifest;
const runtimeMapSkin = mapManifest.skins?.[bridgeDefenseMapSkin.id];
const runtimeProps = runtimeMapSkin?.props ?? [];
const runtimeTiles = runtimeMapSkin?.tiles ?? [];
const runtimeMap = {
  responseOk: mapManifestResponse.ok,
  propCount: runtimeProps.length,
  obstacleKinds: [...new Set(runtimeProps
    .filter(({ kind }) => ["tree", "rock", "barricade"].includes(kind))
    .map(({ kind }) => kind))].sort(),
  landmarkIds: runtimeProps
    .filter(({ id }) => [
      "west-command-post",
      "east-civilian-shelter",
      "bridge-river-rock",
      "east-bank-tree-center",
      "east-bank-barricade-center",
    ].includes(id))
    .map(({ id }) => id)
    .sort(),
  crossingIds: runtimeTiles
    .filter(({ id }) => ["north-ford", "haein-bridge", "south-farm-track"].includes(id))
    .map(({ id }) => id)
    .sort(),
};
const gridWidth = grid.getBoundingClientRect().width;
const battlefieldWidth = battlefield.getBoundingClientRect().width;
const operationLayout = {
  viewport: [innerWidth, innerHeight],
  centralShare: gridWidth === 0 ? 0 : battlefieldWidth / gridWidth,
  overflowX: document.documentElement.scrollWidth > innerWidth,
  overflowY: document.documentElement.scrollHeight > innerHeight,
  controlsOverlapBattlefield: overlaps(
    controls.getBoundingClientRect(),
    battlefield.getBoundingClientRect(),
  ),
  guidanceOverlapBattlefield: overlaps(
    tutorialGuidance.getBoundingClientRect(),
    battlefield.getBoundingClientRect(),
  ),
  guidanceOverlapControls: overlaps(
    tutorialGuidance.getBoundingClientRect(),
    controls.getBoundingClientRect(),
  ),
};
const authoredBeat = bridgeDefenseCampaign.scenes[0].beats[0];
const authoredReport = authoredBeat?.reports[0];
const beatEvent = root.querySelector<HTMLElement>(".event-beat-activated");
const reportCard = authoredReport
  ? root.querySelector<HTMLElement>(`[data-report-id="${authoredReport.id}"]`)
  : null;
const authoredOperationCopy = {
  inspectTargetReadable: inspectGuidanceText.includes("대위 한확인") &&
    !inspectGuidanceText.includes("captain-han"),
  beatHeadline: Boolean(authoredBeat && beatEvent?.textContent?.includes(authoredBeat.headline)),
  beatDescription: Boolean(authoredBeat && beatEvent?.textContent?.includes(authoredBeat.description)),
  reportTone: reportCard?.querySelector(".report-tone")?.textContent ?? null,
  internalIdsHidden: Boolean(
    authoredBeat && authoredReport &&
    !beatEvent?.textContent?.includes(authoredBeat.id) &&
    !reportCard?.textContent?.includes(authoredReport.id),
  ),
  eventTextWrapped: [...root.querySelectorAll<HTMLElement>(".event-flow-item")]
    .every((item) => item.scrollWidth <= item.clientWidth),
};
const selectedBridge = moveSelectionTo(canvas, { x: 11, y: 7 });
action("issue-spatial-signal").click();
const feedback = root.querySelector<HTMLElement>(".intervention-feedback");
const interventionFeedback = {
  visible: feedback !== null,
  actionReadable: feedback?.textContent?.includes(
    "조작 · 방어 공간 신호 · 강도 2 · 타일 11, 7",
  ) ?? false,
  costsReadable: feedback?.textContent?.includes(
    "자율성 비용 15 · 군수 비용 2 · 누적 개입 1회",
  ) ?? false,
  internalIdsHidden: !(feedback?.textContent ?? "").match(
    /issue-spatial-signal|captain-han|bridge-runner-route-report/,
  ),
  overlapsBattlefield: feedback
    ? overlaps(feedback.getBoundingClientRect(), battlefield.getBoundingClientRect())
    : true,
  overflowsTray: feedback
    ? feedback.scrollWidth > feedback.clientWidth || feedback.scrollHeight > feedback.clientHeight
    : true,
};
action("resume").click();
await nextFrame();
const tutorialCompleted = root.querySelector(".tutorial-guidance") === null;

let completedFlow = {
  debriefStatus: null as string | null,
  debriefCopyVisible: false,
  epilogueReached: false,
  resetToBridge: false,
  playerManual: false,
};
const threatMarkers = {
  drawn: false,
  physical: false,
  informational: false,
  resolved: false,
  accessible: false,
};
const observeThreatMarkers = (): void => {
  const categories = (canvas.dataset.threatMarkerCategories ?? "").split(",");
  const description = canvas.getAttribute("aria-label") ?? "";
  threatMarkers.drawn ||= Number(canvas.dataset.drawnThreatMarkerCount ?? 0) > 0;
  threatMarkers.physical ||= categories.includes("physical");
  threatMarkers.informational ||= categories.includes("informational");
  threatMarkers.resolved ||= description.includes("차단됨") || description.includes("목표 피해");
  threatMarkers.accessible ||= description.includes("물리적 위협 포격") &&
    description.includes("정보 위협 허위 정보");
};
if (!mapPreview) {
  action("speed-2").click();
  const debriefReached = await waitForDuration(
    () => {
      observeThreatMarkers();
      return root.querySelector("[data-phase='debrief']") !== null;
    },
    90_000,
  );
  completedFlow = {
    ...completedFlow,
    debriefStatus: debriefReached && root.querySelector(".debrief-success")
      ? "success"
      : debriefReached
        ? "retry"
        : null,
    debriefCopyVisible: root.textContent?.includes(
      bridgeDefenseCampaign.scenes[0].copy.success,
    ) ?? false,
  };
  if (completedFlow.debriefStatus === "success") {
    action("choose-lesson").click();
    completedFlow.epilogueReached = root.querySelector("[data-phase='epilogue']") !== null &&
      (root.textContent?.includes(bridgeDefenseCampaign.scenes[1].copy.title) ?? false);
    action("reset-campaign").click();
    completedFlow.resetToBridge = root.querySelector("[data-phase='briefing']") !== null &&
      (root.textContent?.includes(bridgeDefenseCampaign.scenes[0].copy.briefing) ?? false);
    action("open-manual").click();
    const manualCopy = root.querySelector<HTMLElement>(".workbench-manual")?.textContent ?? "";
    completedFlow.playerManual = manualCopy.includes("해인교") &&
      manualCopy.includes("공간 신호") &&
      !manualCopy.includes("여섯 작전") &&
      !manualCopy.includes("장면 편집");
  }
}

const result = {
  mapPreview,
  productionEntrypoint: true,
  bridgeBriefing,
  editorHidden: root.querySelector('[data-action="open-editor"]') === null,
  mapId: battlefield.dataset.mapId ?? null,
  canvasWidth: canvas.width,
  canvasHeight: canvas.height,
  mapTileCount: Number(canvas.dataset.mapTileCount ?? 0),
  mapPropCount: Number(canvas.dataset.mapPropCount ?? 0),
  assetStatus: {
    spriteManifest: canvas.dataset.spriteAssets ?? null,
    mapManifest: canvas.dataset.mapAssets ?? null,
    spriteImage: canvas.dataset.spriteImage ?? null,
    mapImage: canvas.dataset.mapImage ?? null,
  },
  assetsReady,
  runtimeMap,
  targetBeforeSignal,
  selectedBridge,
  tutorialCompleted,
  operationLayout: {
    ...operationLayout,
    centralShare: Math.round(operationLayout.centralShare * 1_000) / 1_000,
  },
  threatMarkers,
  authoredOperationCopy,
  interventionFeedback,
  completedFlow,
  errors,
};
const passed = result.productionEntrypoint &&
  result.bridgeBriefing &&
  result.editorHidden &&
  result.mapId === bridgeDefenseMapSkin.id &&
  result.canvasWidth > 0 &&
  result.canvasHeight > 0 &&
  result.mapTileCount > 24 * 16 &&
  result.mapPropCount === 12 &&
  result.assetsReady &&
  result.runtimeMap.responseOk &&
  result.runtimeMap.propCount === 12 &&
  JSON.stringify(result.runtimeMap.obstacleKinds) ===
    JSON.stringify(["barricade", "rock", "tree"]) &&
  JSON.stringify(result.runtimeMap.landmarkIds) === JSON.stringify([
    "bridge-river-rock",
    "east-bank-barricade-center",
    "east-bank-tree-center",
    "east-civilian-shelter",
    "west-command-post",
  ]) &&
  JSON.stringify(result.runtimeMap.crossingIds) === JSON.stringify([
    "haein-bridge",
    "north-ford",
    "south-farm-track",
  ]) &&
  result.targetBeforeSignal.tutorialAction === "signal" &&
  result.targetBeforeSignal.guidanceTile === "11,7" &&
  result.targetBeforeSignal.controlsGuided &&
  result.targetBeforeSignal.kind === "defend" &&
  result.targetBeforeSignal.strength === "2" &&
  result.selectedBridge &&
  result.tutorialCompleted &&
  result.operationLayout.viewport[0] === 1440 &&
  result.operationLayout.viewport[1] === 900 &&
  result.operationLayout.centralShare >= 0.45 &&
  !result.operationLayout.overflowX &&
  !result.operationLayout.overflowY &&
  !result.operationLayout.controlsOverlapBattlefield &&
  !result.operationLayout.guidanceOverlapBattlefield &&
  !result.operationLayout.guidanceOverlapControls &&
  (mapPreview || (
    result.threatMarkers.drawn &&
    result.threatMarkers.physical &&
    result.threatMarkers.informational &&
    result.threatMarkers.resolved &&
    result.threatMarkers.accessible
  )) &&
  result.authoredOperationCopy.inspectTargetReadable &&
  result.authoredOperationCopy.beatHeadline &&
  result.authoredOperationCopy.beatDescription &&
  result.authoredOperationCopy.reportTone === "어조 · 확신" &&
  result.authoredOperationCopy.internalIdsHidden &&
  result.authoredOperationCopy.eventTextWrapped &&
  result.interventionFeedback.visible &&
  result.interventionFeedback.actionReadable &&
  result.interventionFeedback.costsReadable &&
  result.interventionFeedback.internalIdsHidden &&
  !result.interventionFeedback.overlapsBattlefield &&
  !result.interventionFeedback.overflowsTray &&
  errors.length === 0 &&
  (mapPreview || (
    result.completedFlow.debriefStatus === "success" &&
    result.completedFlow.debriefCopyVisible &&
    result.completedFlow.epilogueReached &&
    result.completedFlow.resetToBridge &&
    result.completedFlow.playerManual
  ));

const output = document.createElement("pre");
output.id = "fixture-result";
output.textContent = JSON.stringify({ passed, ...result });
document.body.append(output);
document.body.dataset.fixtureStatus = passed ? "passed" : "failed";

if (!passed) originalConsoleError("Bridge defense Chrome fixture failed", result);
