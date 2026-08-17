import { createGameSession, type GameSnapshot } from "../../src/application/game-session";
import { createOperationSimulation } from "../../src/domain/operation/operationEngine";
import { createCanvasBattlefieldViewport } from "../../src/presentation/battlefield/internal/canvasViewport";
import { projectBattlefieldFrame } from "../../src/presentation/operation/battlefieldProjector";
import { completeCampaign } from "../../src/scenarios/completeCampaign";
import type { HarnessConfiguration } from "../../src/simulation/simulationTypes";
import { nextFrame } from "./chrome-fixture-helpers";

declare global {
  var __panicCanvasFixtureResult: unknown;
}

async function waitFor(condition: () => boolean, maxFrames = 180): Promise<boolean> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (condition()) return true;
    await nextFrame();
  }
  return condition();
}

const scene = completeCampaign.scenes.find(
  ({ identity }) => identity.id === "misaddressed-artillery",
);
if (!scene) throw new Error("Missing artillery panic Chrome fixture.");
const poorHarness: HarnessConfiguration = {
  informationReach: 0,
  authorityClarity: 0,
  verificationDepth: 0,
  feedbackCompression: 0,
};
const simulation = createOperationSimulation(
  scene,
  completeCampaign.officers,
  101,
  poorHarness,
);
simulation.advance(20_000);
const shellSession = createGameSession(completeCampaign, "panic-canvas-chrome-shell");
shellSession.dispatch({ type: "start-attempt" });
const shell = shellSession.read();
const snapshot = (): GameSnapshot => ({
  ...shell,
  scene,
  operation: simulation.snapshot(),
  operationEvents: simulation.events(),
  replay: simulation.replay(),
});

const panicSnapshot = snapshot();
const panicUnit = panicSnapshot.operation?.units.find(
  ({ officerId }) => officerId === "captain-han",
);
const panicFrame = projectBattlefieldFrame(panicSnapshot);
const reducedFrame = projectBattlefieldFrame(panicSnapshot, { reducedMotion: true });
if (!panicFrame || !reducedFrame) throw new Error("Missing panic battlefield frame.");
const panicActor = panicFrame.actors.find(({ id }) => id === "captain-han");
const reducedActor = reducedFrame.actors.find(({ id }) => id === "captain-han");

const manifestResponse = await fetch(
  new URL("assets/visual/sprites/officers/manifest.json", document.baseURI),
);
const manifest = await manifestResponse.json() as {
  animations: {
    panic: Record<string, Array<{ rect: { x: number; y: number; width: number; height: number } }>>;
  };
};
const panicRects = new Set(Object.values(manifest.animations.panic).flat().map(({ rect }) =>
  `${rect.x},${rect.y},${rect.width},${rect.height}`
));
const observedPanicFrames = new Set<string>();
const host = document.createElement("section");
host.dataset.fixture = "panic-canvas";
document.body.append(host);
const viewport = createCanvasBattlefieldViewport(host);
const canvas = host.querySelector<HTMLCanvasElement>("canvas");
const context = canvas?.getContext("2d");
if (!canvas || !context) throw new Error("Panic Canvas did not mount a 2D context.");
const originalDrawImage = context.drawImage;
context.drawImage = (function instrumentDrawImage(
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sourceWidth: number,
  sourceHeight: number,
  dx: number,
  dy: number,
  destinationWidth: number,
  destinationHeight: number,
): void {
  const rect = `${sx},${sy},${sourceWidth},${sourceHeight}`;
  if (panicRects.has(rect)) observedPanicFrames.add(rect);
  originalDrawImage.call(
    context,
    image,
    sx,
    sy,
    sourceWidth,
    sourceHeight,
    dx,
    dy,
    destinationWidth,
    destinationHeight,
  );
}) as typeof context.drawImage;

viewport.resize({ width: 640, height: 360, pixelRatio: 1 });
viewport.update(panicFrame);
const animationObserved = await waitFor(() =>
  canvas.dataset.spriteAssets === "ready" &&
  canvas.dataset.spriteImage === "ready" &&
  observedPanicFrames.size >= 2
);

simulation.advance(1_400);
const recoveredFrame = projectBattlefieldFrame(snapshot());
const recoveredActor = recoveredFrame?.actors.find(({ id }) => id === "captain-han");
const result = {
  seed: 101,
  panicReaction: panicUnit?.panicReaction ?? null,
  projectedAction: panicActor?.action ?? null,
  reducedMotionAction: reducedActor?.action ?? null,
  recoveredAction: recoveredActor?.action ?? null,
  animationObserved,
  observedPanicFrameCount: observedPanicFrames.size,
  spriteAssets: canvas.dataset.spriteAssets ?? null,
  spriteImage: canvas.dataset.spriteImage ?? null,
};
const passed = result.panicReaction === "retreat" &&
  result.projectedAction === "panic" &&
  result.reducedMotionAction === "panic" &&
  result.recoveredAction !== "panic" &&
  result.animationObserved &&
  result.observedPanicFrameCount >= 2 &&
  result.spriteAssets === "ready" &&
  result.spriteImage === "ready";

context.drawImage = originalDrawImage;
viewport.destroy();
host.remove();
globalThis.__panicCanvasFixtureResult = { passed, ...result };
