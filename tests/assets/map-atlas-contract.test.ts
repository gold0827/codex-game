// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { readFileSync } from "node:fs";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAP_ATLAS_KINDS,
  createMapAtlasRuntime,
  loadMapAtlas,
  validateMapAtlasManifest,
} from "../../src/presentation/mapAtlas";
import { bridgeDefenseMapSkin } from "../../src/scenarios/bridgeDefenseOperation";

declare const process: Readonly<{ cwd(): string }>;

const productionDirectory = join(
  process.cwd(),
  "public",
  "assets",
  "visual",
  "maps",
  "battlefield",
);

function readProduction(): unknown {
  return JSON.parse(readFileSync(join(productionDirectory, "manifest.json"), "utf8"));
}

describe("battlefield map atlas asset contract", () => {
  it("keeps generated production assets on LF checkouts for byte comparison", () => {
    const attributes = readFileSync(join(process.cwd(), ".gitattributes"), "utf8");

    expect(attributes).toContain("public/assets/visual/maps/battlefield/atlas.svg text eol=lf");
    expect(attributes).toContain("public/assets/visual/maps/battlefield/manifest.json text eol=lf");
  });

  it("accepts every canonical map frame and the authored bridge skin", () => {
    const validation = validateMapAtlasManifest(readProduction());

    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error("production map manifest must be valid");
    expect(Object.keys(validation.manifest.frames)).toEqual(MAP_ATLAS_KINDS);
    expect(validation.manifest.skins[bridgeDefenseMapSkin.id]).toMatchObject({
      tiles: expect.arrayContaining([
        expect.objectContaining({ id: "haein-bridge", kind: "bridge", position: { x: 11, y: 7 } }),
        expect.objectContaining({ id: "north-ford", kind: "ford", position: { x: 11, y: 3 } }),
      ]),
      props: bridgeDefenseMapSkin.landmarks,
    });
    expect(readFileSync(join(productionDirectory, validation.manifest.image), "utf8"))
      .toContain("<title>자율군단 아이소메트릭 battlefield map atlas</title>");
  });

  it("isolates an invalid frame while retaining valid frames and skins", () => {
    const manifest = readProduction() as Record<string, unknown>;
    const frames = manifest.frames as Record<string, unknown>;
    delete frames.water;
    const runtime = createMapAtlasRuntime(
      manifest,
      "https://example.test/assets/visual/maps/battlefield/manifest.json",
    );

    expect(runtime.status).toBe("degraded");
    expect(runtime.frame("water")).toBeNull();
    expect(runtime.frame("bridge")).not.toBeNull();
    expect(runtime.skin(bridgeDefenseMapSkin.id).props).toHaveLength(2);
    expect(runtime.skin("unknown-map")).toEqual({ tiles: [], props: [] });
  });

  it("does not use frames from an incompatible manifest version", () => {
    const manifest = readProduction() as Record<string, unknown>;
    manifest.version = 2;

    const runtime = createMapAtlasRuntime(manifest, "https://example.test/manifest.json");

    expect(runtime.status).toBe("degraded");
    expect(runtime.issues).toContainEqual(expect.objectContaining({ path: "version" }));
    expect(runtime.frame("ground-a")).toBeNull();
    expect(runtime.skin(bridgeDefenseMapSkin.id)).toEqual({ tiles: [], props: [] });
  });

  it("contains loader failures behind a degraded runtime", async () => {
    const runtime = await loadMapAtlas("https://example.test/missing.json", async () => {
      throw new Error("offline");
    });

    expect(runtime.status).toBe("degraded");
    expect(runtime.issues).toEqual([
      { path: "$", message: "manifest를 불러오지 못했습니다: offline" },
    ]);
    expect(runtime.frame("ground-a")).toBeNull();
  });
});
