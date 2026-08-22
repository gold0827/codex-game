import { loadSpriteAtlas, type SpriteAtlasRuntime } from "../../spriteAtlas";
import { loadMapAtlas, type MapAtlasKind, type MapAtlasRuntime } from "../../mapAtlas";
import type { BattlefieldFrame, WorldPosition } from "../battlefieldFrame";
import { orderBattlefieldRenderables } from "../drawOrder";
import {
  configureCanvasViewport,
  createIsometricCamera,
  ISOMETRIC_TILE_SIZE,
  type IsometricCameraSnapshot,
} from "../isometricCamera";
import { createBattlefieldDrawList } from "./drawList";
import {
  createBattlefieldMapDrawList,
  type BattlefieldMapDrawList,
} from "./mapDrawList";
import { drawBattlefieldThreatMarker } from "./threatMarker";

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
  onTileSelected?: (position: WorldPosition) => void;
}>;

type TimedFrame = Readonly<{
  frame: BattlefieldFrame;
  receivedAt: number;
}>;

export type BattlefieldAnimationSample = Readonly<{
  active: boolean;
  operationTimeMs: number;
  spriteTimeMs: number;
}>;

export function sampleBattlefieldAnimation(
  current: TimedFrame,
  timestamp: number,
  operationRate = 1,
): BattlefieldAnimationSample {
  const policy = current.frame.animation;
  const active = !policy.paused && !policy.reducedMotion;
  const elapsedSinceSnapshot = Number.isFinite(timestamp)
    ? Math.max(0, timestamp - current.receivedAt)
    : 0;
  const operationTimeMs = active
    ? policy.operationTimeMs + elapsedSinceSnapshot * Math.max(0, operationRate)
    : policy.operationTimeMs;
  return {
    active,
    operationTimeMs,
    spriteTimeMs: policy.reducedMotion ? 0 : operationTimeMs,
  };
}

type AtlasImageSlot = {
  image: HTMLImageElement | null;
  url: string;
};

const tileHighlightStyle = {
  guided: {
    fill: "rgba(115, 185, 162, 0.28)",
    stroke: "#f4d77d",
    lineWidth: 3,
  },
  selected: {
    fill: "rgba(230, 207, 114, 0.18)",
    stroke: "#e6cf72",
    lineWidth: 2,
  },
} as const;

export function drawTileHighlight(
  context: CanvasRenderingContext2D,
  center: WorldPosition,
  scale: number,
  kind: keyof typeof tileHighlightStyle,
): void {
  const style = tileHighlightStyle[kind];
  const halfWidth = (ISOMETRIC_TILE_SIZE.width * scale) / 2;
  const halfHeight = (ISOMETRIC_TILE_SIZE.height * scale) / 2;
  context.save();
  context.fillStyle = style.fill;
  context.strokeStyle = style.stroke;
  context.lineWidth = style.lineWidth;
  context.beginPath();
  context.moveTo(center.x, center.y - halfHeight);
  context.lineTo(center.x + halfWidth, center.y);
  context.lineTo(center.x, center.y + halfHeight);
  context.lineTo(center.x - halfWidth, center.y);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function browserScheduler(): FrameScheduler {
  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}

function fallbackSpriteRuntime(): SpriteAtlasRuntime {
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

function fallbackMapRuntime(): MapAtlasRuntime {
  return {
    status: "degraded",
    issues: [{ path: "$", message: "map atlas를 아직 불러오지 못했습니다." }],
    imageUrl: "",
    frame: () => null,
    skin: () => ({ tiles: [], props: [] }),
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
  canvas.tabIndex = 0;
  canvas.textContent = "실시간 전장을 표시할 수 없습니다.";
  const assetStatus = document.createElement("p");
  assetStatus.className = "battlefield-asset-status";
  assetStatus.setAttribute("role", "status");
  assetStatus.textContent = "전장 자산을 불러오는 중입니다.";
  host.replaceChildren(canvas, assetStatus);

  const context = canvas.getContext("2d");
  let size = { width: 1, height: 1, pixelRatio: 1 };
  const camera = createIsometricCamera({
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    viewport: size,
  });
  let previous: TimedFrame | null = null;
  let current: TimedFrame | null = null;
  let operationRate = 1;
  let drawCount = 0;
  let frameHandle: number | null = null;
  let destroyed = false;
  let spriteAtlas = fallbackSpriteRuntime();
  let mapAtlas = fallbackMapRuntime();
  const spriteImageSlot: AtlasImageSlot = { image: null, url: "" };
  const mapImageSlot: AtlasImageSlot = { image: null, url: "" };
  let selectedActorId: string | null = null;
  let selectedTile: WorldPosition | null = null;
  let guidedTile: WorldPosition | null = null;
  let activeEffectLabels: readonly string[] = [];
  let activeThreatLabels: readonly string[] = [];
  let mapDrawList: BattlefieldMapDrawList | null = null;
  let followingSelected = true;
  let panStart: Readonly<{ x: number; y: number }> | null = null;
  let pointerOrigin: Readonly<{ x: number; y: number }> | null = null;
  let pointerMoved = false;
  const abortController = new AbortController();

  const updateCanvasDescription = (): void => {
    const details = [
      activeEffectLabels.length > 0
        ? `식별된 효과: ${activeEffectLabels.join(", ")}`
        : null,
      activeThreatLabels.length > 0
        ? `식별된 위협: ${activeThreatLabels.join(", ")}`
        : null,
      selectedTile ? `선택 타일 ${selectedTile.x}, ${selectedTile.y}` : null,
      guidedTile ? `훈련 목표 타일 ${guidedTile.x}, ${guidedTile.y}` : null,
    ].filter((detail): detail is string => detail !== null);
    canvas.setAttribute(
      "aria-label",
      `실시간 전장. 자율 장교의 위치와 상태를 표시합니다.${details.length > 0 ? ` ${details.join(". ")}.` : ""} 방향키로 신호 타일을 선택할 수 있습니다.`,
    );
  };

  const selectTile = (position: WorldPosition): void => {
    const restoreFocus = document.activeElement === canvas;
    selectedTile = { x: position.x, y: position.y };
    canvas.dataset.selectedTile = `${position.x},${position.y}`;
    updateCanvasDescription();
    options.onTileSelected?.(selectedTile);
    if (restoreFocus && !destroyed && canvas.isConnected) {
      canvas.focus({ preventScroll: true });
    }
    schedule();
  };

  updateCanvasDescription();

  const showAssetStatus = (message: string | null): void => {
    assetStatus.hidden = message === null;
    assetStatus.textContent = message ?? "";
  };

  const schedule = (): void => {
    if (!destroyed && frameHandle === null) frameHandle = scheduler.request(draw);
  };

  const ensureAtlasImage = (
    slot: AtlasImageSlot,
    assetName: "map" | "sprite",
    imageUrl: string,
    failureMessage: string,
  ): HTMLImageElement | null => {
    if (!imageUrl) return null;
    if (slot.image && slot.url === imageUrl) return slot.image;
    if (slot.image) {
      slot.image.onload = null;
      slot.image.onerror = null;
    }
    const image = new Image();
    slot.image = image;
    slot.url = imageUrl;
    canvas.dataset[`${assetName}Image`] = "loading";
    image.onload = () => {
      if (!destroyed) {
        canvas.dataset[`${assetName}Image`] = "ready";
        if (spriteAtlas.status === "ready" && mapAtlas.status === "ready") showAssetStatus(null);
        schedule();
      }
    };
    image.onerror = () => {
      if (!destroyed) {
        canvas.dataset[`${assetName}Image`] = "degraded";
        showAssetStatus(failureMessage);
      }
    };
    image.src = imageUrl;
    return image;
  };

  const drawFallbackMapAsset = (
    kind: MapAtlasKind,
    position: WorldPosition,
    scale: number,
  ): void => {
    if (!context) return;
    const center = camera.project(position);
    const halfWidth = (ISOMETRIC_TILE_SIZE.width * scale) / 2;
    const halfHeight = (ISOMETRIC_TILE_SIZE.height * scale) / 2;
    const colors: Readonly<Record<MapAtlasKind, string>> = {
      "ground-a": "#415c45",
      "ground-b": "#587052",
      rough: "#776b46",
      blocked: "#304638",
      water: "#24545d",
      bridge: "#9a7445",
      ford: "#776b46",
      spawn: "#73d5c8",
      destination: "#e6cf72",
      "command-post": "#d1b873",
      "civilian-shelter": "#c19a5d",
      tree: "#315c3b",
      rock: "#65716b",
      barricade: "#8a5f36",
    };
    context.save();
    context.fillStyle = colors[kind];
    context.strokeStyle = "#101815";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(center.x, center.y - halfHeight);
    context.lineTo(center.x + halfWidth, center.y);
    context.lineTo(center.x, center.y + halfHeight);
    context.lineTo(center.x - halfWidth, center.y);
    context.closePath();
    if (kind === "spawn" || kind === "destination") context.globalAlpha = 0.7;
    context.fill();
    context.stroke();
    if (
      kind === "command-post" ||
      kind === "civilian-shelter" ||
      kind === "tree" ||
      kind === "rock" ||
      kind === "barricade"
    ) {
      context.fillRect(
        Math.round(center.x - 10 * scale),
        Math.round(center.y - 22 * scale),
        Math.round(20 * scale),
        Math.round(22 * scale),
      );
    }
    context.restore();
  };

  const drawMapAsset = (kind: MapAtlasKind, position: WorldPosition, scale: number): void => {
    if (!context) return;
    const frame = mapAtlas.frame(kind);
    const image = frame
      ? ensureAtlasImage(
        mapImageSlot,
        "map",
        mapAtlas.imageUrl,
        "전장 map을 불러오지 못해 식별 가능한 대체 표식을 표시합니다.",
      )
      : null;
    const drawable = image?.complete && image.naturalWidth > 0;
    if (!frame || !drawable || !image) {
      drawFallbackMapAsset(kind, position, scale);
      return;
    }
    const center = camera.project(position);
    context.drawImage(
      image,
      frame.rect.x,
      frame.rect.y,
      frame.rect.width,
      frame.rect.height,
      Math.round(center.x - frame.anchor.x * scale),
      Math.round(center.y - frame.anchor.y * scale),
      Math.round(frame.rect.width * scale),
      Math.round(frame.rect.height * scale),
    );
  };

  const drawFormationMovement = (
    actor: ReturnType<typeof createBattlefieldDrawList>["actors"][number],
    scale: number,
  ): void => {
    if (!context || !actor.movement || !actor.label || actor.movement.progress >= 1) return;
    const origin = camera.project(actor.movement.origin);
    const destination = camera.project(actor.movement.destination);
    const color = actor.team === "enemy" ? "#ff8177" : "#7de1ad";
    context.save();
    context.globalAlpha = 0.9;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.max(2, 3 * scale);
    context.setLineDash([Math.max(5, 8 * scale), Math.max(3, 5 * scale)]);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(destination.x, destination.y);
    context.stroke();
    context.setLineDash([]);
    const angle = Math.atan2(destination.y - origin.y, destination.x - origin.x);
    const arrowSize = Math.max(7, 10 * scale);
    context.beginPath();
    context.moveTo(destination.x, destination.y);
    context.lineTo(
      destination.x - Math.cos(angle - Math.PI / 6) * arrowSize,
      destination.y - Math.sin(angle - Math.PI / 6) * arrowSize,
    );
    context.lineTo(
      destination.x - Math.cos(angle + Math.PI / 6) * arrowSize,
      destination.y - Math.sin(angle + Math.PI / 6) * arrowSize,
    );
    context.closePath();
    context.fill();
    context.restore();
  };

  const drawFormationLabel = (
    actor: ReturnType<typeof createBattlefieldDrawList>["actors"][number],
    scale: number,
  ): void => {
    if (!context || !actor.label) return;
    const position = camera.project({ x: actor.x, y: actor.y });
    const fontSize = Math.max(11, Math.round(12 * scale));
    const horizontalPadding = Math.max(6, Math.round(7 * scale));
    const width = Math.max(74, actor.label.length * fontSize + horizontalPadding * 2);
    const height = fontSize + Math.max(7, Math.round(8 * scale));
    const left = Math.round(position.x - width / 2);
    const top = Math.round(position.y - 38 * scale);
    const color = actor.team === "enemy" ? "#ff8177" : "#7de1ad";
    context.save();
    context.fillStyle = "rgba(5, 13, 10, 0.9)";
    context.fillRect(left, top, width, height);
    context.fillStyle = color;
    context.fillRect(left, top, Math.max(4, Math.round(5 * scale)), height);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(left, top, width, height);
    context.fillStyle = "#f3f7f2";
    context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const movementGlyph = actor.movement && actor.movement.progress < 1 ? "  →" : "";
    context.fillText(`${actor.label}${movementGlyph}`, left + width / 2, top + height / 2);
    context.restore();
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
    const frameTimestamp = Number.isFinite(timestamp) ? timestamp : now();
    const animation = sampleBattlefieldAnimation(current, frameTimestamp, operationRate);
    const drawList = createBattlefieldDrawList(previous, current, animation.operationTimeMs);
    const spriteFrameIndices: number[] = [];
    const selected = drawList.actors.find((actor) => actor.selected);
    if (followingSelected && selected) camera.follow({ x: selected.x, y: selected.y });
    const scale = camera.read().zoom;
    const currentMapDrawList = mapDrawList ?? createBattlefieldMapDrawList(
      current.frame.map,
      mapAtlas.skin(current.frame.map.id),
    );
    for (const tile of currentMapDrawList.tiles) drawMapAsset(tile.kind, tile.position, scale);

    if (guidedTile) {
      drawTileHighlight(context, camera.project(guidedTile), scale, "guided");
    }

    if (selectedTile) {
      drawTileHighlight(context, camera.project(selectedTile), scale, "selected");
    }

    const renderables = orderBattlefieldRenderables([
      ...current.frame.effects.map((effect) => ({
        ...effect,
        kind: "effect" as const,
      })),
      ...drawList.actors.map((actor) => ({
        ...actor,
        kind: "actor" as const,
        position: { x: actor.x, y: actor.y },
      })),
      ...drawList.threats.map((threat) => ({
        id: threat.id,
        kind: "threat" as const,
        position: { x: threat.x, y: threat.y },
        threat,
      })),
      ...currentMapDrawList.props.map((prop) => ({
        ...prop,
        kind: "prop" as const,
        assetKind: prop.kind,
      })),
    ]);
    drawList.actors.forEach((actor) => drawFormationMovement(actor, scale));
    for (const renderable of renderables) {
      if (renderable.kind === "effect") {
        const { x, y } = camera.project(renderable.position);
        const effectRadius = renderable.radius * scale;
        context.save();
        context.globalAlpha = renderable.opacity;
        context.strokeStyle = renderable.color;
        context.fillStyle = renderable.color;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(Math.round(x), Math.round(y), effectRadius, 0, Math.PI * 2);
        context.stroke();
        context.font = `${Math.max(9, Math.round(10 * scale))}px ui-monospace, monospace`;
        context.textAlign = "center";
        context.fillText(renderable.glyph, Math.round(x), Math.round(y - effectRadius - 3));
        context.restore();
        continue;
      }
      if (renderable.kind === "prop") {
        drawMapAsset(renderable.assetKind, renderable.position, scale);
        continue;
      }
      if (renderable.kind === "threat") {
        const foot = camera.project(renderable.position);
        drawBattlefieldThreatMarker(context, renderable.threat, foot, scale);
        continue;
      }
      const actor = renderable;
      const { x, y } = camera.project(actor.position);
      if (actor.team) {
        context.save();
        context.fillStyle = actor.team === "ally" ? "rgba(70, 205, 146, 0.45)" : "rgba(230, 91, 76, 0.45)";
        context.strokeStyle = actor.team === "ally" ? "#7de1ad" : "#ff8177";
        context.lineWidth = Math.max(1, 1.5 * scale);
        context.beginPath();
        context.ellipse(
          Math.round(x),
          Math.round(y + 5 * scale),
          Math.max(6, 12 * scale),
          Math.max(3, 5 * scale),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.stroke();
        context.restore();
      }
      const sample = spriteAtlas.sample(actor.action, actor.facing, animation.spriteTimeMs);
      spriteFrameIndices.push(sample.frameIndex);
      const image = sample.placeholder
        ? null
        : ensureAtlasImage(
          spriteImageSlot,
          "sprite",
          sample.imageUrl,
          "전장 sprite를 불러오지 못해 식별 가능한 대체 표식을 표시합니다.",
        );
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
        context.fillStyle = actor.health <= 0
          ? "#756b67"
          : actor.team === "enemy" ? "#ff8177" : "#e6cf72";
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
      context.fillStyle = actor.health < 30 || actor.team === "enemy" ? "#ff8177" : "#7de1ad";
      context.fillRect(Math.round(x - 14 * scale), Math.round(y + 8 * scale), healthBarWidth * (actor.health / 100), healthBarHeight);
    }
    drawList.actors.forEach((actor) => drawFormationLabel(actor, scale));
    const enemyActors = drawList.actors.filter(({ team }) => team === "enemy");
    if (enemyActors.length > 0) {
      const center = enemyActors.reduce(
        (sum, actor) => ({ x: sum.x + actor.x, y: sum.y + actor.y }),
        { x: 0, y: 0 },
      );
      canvas.dataset.drawnEnemyFormationCenter = `${(center.x / enemyActors.length).toFixed(3)},${(center.y / enemyActors.length).toFixed(3)}`;
    } else {
      delete canvas.dataset.drawnEnemyFormationCenter;
    }
    canvas.dataset.enemyMovementCueCount = String(
      enemyActors.filter(({ movement }) => movement && movement.progress < 1).length,
    );
    canvas.dataset.squadLabelCount = String(drawList.actors.filter(({ label }) => label).length);
    canvas.dataset.drawnThreatMarkerCount = String(drawList.threats.length);
    canvas.dataset.animationActive = String(animation.active);
    canvas.dataset.sampledOperationTimeMs = String(animation.operationTimeMs);
    canvas.dataset.sampledSpriteTimeMs = String(animation.spriteTimeMs);
    canvas.dataset.spriteFrameIndices = spriteFrameIndices.join(",");
    drawCount += 1;
    canvas.dataset.drawCount = String(drawCount);
    context.restore();
    if (animation.active) schedule();
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
  const tileAt = (position: Readonly<{ x: number; y: number }>): WorldPosition | null => {
    if (!current) return null;
    const world = camera.unproject(position);
    const tile = { x: Math.round(world.x), y: Math.round(world.y) };
    return tile.x >= 0 && tile.x < current.frame.map.width &&
      tile.y >= 0 && tile.y < current.frame.map.height
      ? tile
      : null;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || event.button !== 0) return;
    panStart = pointerPosition(event);
    pointerOrigin = panStart;
    pointerMoved = false;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (destroyed || !panStart) return;
    const next = pointerPosition(event);
    if (pointerOrigin && Math.hypot(next.x - pointerOrigin.x, next.y - pointerOrigin.y) > 4) {
      pointerMoved = true;
    }
    camera.panBy({ x: next.x - panStart.x, y: next.y - panStart.y });
    followingSelected = false;
    panStart = next;
    schedule();
  };
  const stopPan = (event: PointerEvent, select: boolean): void => {
    if (select && panStart && !pointerMoved) {
      const tile = tileAt(pointerPosition(event));
      if (tile) selectTile(tile);
    }
    panStart = null;
    pointerOrigin = null;
    pointerMoved = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent): void => stopPan(event, true);
  const onPointerCancel = (event: PointerEvent): void => stopPan(event, false);
  const onWheel = (event: WheelEvent): void => {
    if (destroyed) return;
    event.preventDefault();
    const anchor = pointerPosition(event);
    const nextZoom = camera.read().zoom * Math.exp(-event.deltaY * 0.0015);
    camera.setZoom(nextZoom, followingSelected ? undefined : anchor);
    schedule();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const delta = ({
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    } as const)[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
    if (!delta || !current) return;
    event.preventDefault();
    const start = selectedTile ?? {
      x: Math.round(camera.read().center.x),
      y: Math.round(camera.read().center.y),
    };
    selectTile({
      x: Math.max(0, Math.min(current.frame.map.width - 1, start.x + delta.x)),
      y: Math.max(0, Math.min(current.frame.map.height - 1, start.y + delta.y)),
    });
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);

  const viewport: CanvasBattlefieldViewport = {
    update: (frame) => {
      if (destroyed) return;
      const firstFrame = current === null;
      camera.setBounds({
        minX: 0,
        minY: 0,
        maxX: frame.map.width - 1,
        maxY: frame.map.height - 1,
      });
      if (firstFrame) {
        camera.follow({
          x: (frame.map.width - 1) / 2,
          y: (frame.map.height - 1) / 2,
        });
      }
      if (selectedTile) {
        selectedTile = {
          x: Math.min(selectedTile.x, frame.map.width - 1),
          y: Math.min(selectedTile.y, frame.map.height - 1),
        };
      }
      const nextSelected = frame.actors.find((actor) => actor.selected);
      const nextSelectedId = nextSelected?.id ?? null;
      if (nextSelectedId !== selectedActorId) followingSelected = true;
      selectedActorId = nextSelectedId;
      guidedTile = frame.guidedTile ? { ...frame.guidedTile } : null;
      activeEffectLabels = [...new Set(frame.effects.map(({ label }) => label))];
      activeThreatLabels = frame.threats.map(({ label }) => label);
      mapDrawList = createBattlefieldMapDrawList(frame.map, mapAtlas.skin(frame.map.id));
      canvas.dataset.mapTileCount = String(mapDrawList.tiles.length);
      canvas.dataset.mapPropCount = String(mapDrawList.props.length);
      canvas.dataset.actorCount = String(frame.actors.length);
      canvas.dataset.allyActorCount = String(frame.actors.filter(({ team }) => team === "ally").length);
      canvas.dataset.enemyActorCount = String(frame.actors.filter(({ team }) => team === "enemy").length);
      canvas.dataset.threatMarkerCount = String(frame.threats.length);
      canvas.dataset.threatMarkerCategories = [...new Set(
        frame.threats.map(({ category }) => category),
      )].join(",");
      if (guidedTile) canvas.dataset.guidanceTile = `${guidedTile.x},${guidedTile.y}`;
      else delete canvas.dataset.guidanceTile;
      updateCanvasDescription();
      if (followingSelected && nextSelected) camera.follow(nextSelected.position);
      const receivedAt = now();
      if (current) {
        const receivedDelta = receivedAt - current.receivedAt;
        const operationDelta = frame.animation.operationTimeMs -
          current.frame.animation.operationTimeMs;
        if (receivedDelta > 0 && operationDelta > 0) {
          operationRate = operationDelta / receivedDelta;
        }
      }
      previous = current;
      current = { frame, receivedAt };
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
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      previous = null;
      current = null;
      mapDrawList = null;
      for (const slot of [spriteImageSlot, mapImageSlot]) {
        const image = slot.image;
        if (!image) continue;
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
      spriteImageSlot.image = null;
      mapImageSlot.image = null;
      host.replaceChildren();
    },
  };

  if (!context) showAssetStatus("Canvas를 사용할 수 없어 실시간 전장을 표시하지 못했습니다.");
  observer?.observe(host);
  viewport.resize({ width: host.clientWidth || 640, height: host.clientHeight || 360 });

  const spriteManifestUrl = new URL(
    `${import.meta.env.BASE_URL}assets/visual/sprites/officers/manifest.json`,
    document.baseURI,
  ).href;
  const mapManifestUrl = new URL(
    `${import.meta.env.BASE_URL}assets/visual/maps/battlefield/manifest.json`,
    document.baseURI,
  ).href;
  const fetchManifest = options.fetchManifest ?? fetch;
  const fetchAsset = (input: RequestInfo | URL, init?: RequestInit) => fetchManifest(input, {
    ...init,
    signal: abortController.signal,
  });
  void Promise.all([
    loadSpriteAtlas(spriteManifestUrl, fetchAsset),
    loadMapAtlas(mapManifestUrl, fetchAsset),
  ]).then(([nextSpriteAtlas, nextMapAtlas]) => {
    if (destroyed) return;
    spriteAtlas = nextSpriteAtlas;
    mapAtlas = nextMapAtlas;
    canvas.dataset.spriteAssets = nextSpriteAtlas.status;
    canvas.dataset.mapAssets = nextMapAtlas.status;
    if (current) {
      mapDrawList = createBattlefieldMapDrawList(
        current.frame.map,
        mapAtlas.skin(current.frame.map.id),
      );
      canvas.dataset.mapTileCount = String(mapDrawList.tiles.length);
      canvas.dataset.mapPropCount = String(mapDrawList.props.length);
    }
    if (nextSpriteAtlas.status === "degraded" || nextMapAtlas.status === "degraded") {
      showAssetStatus("전장 map 또는 sprite를 불러오지 못해 식별 가능한 대체 표식을 표시합니다.");
    }
    schedule();
  });

  return viewport;
}
