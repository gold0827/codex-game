import type { WorldPosition } from "./battlefieldFrame";

export const ISOMETRIC_TILE_SIZE = Object.freeze({ width: 64, height: 32 });

export type WorldBounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export type ViewportSize = Readonly<{
  width: number;
  height: number;
}>;

export type ScreenPosition = Readonly<{
  x: number;
  y: number;
}>;

export type IsometricCameraSnapshot = Readonly<{
  center: WorldPosition;
  viewport: ViewportSize;
  zoom: number;
}>;

export type IsometricCamera = Readonly<{
  read: () => IsometricCameraSnapshot;
  project: (position: WorldPosition) => ScreenPosition;
  follow: (position: WorldPosition) => IsometricCameraSnapshot;
  panBy: (screenDelta: ScreenPosition) => IsometricCameraSnapshot;
  setZoom: (zoom: number, anchor?: ScreenPosition) => IsometricCameraSnapshot;
  resize: (viewport: ViewportSize) => IsometricCameraSnapshot;
}>;

export type CanvasViewport = Readonly<{
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  devicePixelRatio: number;
}>;

export type Canvas2DViewportTarget = {
  width: number;
  height: number;
  style: { width: string; height: string };
};

export type Canvas2DRenderingTarget = {
  imageSmoothingEnabled: boolean;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const MAX_DEVICE_PIXEL_RATIO = 2;

function assertFinitePoint(point: ScreenPosition | WorldPosition, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${name} coordinates must be finite.`);
  }
}

function assertViewport(viewport: ViewportSize): void {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0 || !Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new RangeError("Viewport width and height must be positive finite numbers.");
  }
}

function assertBounds(bounds: WorldBounds): void {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY) ||
    bounds.minX > bounds.maxX ||
    bounds.minY > bounds.maxY
  ) {
    throw new RangeError("World bounds must contain finite ordered coordinates.");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampCenter(position: WorldPosition, bounds: WorldBounds): WorldPosition {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  };
}

export function projectIsometric(position: WorldPosition): ScreenPosition {
  assertFinitePoint(position, "World position");
  return {
    x: (position.x - position.y) * (ISOMETRIC_TILE_SIZE.width / 2),
    y: (position.x + position.y) * (ISOMETRIC_TILE_SIZE.height / 2),
  };
}

export function unprojectIsometric(position: ScreenPosition): WorldPosition {
  assertFinitePoint(position, "Screen position");
  const normalizedX = position.x / (ISOMETRIC_TILE_SIZE.width / 2);
  const normalizedY = position.y / (ISOMETRIC_TILE_SIZE.height / 2);
  return {
    x: (normalizedX + normalizedY) / 2,
    y: (normalizedY - normalizedX) / 2,
  };
}

export function createIsometricCamera(options: Readonly<{
  bounds: WorldBounds;
  viewport: ViewportSize;
  center?: WorldPosition;
  zoom?: number;
}>): IsometricCamera {
  assertBounds(options.bounds);
  assertViewport(options.viewport);

  let viewport = { ...options.viewport };
  let center = clampCenter(options.center ?? {
    x: (options.bounds.minX + options.bounds.maxX) / 2,
    y: (options.bounds.minY + options.bounds.maxY) / 2,
  }, options.bounds);
  let zoom = clamp(Number.isFinite(options.zoom) ? (options.zoom ?? 1) : 1, MIN_ZOOM, MAX_ZOOM);

  const read = (): IsometricCameraSnapshot => ({ center: { ...center }, viewport: { ...viewport }, zoom });

  const project = (position: WorldPosition): ScreenPosition => {
    const projected = projectIsometric(position);
    const projectedCenter = projectIsometric(center);
    return {
      x: viewport.width / 2 + (projected.x - projectedCenter.x) * zoom,
      y: viewport.height / 2 + (projected.y - projectedCenter.y) * zoom,
    };
  };

  const follow = (position: WorldPosition): IsometricCameraSnapshot => {
    assertFinitePoint(position, "Follow position");
    center = clampCenter(position, options.bounds);
    return read();
  };

  const panBy = (screenDelta: ScreenPosition): IsometricCameraSnapshot => {
    assertFinitePoint(screenDelta, "Pan delta");
    const worldDelta = unprojectIsometric({
      x: -screenDelta.x / zoom,
      y: -screenDelta.y / zoom,
    });
    center = clampCenter({ x: center.x + worldDelta.x, y: center.y + worldDelta.y }, options.bounds);
    return read();
  };

  const setZoom = (nextZoom: number, anchor?: ScreenPosition): IsometricCameraSnapshot => {
    if (!Number.isFinite(nextZoom)) throw new RangeError("Zoom must be finite.");
    if (anchor) assertFinitePoint(anchor, "Zoom anchor");
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (anchor && clampedZoom !== zoom) {
      const centerProjection = projectIsometric(center);
      const anchorProjection = {
        x: centerProjection.x + (anchor.x - viewport.width / 2) / zoom,
        y: centerProjection.y + (anchor.y - viewport.height / 2) / zoom,
      };
      const nextCenterProjection = {
        x: anchorProjection.x - (anchor.x - viewport.width / 2) / clampedZoom,
        y: anchorProjection.y - (anchor.y - viewport.height / 2) / clampedZoom,
      };
      center = clampCenter(unprojectIsometric(nextCenterProjection), options.bounds);
    }
    zoom = clampedZoom;
    return read();
  };

  const resize = (nextViewport: ViewportSize): IsometricCameraSnapshot => {
    assertViewport(nextViewport);
    viewport = { ...nextViewport };
    return read();
  };

  return { read, project, follow, panBy, setZoom, resize };
}

export function configureCanvasViewport(
  canvas: Canvas2DViewportTarget,
  context: Canvas2DRenderingTarget,
  viewport: ViewportSize,
  requestedDevicePixelRatio: number,
): CanvasViewport {
  assertViewport(viewport);
  const finiteRatio = Number.isFinite(requestedDevicePixelRatio) ? requestedDevicePixelRatio : 1;
  const devicePixelRatio = clamp(finiteRatio, 1, MAX_DEVICE_PIXEL_RATIO);
  const pixelWidth = Math.round(viewport.width * devicePixelRatio);
  const pixelHeight = Math.round(viewport.height * devicePixelRatio);

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;

  return {
    cssWidth: viewport.width,
    cssHeight: viewport.height,
    pixelWidth,
    pixelHeight,
    devicePixelRatio,
  };
}
