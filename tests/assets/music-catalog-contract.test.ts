// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { createHash } from "node:crypto";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { readFileSync } from "node:fs";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { productionSoundtrackCatalog } from "../../src/app/musicCatalog";
import { bridgeDefenseCampaign } from "../../src/scenarios/bridgeDefenseOperation";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

declare const process: Readonly<{ cwd(): string }>;

const productionSoundtrackIds = new Set(
  [...completeCampaign.scenes, ...bridgeDefenseCampaign.scenes]
    .map(({ presentation }) => presentation.soundtrackId),
);

describe("production music catalog", () => {
  it("covers every built-in soundtrack exactly once", () => {
    const catalogIds = productionSoundtrackCatalog.map(({ id }) => id);

    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect([...catalogIds].sort()).toEqual([...productionSoundtrackIds].sort());
  });

  it("pins every distributed CC0 asset to its source and SHA-256", () => {
    productionSoundtrackCatalog.forEach((soundtrack) => {
      const bytes = readFileSync(join(process.cwd(), "public", soundtrack.assetPath));
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      expect(sha256).toBe(soundtrack.sha256);
      expect(soundtrack.license).toBe("CC0-1.0");
      expect(soundtrack.licenseUrl).toBe(
        "https://creativecommons.org/publicdomain/zero/1.0/",
      );
      expect(soundtrack.sourcePageUrl).toMatch(/^https:\/\/opengameart\.org\/content\//);
      expect(soundtrack.sourceFileUrl).toMatch(
        /^https:\/\/opengameart\.org\/sites\/default\/files\//,
      );
      expect(soundtrack.originalFilename.length).toBeGreaterThan(4);
      expect(soundtrack.author.length).toBeGreaterThan(0);
    });
  });
});
