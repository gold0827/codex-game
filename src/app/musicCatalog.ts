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
    id: "two-blinks-march",
    title: "SpacyLoop",
    author: "ElectronicFreaker",
    assetPath: "assets/audio/bgm/two-blinks-march.ogg",
    sha256: "7a8784fc40e106b93b518a755a0c9c2729e8dc3948c6eaba0b4c5a745f6fbfdd",
    sourcePageUrl: "https://opengameart.org/content/spacyloop",
    sourceFileUrl: "https://opengameart.org/sites/default/files/SpacyLoop.ogg",
    originalFilename: "SpacyLoop.ogg",
    volume: 0.12,
  }),
  soundtrack({
    id: "convoy-in-the-rain",
    title: "Lonely Night",
    author: "Centurion_of_war",
    assetPath: "assets/audio/bgm/convoy-in-the-rain.ogg",
    sha256: "ef0f3c69e41ee1aad842fdd98735c0b544c2ae68e554bf86aa9f032a27a71464",
    sourcePageUrl: "https://opengameart.org/content/lonely-night",
    sourceFileUrl: "https://opengameart.org/sites/default/files/night_tune3_0.ogg",
    originalFilename: "night_tune3.ogg",
    volume: 0.11,
  }),
  soundtrack({
    id: "courteous-cannonade",
    title: "War Theme (version 2)",
    author: "Spring Spring",
    assetPath: "assets/audio/bgm/courteous-cannonade.ogg",
    sha256: "1291731b7f99e58655954e5e6d1f256dc522601664bcd9c3d9d0d4618f020d3e",
    sourcePageUrl: "https://opengameart.org/content/war-theme",
    sourceFileUrl: "https://opengameart.org/sites/default/files/war%20theme%20ver%202_0.ogg",
    originalFilename: "war theme ver 2.ogg",
    volume: 0.1,
  }),
  soundtrack({
    id: "stamp-and-march",
    title: "Raiders March",
    author: "Bobjt",
    assetPath: "assets/audio/bgm/stamp-and-march.ogg",
    sha256: "49dd9f7a6ae995d9af8c85fc205daf21e41c42df8b36b8e3556b8a31aa222969",
    sourcePageUrl: "https://opengameart.org/content/raiders-march",
    sourceFileUrl: "https://opengameart.org/sites/default/files/raiders_march_-_loop.ogg",
    originalFilename: "raiders_march_-_loop.ogg",
    volume: 0.1,
  }),
  soundtrack({
    id: "crossed-wires-nocturne",
    title: "Insistent",
    author: "yd",
    assetPath: "assets/audio/bgm/crossed-wires-nocturne.ogg",
    sha256: "c5e0eccb09379301c56e95c6b6586e842be0ef363938b8d1062518280da99cfb",
    sourcePageUrl: "https://opengameart.org/content/insistent-background-loop",
    sourceFileUrl: "https://opengameart.org/sites/default/files/Insistent.ogg",
    originalFilename: "Insistent.ogg",
    volume: 0.12,
  }),
  soundtrack({
    id: "apples-under-fire",
    title: "Great Boss",
    author: "Spring Spring",
    assetPath: "assets/audio/bgm/apples-under-fire.ogg",
    sha256: "5a9eaa1236c36efbdf36c5b576c722057d8a7177f8277fd42105e013eaf19aac",
    sourcePageUrl: "https://opengameart.org/content/great-boss",
    sourceFileUrl: "https://opengameart.org/sites/default/files/Great%20Boss.ogg",
    originalFilename: "Great Boss.ogg",
    volume: 0.1,
  }),
  soundtrack({
    id: "basil-on-the-sill",
    title: "Sunset Walk",
    author: "KiluaBoy",
    assetPath: "assets/audio/bgm/basil-on-the-sill.ogg",
    sha256: "1d230721e6200276065b913e44943d0e0503af88fc2dd793be1249738e06d98c",
    sourcePageUrl: "https://opengameart.org/content/sunset-walk-ambient-quiet-sweet-loop",
    sourceFileUrl: "https://opengameart.org/sites/default/files/SunsetWalk.ogg",
    originalFilename: "SunsetWalk.ogg",
    volume: 0.11,
  }),
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
