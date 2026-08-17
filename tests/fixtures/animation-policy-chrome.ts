import { createFixtureAction, nextFrame } from "./chrome-fixture-helpers";

declare global {
  var __animationPolicyFixtureResult: unknown;
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Animation policy fixture root is missing.");
const action = createFixtureAction(root);

async function frames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await nextFrame();
}

action("start-attempt").click();
await frames(4);
const canvas = root.querySelector<HTMLCanvasElement>("canvas.battlefield-canvas");
if (!canvas) throw new Error("Animation policy fixture Canvas is missing.");

const normalStartCount = Number(canvas.dataset.drawCount ?? 0);
const normalStartTime = Number(canvas.dataset.sampledOperationTimeMs ?? 0);
const normalFrames = new Set<string>();
for (let index = 0; index < 36; index += 1) {
  normalFrames.add(canvas.dataset.spriteFrameIndices ?? "");
  await nextFrame();
}
const normalDraws = Number(canvas.dataset.drawCount ?? 0) - normalStartCount;
const normalTimeAdvance = Number(canvas.dataset.sampledOperationTimeMs ?? 0) - normalStartTime;

action("pause").click();
await frames(3);
const pausedCount = Number(canvas.dataset.drawCount ?? 0);
const pausedTime = canvas.dataset.sampledOperationTimeMs;
const pausedSpriteFrames = canvas.dataset.spriteFrameIndices;
await frames(12);
const pausedStable = Number(canvas.dataset.drawCount ?? 0) === pausedCount
  && canvas.dataset.sampledOperationTimeMs === pausedTime
  && canvas.dataset.spriteFrameIndices === pausedSpriteFrames
  && canvas.dataset.animationActive === "false";

action("resume").click();
await frames(1);
const resumedFirstTime = Number(canvas.dataset.sampledOperationTimeMs ?? 0);
const resumeSkipMs = resumedFirstTime - Number(pausedTime ?? 0);
const resumedCount = Number(canvas.dataset.drawCount ?? 0);
await frames(12);
const resumedDraws = Number(canvas.dataset.drawCount ?? 0) - resumedCount;

action("open-settings").click();
const reducedMotion = root.querySelector<HTMLInputElement>('[data-setting="reducedMotion"]');
if (!reducedMotion) throw new Error("Reduced-motion setting is missing.");
reducedMotion.checked = true;
reducedMotion.dispatchEvent(new Event("change", { bubbles: true }));
action("close-settings").click();
await frames(4);
const reducedStartCount = Number(canvas.dataset.drawCount ?? 0);
const reducedStartFrames = canvas.dataset.spriteFrameIndices;
await frames(36);
const reducedDraws = Number(canvas.dataset.drawCount ?? 0) - reducedStartCount;
const reducedStable = canvas.dataset.animationActive === "false"
  && canvas.dataset.sampledSpriteTimeMs === "0"
  && canvas.dataset.spriteFrameIndices === reducedStartFrames;

const result = {
  normalDraws,
  normalTimeAdvance,
  normalSpriteFrameSamples: normalFrames.size,
  pausedStable,
  resumedDraws,
  resumeSkipMs,
  reducedDraws,
  reducedStable,
};
const passed = normalDraws >= 20
  && normalTimeAdvance > 0
  && normalFrames.size >= 2
  && pausedStable
  && resumedDraws >= 8
  && resumeSkipMs >= 0
  && resumeSkipMs < 100
  && reducedDraws < normalDraws / 2
  && reducedStable;

globalThis.__animationPolicyFixtureResult = { passed, ...result };
