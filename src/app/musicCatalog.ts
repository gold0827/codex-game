import type { BrowserSoundtrack } from "../platform/browser/adapters";

export type ProductionSoundtrack = BrowserSoundtrack & Readonly<{
  title: string;
  author: string;
  assetPath: string;
  sha256: string;
  sourcePageUrl: string;
  sourceFileUrl: string;
  originalFilename: string;
  license: "CC0-1.0";
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/";
}>;

const license = "CC0-1.0" as const;
const licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/" as const;

function soundtrack(
  entry: Omit<ProductionSoundtrack, "src" | "license" | "licenseUrl">,
): ProductionSoundtrack {
  return {
    ...entry,
    src: `${import.meta.env.BASE_URL}${entry.assetPath}`,
    license,
    licenseUrl,
  };
}

export const productionSoundtrackCatalog = [
  soundtrack({
    id: "six-signals-over-water",
    title: "On Patrol",
    author: "section31",
    assetPath: "assets/audio/bgm/six-signals-over-water.ogg",
    sha256: "4c681d3651a7178d797ee0a74f44a15f6d84f2233250d2a82dcd157b539ab87a",
    sourcePageUrl: "https://opengameart.org/content/on-patrol",
    sourceFileUrl: "https://opengameart.org/sites/default/files/S31-On%20Patrol.ogg",
    originalFilename: "S31-On Patrol.ogg",
    volume: 0.1,
  }),
  soundtrack({
    id: "quiet-water-after-action",
    title: "Forest Ambience",
    author: "TinyWorlds",
    assetPath: "assets/audio/bgm/quiet-water-after-action.mp3",
    sha256: "9850aa1d0d5d66bd9c5daf8bb77c6d852e01f2f4de22f283bd5621e8bed13b75",
    sourcePageUrl: "https://opengameart.org/content/forest-ambience",
    sourceFileUrl: "https://opengameart.org/sites/default/files/Forest_Ambience.mp3",
    originalFilename: "Forest_Ambience.mp3",
    volume: 0.12,
  }),
] as const satisfies readonly ProductionSoundtrack[];
