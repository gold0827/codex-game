export const MAP_ATLAS_KINDS = [
  "ground-a",
  "ground-b",
  "rough",
  "blocked",
  "water",
  "bridge",
  "ford",
  "spawn",
  "destination",
  "command-post",
  "civilian-shelter",
  "tree",
  "rock",
  "barricade",
] as const;

export const MAP_SKIN_TILE_KINDS = ["water", "bridge", "ford"] as const;
export const MAP_SKIN_PROP_KINDS = [
  "command-post",
  "civilian-shelter",
  "tree",
  "rock",
  "barricade",
] as const;

export type MapAtlasKind = (typeof MAP_ATLAS_KINDS)[number];
export type MapSkinTileKind = (typeof MAP_SKIN_TILE_KINDS)[number];
export type MapSkinPropKind = (typeof MAP_SKIN_PROP_KINDS)[number];

export type MapAtlasFrame = Readonly<{
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  anchor: Readonly<{ x: number; y: number }>;
}>;

export type MapSkinPlacement<Kind extends string> = Readonly<{
  id: string;
  kind: Kind;
  position: Readonly<{ x: number; y: number }>;
}>;

export type MapAtlasSkin = Readonly<{
  tiles: readonly MapSkinPlacement<MapSkinTileKind>[];
  props: readonly MapSkinPlacement<MapSkinPropKind>[];
}>;

export type MapAtlasManifest = Readonly<{
  version: 1;
  image: string;
  size: Readonly<{ width: number; height: number }>;
  frames: Readonly<Record<MapAtlasKind, MapAtlasFrame>>;
  skins: Readonly<Record<string, MapAtlasSkin>>;
}>;

export type MapAtlasIssue = Readonly<{ path: string; message: string }>;

export type MapAtlasRuntime = Readonly<{
  status: "ready" | "degraded";
  issues: readonly MapAtlasIssue[];
  imageUrl: string;
  frame: (kind: MapAtlasKind) => MapAtlasFrame | null;
  skin: (mapId: string) => MapAtlasSkin;
}>;

const EMPTY_SKIN: MapAtlasSkin = Object.freeze({ tiles: [], props: [] });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readSize(value: unknown, path: string, issues: MapAtlasIssue[]) {
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
  issues: MapAtlasIssue[],
): MapAtlasFrame | undefined {
  if (!isRecord(value) || !isRecord(value.rect) || !isRecord(value.anchor)) {
    issues.push({ path, message: "frame은 rect와 anchor를 가진 객체여야 합니다." });
    return undefined;
  }
  const { rect, anchor } = value;
  if (
    !isNonNegativeInteger(rect.x) ||
    !isNonNegativeInteger(rect.y) ||
    !isPositiveInteger(rect.width) ||
    !isPositiveInteger(rect.height)
  ) {
    issues.push({ path: `${path}.rect`, message: "rect 좌표와 크기가 올바르지 않습니다." });
    return undefined;
  }
  if (atlasSize && (rect.x + rect.width > atlasSize.width || rect.y + rect.height > atlasSize.height)) {
    issues.push({ path: `${path}.rect`, message: "frame rect가 atlas 경계를 벗어났습니다." });
    return undefined;
  }
  if (
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
    anchor: { x: anchor.x, y: anchor.y },
  };
}

function readPlacements<Kind extends string>(
  value: unknown,
  path: string,
  allowedKinds: readonly Kind[],
  issues: MapAtlasIssue[],
): readonly MapSkinPlacement<Kind>[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "placement 목록은 배열이어야 합니다." });
    return [];
  }
  const placements: MapSkinPlacement<Kind>[] = [];
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !allowedKinds.includes(item.kind as Kind) ||
      !isRecord(item.position) ||
      !isNonNegativeInteger(item.position.x) ||
      !isNonNegativeInteger(item.position.y)
    ) {
      issues.push({ path: itemPath, message: "placement id, kind, position이 올바르지 않습니다." });
      return;
    }
    placements.push({
      id: item.id,
      kind: item.kind as Kind,
      position: { x: item.position.x, y: item.position.y },
    });
  });
  return placements;
}

function parseManifest(value: unknown): Readonly<{
  manifest?: MapAtlasManifest;
  frames: Partial<Record<MapAtlasKind, MapAtlasFrame>>;
  skins: Readonly<Record<string, MapAtlasSkin>>;
  image?: string;
  issues: MapAtlasIssue[];
}> {
  const issues: MapAtlasIssue[] = [];
  const frames: Partial<Record<MapAtlasKind, MapAtlasFrame>> = {};
  const skins: Record<string, MapAtlasSkin> = {};
  if (!isRecord(value)) {
    return { frames, skins, issues: [{ path: "$", message: "manifest는 객체여야 합니다." }] };
  }
  if (value.version !== 1) issues.push({ path: "version", message: "지원하는 version은 1뿐입니다." });
  const image = typeof value.image === "string" && value.image.trim() ? value.image : undefined;
  if (!image) issues.push({ path: "image", message: "image는 비어 있지 않은 문자열이어야 합니다." });
  const size = readSize(value.size, "size", issues);
  if (!isRecord(value.frames)) {
    issues.push({ path: "frames", message: "frames는 객체여야 합니다." });
  } else {
    Object.keys(value.frames)
      .filter((kind) => !(MAP_ATLAS_KINDS as readonly string[]).includes(kind))
      .forEach((kind) => issues.push({ path: `frames.${kind}`, message: "알 수 없는 map frame입니다." }));
    for (const kind of MAP_ATLAS_KINDS) {
      const frame = readFrame(value.frames[kind], `frames.${kind}`, size, issues);
      if (frame) frames[kind] = frame;
    }
  }
  if (!isRecord(value.skins)) {
    issues.push({ path: "skins", message: "skins는 객체여야 합니다." });
  } else {
    for (const [mapId, skinValue] of Object.entries(value.skins)) {
      if (!mapId || !isRecord(skinValue)) {
        issues.push({ path: `skins.${mapId}`, message: "skin은 객체여야 합니다." });
        continue;
      }
      skins[mapId] = {
        tiles: readPlacements(skinValue.tiles, `skins.${mapId}.tiles`, MAP_SKIN_TILE_KINDS, issues),
        props: readPlacements(skinValue.props, `skins.${mapId}.props`, MAP_SKIN_PROP_KINDS, issues),
      };
    }
  }
  const canonicalRoot = value.version === 1 && image !== undefined && size !== undefined;
  const manifest = issues.length === 0 && image && size
    ? { version: 1 as const, image, size, frames: frames as Record<MapAtlasKind, MapAtlasFrame>, skins }
    : undefined;
  return {
    manifest,
    frames: canonicalRoot ? frames : {},
    skins: canonicalRoot ? skins : {},
    image: canonicalRoot ? image : undefined,
    issues,
  };
}

export function validateMapAtlasManifest(
  value: unknown,
): Readonly<{ ok: true; manifest: MapAtlasManifest } | { ok: false; issues: readonly MapAtlasIssue[] }> {
  const parsed = parseManifest(value);
  return parsed.manifest
    ? { ok: true, manifest: parsed.manifest }
    : { ok: false, issues: parsed.issues };
}

export function createMapAtlasRuntime(value: unknown, manifestUrl: string): MapAtlasRuntime {
  const parsed = parseManifest(value);
  let imageUrl = "";
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
    imageUrl,
    frame: (kind) => parsed.frames[kind] ?? null,
    skin: (mapId) => parsed.skins[mapId] ?? EMPTY_SKIN,
  };
}

export async function loadMapAtlas(
  manifestUrl: string,
  fetchManifest: typeof fetch = fetch,
): Promise<MapAtlasRuntime> {
  try {
    const response = await fetchManifest(manifestUrl);
    if (!response.ok) {
      const runtime = createMapAtlasRuntime(undefined, manifestUrl);
      return {
        ...runtime,
        issues: [{ path: "$", message: `manifest 요청이 실패했습니다: HTTP ${response.status}` }],
      };
    }
    return createMapAtlasRuntime(await response.json(), manifestUrl);
  } catch (error) {
    const runtime = createMapAtlasRuntime(undefined, manifestUrl);
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...runtime,
      issues: [{ path: "$", message: `manifest를 불러오지 못했습니다: ${message}` }],
    };
  }
}
