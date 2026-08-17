export const SPRITE_ACTIONS = [
  "idle",
  "walk",
  "attack",
  "inspect",
  "broadcast",
  "panic",
  "hurt",
  "down",
] as const;

export const SPRITE_FACINGS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

export type SpriteAction = (typeof SPRITE_ACTIONS)[number];
export type SpriteFacing = (typeof SPRITE_FACINGS)[number];

export type SpriteFrame = Readonly<{
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  durationMs: number;
  anchor: Readonly<{ x: number; y: number }>;
}>;

export type SpriteAtlasManifest = Readonly<{
  version: 1;
  image: string;
  size: Readonly<{ width: number; height: number }>;
  animations: Readonly<
    Record<SpriteAction, Readonly<Record<SpriteFacing, readonly SpriteFrame[]>>>
  >;
}>;

export type SpriteAtlasIssue = Readonly<{
  path: string;
  message: string;
}>;

export type SpriteSample = Readonly<{
  action: SpriteAction;
  facing: SpriteFacing;
  imageUrl: string;
  frame: SpriteFrame;
  frameIndex: number;
  placeholder: boolean;
}>;

export type SpriteAtlasRuntime = Readonly<{
  status: "ready" | "degraded";
  issues: readonly SpriteAtlasIssue[];
  sample: (action: SpriteAction, facing: SpriteFacing, elapsedMs: number) => SpriteSample;
}>;

type MutableTracks = Record<SpriteAction, Record<SpriteFacing, readonly SpriteFrame[] | undefined>>;

const PLACEHOLDER_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath fill='%23ff3ea5' d='M0 0h16v16H0z'/%3E%3Cpath fill='%23211b2d' d='M0 0h8v8H0zm8 8h8v8H8z'/%3E%3C/svg%3E";

export const PLACEHOLDER_SPRITE_FRAME: SpriteFrame = Object.freeze({
  rect: Object.freeze({ x: 0, y: 0, width: 16, height: 16 }),
  durationMs: 1_000,
  anchor: Object.freeze({ x: 8, y: 16 }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readSize(value: unknown, path: string, issues: SpriteAtlasIssue[]) {
  if (!isRecord(value) || !isPositiveInteger(value.width) || !isPositiveInteger(value.height)) {
    issues.push({ path, message: "width와 height는 양의 정수여야 합니다." });
    return undefined;
  }
  return { width: value.width, height: value.height } as const;
}

function readFrame(
  value: unknown,
  path: string,
  atlasSize: Readonly<{ width: number; height: number }> | undefined,
  issues: SpriteAtlasIssue[],
): SpriteFrame | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "frame은 객체여야 합니다." });
    return undefined;
  }
  const rect = value.rect;
  const anchor = value.anchor;
  if (
    !isRecord(rect) ||
    !isNonNegativeInteger(rect.x) ||
    !isNonNegativeInteger(rect.y) ||
    !isPositiveInteger(rect.width) ||
    !isPositiveInteger(rect.height)
  ) {
    issues.push({ path: `${path}.rect`, message: "rect는 음이 아닌 x/y와 양의 width/height를 가져야 합니다." });
    return undefined;
  }
  if (atlasSize && (rect.x + rect.width > atlasSize.width || rect.y + rect.height > atlasSize.height)) {
    issues.push({ path: `${path}.rect`, message: "frame rect가 atlas 경계를 벗어났습니다." });
    return undefined;
  }
  if (!isPositiveInteger(value.durationMs)) {
    issues.push({ path: `${path}.durationMs`, message: "durationMs는 양의 정수여야 합니다." });
    return undefined;
  }
  if (
    !isRecord(anchor) ||
    typeof anchor.x !== "number" ||
    !Number.isFinite(anchor.x) ||
    typeof anchor.y !== "number" ||
    !Number.isFinite(anchor.y)
  ) {
    issues.push({ path: `${path}.anchor`, message: "anchor x/y는 유한한 숫자여야 합니다." });
    return undefined;
  }
  return {
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    durationMs: value.durationMs,
    anchor: { x: anchor.x, y: anchor.y },
  };
}

function emptyTracks(): MutableTracks {
  return Object.fromEntries(
    SPRITE_ACTIONS.map((action) => [
      action,
      Object.fromEntries(SPRITE_FACINGS.map((facing) => [facing, undefined])),
    ]),
  ) as MutableTracks;
}

function parseManifest(value: unknown): {
  manifest?: SpriteAtlasManifest;
  tracks: MutableTracks;
  image?: string;
  issues: SpriteAtlasIssue[];
} {
  const issues: SpriteAtlasIssue[] = [];
  const tracks = emptyTracks();
  if (!isRecord(value)) {
    return { tracks, issues: [{ path: "$", message: "manifest는 객체여야 합니다." }] };
  }
  if (value.version !== 1) issues.push({ path: "version", message: "지원하는 canonical version은 1뿐입니다." });
  const image = typeof value.image === "string" && value.image.trim().length > 0 ? value.image : undefined;
  if (!image) issues.push({ path: "image", message: "image는 비어 있지 않은 문자열이어야 합니다." });
  const size = readSize(value.size, "size", issues);
  const animations = value.animations;
  if (!isRecord(animations)) {
    issues.push({ path: "animations", message: "animations는 객체여야 합니다." });
  } else {
    const actionKeys = Object.keys(animations);
    for (const key of actionKeys) {
      if (!(SPRITE_ACTIONS as readonly string[]).includes(key)) {
        issues.push({ path: `animations.${key}`, message: "알 수 없는 animation key입니다." });
      }
    }
    for (const action of SPRITE_ACTIONS) {
      const directions = animations[action];
      if (!isRecord(directions)) {
        issues.push({ path: `animations.${action}`, message: "필수 animation이 없습니다." });
        continue;
      }
      for (const key of Object.keys(directions)) {
        if (!(SPRITE_FACINGS as readonly string[]).includes(key)) {
          issues.push({ path: `animations.${action}.${key}`, message: "알 수 없는 facing key입니다." });
        }
      }
      for (const facing of SPRITE_FACINGS) {
        const frameValues = directions[facing];
        const path = `animations.${action}.${facing}`;
        if (!Array.isArray(frameValues) || frameValues.length === 0) {
          issues.push({ path, message: "facing에는 frame이 하나 이상 필요합니다." });
          continue;
        }
        const frames: SpriteFrame[] = [];
        frameValues.forEach((frameValue, index) => {
          const frame = readFrame(frameValue, `${path}[${index}]`, size, issues);
          if (frame) frames.push(frame);
        });
        if (frames.length > 0) tracks[action][facing] = frames;
      }
    }
  }

  const canonicalRoot = value.version === 1 && image !== undefined && size !== undefined;
  const manifest = issues.length === 0 && image && size
    ? ({ version: 1, image, size, animations: tracks } as SpriteAtlasManifest)
    : undefined;
  return {
    manifest,
    tracks: canonicalRoot ? tracks : emptyTracks(),
    image: canonicalRoot ? image : undefined,
    issues,
  };
}

export function validateSpriteAtlasManifest(
  value: unknown,
): Readonly<{ ok: true; manifest: SpriteAtlasManifest } | { ok: false; issues: readonly SpriteAtlasIssue[] }> {
  const parsed = parseManifest(value);
  return parsed.manifest
    ? { ok: true, manifest: parsed.manifest }
    : { ok: false, issues: parsed.issues };
}

export function createSpriteAtlasRuntime(value: unknown, manifestUrl: string): SpriteAtlasRuntime {
  const parsed = parseManifest(value);
  let imageUrl = PLACEHOLDER_IMAGE_URL;
  if (parsed.image) {
    try {
      imageUrl = new URL(parsed.image, manifestUrl).href;
    } catch {
      parsed.issues.push({ path: "image", message: "manifest URL을 기준으로 image 경로를 해석할 수 없습니다." });
    }
  }

  return {
    status: parsed.issues.length === 0 ? "ready" : "degraded",
    issues: parsed.issues,
    sample(action, facing, elapsedMs) {
      const frames = parsed.tracks[action][facing];
      if (!frames || frames.length === 0) {
        return { action, facing, imageUrl: PLACEHOLDER_IMAGE_URL, frame: PLACEHOLDER_SPRITE_FRAME, frameIndex: 0, placeholder: true };
      }
      const cycleMs = frames.reduce((total, frame) => total + frame.durationMs, 0);
      const sampleTimeMs = Number.isFinite(elapsedMs) ? elapsedMs : 0;
      const cyclePosition = ((sampleTimeMs % cycleMs) + cycleMs) % cycleMs;
      let boundary = 0;
      const frameIndex = frames.findIndex((frame) => {
        boundary += frame.durationMs;
        return cyclePosition < boundary;
      });
      return { action, facing, imageUrl, frame: frames[frameIndex], frameIndex, placeholder: false };
    },
  };
}

export async function loadSpriteAtlas(
  manifestUrl: string,
  fetchManifest: typeof fetch = fetch,
): Promise<SpriteAtlasRuntime> {
  try {
    const response = await fetchManifest(manifestUrl);
    if (!response.ok) {
      const runtime = createSpriteAtlasRuntime(undefined, manifestUrl);
      return {
        ...runtime,
        issues: [{ path: "$", message: `manifest 요청이 실패했습니다: HTTP ${response.status}` }],
      };
    }
    return createSpriteAtlasRuntime(await response.json(), manifestUrl);
  } catch (error) {
    const runtime = createSpriteAtlasRuntime(undefined, manifestUrl);
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...runtime,
      issues: [{ path: "$", message: `manifest를 불러오지 못했습니다: ${message}` }],
    };
  }
}
