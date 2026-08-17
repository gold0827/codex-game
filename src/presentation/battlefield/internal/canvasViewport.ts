import { loadSpriteAtlas, type SpriteAtlasRuntime } from "../../spriteAtlas";
import type { BattlefieldFrame } from "../battlefieldFrame";
import { orderBattlefieldRenderables } from "../drawOrder";
import {
  configureCanvasViewport,
  createIsometricCamera,
  type IsometricCameraSnapshot,
} from "../isometricCamera";
import { createBattlefieldDrawList } from "./drawList";

export type BattlefieldViewportSize = Readonly<{
  width: number;
  height: number;
  pixelRatio?: number;
}>;

export type CanvasBattlefieldViewport = Readonly<{
  update: (frame: BattlefieldFrame) => void;
  resize: (size: BattlefieldViewportSize) => void;
  readCamera: () => IsometricCameraSnapshot;
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
  const camera = createIsometricCamera({
    bounds: { minX: 0, minY: 0, maxX: WORLD_WIDTH - 1, maxY: WORLD_HEIGHT - 1 },
    viewport: size,
  });
  let previous: TimedFrame | null = null;
  let current: TimedFrame | null = null;
  let frameHandle: number | null = null;
  let destroyed = false;
  let atlas = fallbackRuntime();
  let atlasImage: HTMLImageElement | null = null;
  let atlasImageUrl = "";
  let selectedActorId: string | null = null;
  let followingSelected = true;
  let panStart: Readonly<{ x: number; y: number }> | null = null;
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
    const elapsed = Number.isFinite(timestamp) ? timestamp : now();
    const drawList = createBattlefieldDrawList(previous, current, elapsed);
    const selected = drawList.actors.find((actor) => actor.selected);
    if (followingSelected && selected) camera.follow({ x: selected.x, y: selected.y });

    context.strokeStyle = "rgba(125, 225, 173, 0.16)";
    context.lineWidth = 1;
    for (let worldX = 0; worldX < WORLD_WIDTH; worldX += 1) {
      const start = camera.project({ x: worldX, y: 0 });
      const end = camera.project({ x: worldX, y: WORLD_HEIGHT - 1 });
      context.beginPath();
      context.moveTo(Math.round(start.x), Math.round(start.y));
      context.lineTo(Math.round(end.x), Math.round(end.y));
      context.stroke();
    }
    for (let worldY = 0; worldY < WORLD_HEIGHT; worldY += 1) {
      const start = camera.project({ x: 0, y: worldY });
      const end = camera.project({ x: WORLD_WIDTH - 1, y: worldY });
      context.beginPath();
      context.moveTo(Math.round(start.x), Math.round(start.y));
      context.lineTo(Math.round(end.x), Math.round(end.y));
      context.stroke();
    }

    for (const effect of current.frame.effects) {
      const { x, y } = camera.project(effect.position);
      const effectRadius = effect.radius * camera.read().zoom;
      context.save();
      context.globalAlpha = effect.opacity;
      context.strokeStyle = effect.color;
      context.fillStyle = effect.color;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(Math.round(x), Math.round(y), effectRadius, 0, Math.PI * 2);
      context.stroke();
      context.font = `${Math.max(9, Math.round(10 * camera.read().zoom))}px ui-monospace, monospace`;
      context.textAlign = "center";
      context.fillText(effect.glyph, Math.round(x), Math.round(y - effectRadius - 3));
      context.restore();
    }

    const actors = orderBattlefieldRenderables(drawList.actors.map((actor) => ({
      ...actor,
      kind: "actor" as const,
      position: { x: actor.x, y: actor.y },
    })));
    const scale = camera.read().zoom;
    for (const actor of actors) {
      const { x, y } = camera.project(actor.position);
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
          Math.round(x - anchor.x * scale),
          Math.round(y - anchor.y * scale),
          Math.round(rect.width * scale),
          Math.round(rect.height * scale),
        );
      } else {
        context.fillStyle = actor.health <= 0 ? "#756b67" : "#e6cf72";
        context.fillRect(Math.round(x - 6 * scale), Math.round(y - 10 * scale), Math.round(12 * scale), Math.round(12 * scale));
        context.fillStyle = "#08110e";
        context.fillRect(Math.round(x - 2 * scale), Math.round(y - 6 * scale), Math.max(1, Math.round(4 * scale)), Math.max(1, Math.round(4 * scale)));
      }
      if (actor.selected) {
        context.strokeStyle = "#7de1ad";
        context.lineWidth = 2;
        context.strokeRect(Math.round(x - 10 * scale), Math.round(y - 14 * scale), Math.round(20 * scale), Math.round(20 * scale));
      }
      const healthBarWidth = Math.round(28 * scale);
      const healthBarHeight = Math.max(2, Math.round(4 * scale));
      context.fillStyle = "rgba(4, 10, 8, 0.84)";
      context.fillRect(Math.round(x - 14 * scale), Math.round(y + 8 * scale), healthBarWidth, healthBarHeight);
      context.fillStyle = actor.health < 30 ? "#ff8177" : "#7de1ad";
      context.fillRect(Math.round(x - 14 * scale), Math.round(y + 8 * scale), healthBarWidth * (actor.health / 100), healthBarHeight);
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

  const pointerPosition = (event: Readonly<{ clientX: number; clientY: number }>): Readonly<{ x: number; y: number }> => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || event.button !== 0) return;
    panStart = pointerPosition(event);
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (destroyed || !panStart) return;
    const next = pointerPosition(event);
    camera.panBy({ x: next.x - panStart.x, y: next.y - panStart.y });
    followingSelected = false;
    panStart = next;
    schedule();
  };
  const stopPan = (event: PointerEvent): void => {
    panStart = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent): void => {
    if (destroyed) return;
    event.preventDefault();
    const anchor = pointerPosition(event);
    const nextZoom = camera.read().zoom * Math.exp(-event.deltaY * 0.0015);
    camera.setZoom(nextZoom, followingSelected ? undefined : anchor);
    schedule();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", stopPan);
  canvas.addEventListener("pointercancel", stopPan);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const viewport: CanvasBattlefieldViewport = {
    update: (frame) => {
      if (destroyed) return;
      const nextSelected = frame.actors.find((actor) => actor.selected);
      const nextSelectedId = nextSelected?.id ?? null;
      if (nextSelectedId !== selectedActorId) followingSelected = true;
      selectedActorId = nextSelectedId;
      const effectLabels = [...new Set(frame.effects.map(({ label }) => label))];
      canvas.setAttribute(
        "aria-label",
        effectLabels.length > 0
          ? `실시간 전장. 식별된 효과: ${effectLabels.join(", ")}.`
          : "실시간 전장. 자율 장교의 위치와 상태를 표시합니다.",
      );
      if (followingSelected && nextSelected) camera.follow(nextSelected.position);
      previous = current;
      current = { frame, receivedAt: now() };
      schedule();
    },
    resize: (nextSize) => {
      if (destroyed) return;
      const requestedPixelRatio = nextSize.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
      const pixelRatio = Number.isFinite(requestedPixelRatio)
        ? Math.max(1, Math.min(2, requestedPixelRatio))
        : 1;
      size = {
        width: Math.max(1, nextSize.width),
        height: Math.max(1, nextSize.height),
        pixelRatio,
      };
      camera.resize(size);
      if (context) configureCanvasViewport(canvas, context, size, size.pixelRatio);
      else {
        canvas.width = Math.round(size.width * size.pixelRatio);
        canvas.height = Math.round(size.height * size.pixelRatio);
      }
      schedule();
    },
    readCamera: camera.read,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      abortController.abort();
      if (frameHandle !== null) scheduler.cancel(frameHandle);
      frameHandle = null;
      observer?.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", stopPan);
      canvas.removeEventListener("pointercancel", stopPan);
      canvas.removeEventListener("wheel", onWheel);
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
