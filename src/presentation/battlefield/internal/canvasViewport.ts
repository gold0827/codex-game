import { loadSpriteAtlas, type SpriteAtlasRuntime } from "../../spriteAtlas";
import type { BattlefieldFrame } from "../battlefieldFrame";
import { createBattlefieldDrawList } from "./drawList";

export type BattlefieldViewportSize = Readonly<{
  width: number;
  height: number;
  pixelRatio?: number;
}>;

export type CanvasBattlefieldViewport = Readonly<{
  update: (frame: BattlefieldFrame) => void;
  resize: (size: BattlefieldViewportSize) => void;
  destroy: () => void;
}>;

type FrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

type CanvasViewportOptions = Readonly<{
  scheduler?: FrameScheduler;
  now?: () => number;
  fetchManifest?: typeof fetch;
  resizeObserver?: typeof ResizeObserver;
}>;

type TimedFrame = Readonly<{
  frame: BattlefieldFrame;
  receivedAt: number;
}>;

const WORLD_WIDTH = 24;
const WORLD_HEIGHT = 16;

function browserScheduler(): FrameScheduler {
  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}

function fallbackRuntime(): SpriteAtlasRuntime {
  return {
    status: "degraded",
    issues: [{ path: "$", message: "sprite atlas를 아직 불러오지 못했습니다." }],
    sample: () => ({
      action: "idle",
      facing: "south",
      imageUrl: "",
      frame: {
        rect: { x: 0, y: 0, width: 16, height: 16 },
        durationMs: 1_000,
        anchor: { x: 8, y: 16 },
      },
      frameIndex: 0,
      placeholder: true,
    }),
  };
}

export function createCanvasBattlefieldViewport(
  host: HTMLElement,
  options: CanvasViewportOptions = {},
): CanvasBattlefieldViewport {
  const scheduler = options.scheduler ?? browserScheduler();
  const now = options.now ?? (() => performance.now());
  const canvas = document.createElement("canvas");
  canvas.className = "battlefield-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "실시간 전장. 자율 장교의 위치와 상태를 표시합니다.");
  canvas.textContent = "실시간 전장을 표시할 수 없습니다.";
  const assetStatus = document.createElement("p");
  assetStatus.className = "battlefield-asset-status";
  assetStatus.setAttribute("role", "status");
  assetStatus.textContent = "전장 자산을 불러오는 중입니다.";
  host.replaceChildren(canvas, assetStatus);

  const context = canvas.getContext("2d");
  let size = { width: 1, height: 1, pixelRatio: 1 };
  let previous: TimedFrame | null = null;
  let current: TimedFrame | null = null;
  let frameHandle: number | null = null;
  let destroyed = false;
  let atlas = fallbackRuntime();
  let atlasImage: HTMLImageElement | null = null;
  let atlasImageUrl = "";
  const abortController = new AbortController();

  const showAssetStatus = (message: string | null): void => {
    assetStatus.hidden = message === null;
    assetStatus.textContent = message ?? "";
  };

  const schedule = (): void => {
    if (!destroyed && frameHandle === null) frameHandle = scheduler.request(draw);
  };

  const ensureAtlasImage = (imageUrl: string): HTMLImageElement | null => {
    if (!imageUrl) return null;
    if (atlasImage && atlasImageUrl === imageUrl) return atlasImage;
    if (atlasImage) {
      atlasImage.onload = null;
      atlasImage.onerror = null;
    }
    const image = new Image();
    atlasImage = image;
    atlasImageUrl = imageUrl;
    image.onload = () => {
      if (!destroyed) {
        if (atlas.status === "ready") showAssetStatus(null);
        schedule();
      }
    };
    image.onerror = () => {
      if (!destroyed) showAssetStatus("전장 sprite를 불러오지 못해 식별 가능한 대체 표식을 표시합니다.");
    };
    image.src = imageUrl;
    return image;
  };

  function draw(timestamp: number): void {
    frameHandle = null;
    if (destroyed || !context || !current) return;
    const width = size.width;
    const height = size.height;
    context.save();
    context.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#10231c";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(125, 225, 173, 0.12)";
    context.lineWidth = 1;
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let row = 1; row < 5; row += 1) {
      const y = (height * row) / 5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const elapsed = Number.isFinite(timestamp) ? timestamp : now();
    const drawList = createBattlefieldDrawList(previous, current, elapsed);
    for (const actor of drawList.actors) {
      const x = 18 + (actor.x / Math.max(1, WORLD_WIDTH - 1)) * Math.max(1, width - 36);
      const y = 18 + (actor.y / Math.max(1, WORLD_HEIGHT - 1)) * Math.max(1, height - 36);
      const sample = atlas.sample(actor.action, actor.facing, elapsed);
      const image = sample.placeholder ? null : ensureAtlasImage(sample.imageUrl);
      const drawable = image?.complete && image.naturalWidth > 0;
      if (drawable && image) {
        const { rect, anchor } = sample.frame;
        context.drawImage(
          image,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          Math.round(x - anchor.x),
          Math.round(y - anchor.y),
          rect.width,
          rect.height,
        );
      } else {
        context.fillStyle = actor.health <= 0 ? "#756b67" : "#e6cf72";
        context.fillRect(Math.round(x - 6), Math.round(y - 10), 12, 12);
        context.fillStyle = "#08110e";
        context.fillRect(Math.round(x - 2), Math.round(y - 6), 4, 4);
      }
      if (actor.selected) {
        context.strokeStyle = "#7de1ad";
        context.lineWidth = 2;
        context.strokeRect(Math.round(x - 10), Math.round(y - 14), 20, 20);
      }
      context.fillStyle = "rgba(4, 10, 8, 0.84)";
      context.fillRect(Math.round(x - 14), Math.round(y + 8), 28, 4);
      context.fillStyle = actor.health < 30 ? "#ff8177" : "#7de1ad";
      context.fillRect(Math.round(x - 14), Math.round(y + 8), 28 * (actor.health / 100), 4);
    }
    context.restore();
    schedule();
  }

  const ResizeObserverConstructor = options.resizeObserver ?? globalThis.ResizeObserver;
  const observer = ResizeObserverConstructor
    ? new ResizeObserverConstructor((entries) => {
      const entry = entries[0];
      if (entry) viewport.resize({ width: entry.contentRect.width, height: entry.contentRect.height });
    })
    : null;

  const viewport: CanvasBattlefieldViewport = {
    update: (frame) => {
      if (destroyed) return;
      previous = current;
      current = { frame, receivedAt: now() };
      schedule();
    },
    resize: (nextSize) => {
      if (destroyed) return;
      const pixelRatio = Math.max(1, nextSize.pixelRatio ?? globalThis.devicePixelRatio ?? 1);
      size = {
        width: Math.max(1, nextSize.width),
        height: Math.max(1, nextSize.height),
        pixelRatio,
      };
      canvas.width = Math.round(size.width * pixelRatio);
      canvas.height = Math.round(size.height * pixelRatio);
      schedule();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      abortController.abort();
      if (frameHandle !== null) scheduler.cancel(frameHandle);
      frameHandle = null;
      observer?.disconnect();
      previous = null;
      current = null;
      if (atlasImage) {
        atlasImage.onload = null;
        atlasImage.onerror = null;
        atlasImage.src = "";
      }
      atlasImage = null;
      host.replaceChildren();
    },
  };

  if (!context) showAssetStatus("Canvas를 사용할 수 없어 실시간 전장을 표시하지 못했습니다.");
  observer?.observe(host);
  viewport.resize({ width: host.clientWidth || 640, height: host.clientHeight || 360 });

  const manifestUrl = new URL(
    `${import.meta.env.BASE_URL}assets/visual/sprites/fixture/manifest.json`,
    document.baseURI,
  ).href;
  const fetchManifest = options.fetchManifest ?? fetch;
  void loadSpriteAtlas(manifestUrl, (input, init) => fetchManifest(input, {
    ...init,
    signal: abortController.signal,
  })).then((runtime) => {
    if (destroyed) return;
    atlas = runtime;
    if (runtime.status === "degraded") {
      showAssetStatus("전장 sprite를 불러오지 못해 식별 가능한 대체 표식을 표시합니다.");
    }
    schedule();
  });

  return viewport;
}
