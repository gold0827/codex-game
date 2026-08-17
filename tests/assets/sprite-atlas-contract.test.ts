// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { readFileSync } from "node:fs";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SPRITE_ACTIONS,
  SPRITE_FACINGS,
  createSpriteAtlasRuntime,
  loadSpriteAtlas,
  validateSpriteAtlasManifest,
} from "../../src/presentation/spriteAtlas";

declare const process: Readonly<{ cwd(): string }>;

const fixtureDirectory = join(
  process.cwd(),
  "public",
  "assets",
  "visual",
  "sprites",
  "fixture",
);

const productionDirectory = join(
  process.cwd(),
  "public",
  "assets",
  "visual",
  "sprites",
  "officers",
);

function readFixture(): unknown {
  return JSON.parse(readFileSync(join(fixtureDirectory, "manifest.json"), "utf8"));
}

describe("sprite atlas asset contract", () => {
  it("keeps generated production assets on LF checkouts for byte comparison", () => {
    const attributes = readFileSync(join(process.cwd(), ".gitattributes"), "utf8");

    expect(attributes).toContain(
      "public/assets/visual/sprites/officers/atlas.svg text eol=lf",
    );
    expect(attributes).toContain(
      "public/assets/visual/sprites/officers/manifest.json text eol=lf",
    );
  });

  it("accepts the generated production officer atlas", () => {
    const manifest = JSON.parse(
      readFileSync(join(productionDirectory, "manifest.json"), "utf8"),
    ) as unknown;
    const validation = validateSpriteAtlasManifest(manifest);

    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error("production sprite manifest must be valid");
    expect(readFileSync(join(productionDirectory, validation.manifest.image), "utf8")).toContain(
      '<title>자율군단 장교 production sprite atlas</title>',
    );
  });

  it("accepts the canonical fixture with every action and eight-direction facing", () => {
    const validation = validateSpriteAtlasManifest(readFixture());

    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error("fixture manifest must be valid");
    expect(Object.keys(validation.manifest.animations)).toEqual(SPRITE_ACTIONS);
    for (const action of SPRITE_ACTIONS) {
      expect(Object.keys(validation.manifest.animations[action])).toEqual(SPRITE_FACINGS);
    }
    expect(readFileSync(join(fixtureDirectory, validation.manifest.image), "utf8")).toContain(
      'viewBox="0 0 128 128"',
    );
  });

  it("samples manifest-defined rect, duration, facing, and anchor without inferring a grid", () => {
    const fixture = readFixture() as Record<string, unknown>;
    const animations = fixture.animations as Record<string, Record<string, unknown[]>>;
    animations.walk.east = [
      { rect: { x: 67, y: 19, width: 7, height: 11 }, durationMs: 40, anchor: { x: 2, y: 9 } },
      { rect: { x: 81, y: 23, width: 9, height: 13 }, durationMs: 60, anchor: { x: 4, y: 12 } },
    ];
    const runtime = createSpriteAtlasRuntime(
      fixture,
      "https://example.test/assets/visual/sprites/fixture/manifest.json",
    );

    expect(runtime.status).toBe("ready");
    expect(runtime.sample("walk", "east", 39)).toMatchObject({
      frameIndex: 0,
      placeholder: false,
      frame: { rect: { x: 67, y: 19, width: 7, height: 11 }, durationMs: 40, anchor: { x: 2, y: 9 } },
    });
    expect(runtime.sample("walk", "east", 40)).toMatchObject({
      frameIndex: 1,
      frame: { rect: { x: 81, y: 23, width: 9, height: 13 }, durationMs: 60, anchor: { x: 4, y: 12 } },
    });
    expect(runtime.sample("walk", "east", 100).frameIndex).toBe(0);
  });

  it("rejects a missing direction but isolates it behind a placeholder frame", () => {
    const fixture = readFixture() as Record<string, unknown>;
    const animations = fixture.animations as Record<string, Record<string, unknown>>;
    delete animations.down["north-west"];

    const validation = validateSpriteAtlasManifest(fixture);
    const runtime = createSpriteAtlasRuntime(
      fixture,
      "https://example.test/assets/visual/sprites/fixture/manifest.json",
    );

    expect(validation).toMatchObject({
      ok: false,
      issues: [{ path: "animations.down.north-west" }],
    });
    expect(runtime.status).toBe("degraded");
    expect(runtime.sample("down", "north-west", 0)).toMatchObject({ placeholder: true });
    expect(runtime.sample("idle", "north", 0)).toMatchObject({
      placeholder: false,
      imageUrl: "https://example.test/assets/visual/sprites/fixture/atlas.svg",
    });
  });

  it("does not sample an incompatible manifest version", () => {
    const fixture = readFixture() as Record<string, unknown>;
    fixture.version = 2;

    const validation = validateSpriteAtlasManifest(fixture);
    const runtime = createSpriteAtlasRuntime(fixture, "https://example.test/manifest.json");

    expect(validation).toMatchObject({
      ok: false,
      issues: [{ path: "version" }],
    });
    expect(runtime.status).toBe("degraded");
    expect(runtime.sample("idle", "north", 0).placeholder).toBe(true);
  });

  it("contains malformed frames and loader failures without rejecting", async () => {
    const fixture = readFixture() as Record<string, unknown>;
    const animations = fixture.animations as Record<string, Record<string, unknown[]>>;
    animations.attack.south = [
      { rect: { x: 127, y: 0, width: 16, height: 16 }, durationMs: 0, anchor: { x: 8, y: 15 } },
    ];
    const malformed = createSpriteAtlasRuntime(fixture, "https://example.test/manifest.json");
    const unavailable = await loadSpriteAtlas("https://example.test/missing.json", async () => {
      throw new Error("offline");
    });

    expect(malformed.status).toBe("degraded");
    expect(malformed.sample("attack", "south", 0).placeholder).toBe(true);
    expect(malformed.sample("attack", "north", 0).placeholder).toBe(false);
    expect(unavailable.status).toBe("degraded");
    expect(unavailable.issues).toEqual([
      { path: "$", message: "manifest를 불러오지 못했습니다: offline" },
    ]);
    expect(unavailable.sample("idle", "north", 0).placeholder).toBe(true);
  });
});
