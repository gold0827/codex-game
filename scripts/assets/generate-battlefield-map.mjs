import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAP_ATLAS_KINDS,
} from "../../src/presentation/mapAtlas.ts";
import { bridgeDefenseMapSkin } from "../../src/scenarios/bridgeDefenseOperation.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..");
const recipePath = join(scriptDirectory, "battlefield-map.recipe.json");
const outputDirectory = join(
  projectRoot,
  "public",
  "assets",
  "visual",
  "maps",
  "battlefield",
);

const CELL_WIDTH = 64;
const CELL_HEIGHT = 96;
const ANCHOR = { x: 32, y: 80 };
const PALETTE_KEYS = [
  "outline",
  "ground",
  "groundLight",
  "groundDark",
  "rough",
  "roughLight",
  "water",
  "waterLight",
  "bridge",
  "bridgeLight",
  "canvas",
  "signal",
  "objective",
  "danger",
];

function assertRecipe(recipe) {
  if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) {
    throw new Error("map recipe는 객체여야 합니다.");
  }
  if (recipe.version !== 1) throw new Error("map recipe version은 1이어야 합니다.");
  if (!Number.isInteger(recipe.columns) || recipe.columns < 1) {
    throw new Error("columns는 양의 정수여야 합니다.");
  }
  if (typeof recipe.palette !== "object" || recipe.palette === null) {
    throw new Error("palette는 객체여야 합니다.");
  }
  for (const key of PALETTE_KEYS) {
    if (typeof recipe.palette[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(recipe.palette[key])) {
      throw new Error(`palette.${key}는 6자리 hex 색상이어야 합니다.`);
    }
  }
}

function polygon(points, fill, extra = "") {
  return `<polygon points="${points}" fill="${fill}"${extra}/>`;
}

function rect(x, y, width, height, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${extra}/>`;
}

function path(d, stroke, width = 2, extra = "") {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="square"${extra}/>`;
}

function diamond(fill, outline) {
  return [
    polygon("32,64 63,80 32,95 1,80", outline),
    polygon("32,66 60,80 32,93 4,80", fill),
  ].join("");
}

function frameArtwork(kind, palette) {
  const base = diamond(palette.ground, palette.outline);
  switch (kind) {
    case "ground-a":
      return `${base}${rect(18, 79, 3, 2, palette.groundLight)}${rect(42, 83, 2, 2, palette.groundDark)}`;
    case "ground-b":
      return `${diamond(palette.groundLight, palette.outline)}${path("M11 82L26 89M41 70L53 76", palette.groundDark, 2)}`;
    case "rough":
      return `${diamond(palette.rough, palette.outline)}${path("M8 80L25 88M21 73L43 85M37 70L56 80", palette.roughLight, 3)}`;
    case "blocked":
      return `${diamond(palette.groundDark, palette.outline)}${polygon("15,78 25,61 39,63 51,80 32,89", palette.outline)}${polygon("19,77 27,64 38,66 46,79 32,85", palette.rough)}`;
    case "water":
      return `${diamond(palette.water, palette.outline)}${path("M8 79L21 75L34 79L48 75L57 78M12 85L27 81L40 85L53 82", palette.waterLight, 2)}`;
    case "bridge":
      return `${diamond(palette.water, palette.outline)}${polygon("9,72 22,66 56,83 43,90", palette.outline)}${polygon("12,72 22,68 53,83 43,88", palette.bridge)}${path("M18 69L49 85M13 75L44 90", palette.bridgeLight, 2)}${path("M20 68L11 83M28 72L19 87M37 76L28 91M46 80L38 91", palette.outline, 1)}`;
    case "ford":
      return `${diamond(palette.water, palette.outline)}${polygon("7,75 16,71 58,85 49,90", palette.rough)}${rect(18,75,7,4,palette.roughLight)}${rect(31,80,7,4,palette.roughLight)}${rect(44,84,7,4,palette.roughLight)}`;
    case "spawn":
      return `${base}${path("M12 80L32 70L52 80L32 90Z", palette.signal, 2, ' stroke-dasharray="3 3"')}${rect(30,76,4,8,palette.signal)}`;
    case "destination":
      return `${base}${path("M13 80L32 70L51 80L32 90Z", palette.objective, 2)}${rect(29,77,6,6,palette.objective)}`;
    case "command-post":
      return `${base}${polygon("13,72 31,45 51,72", palette.outline)}${polygon("17,70 31,49 47,70", palette.canvas)}${rect(29,42,3,30,palette.outline)}${rect(32,43,15,9,palette.danger)}${rect(19,70,28,9,palette.groundDark)}${rect(30,70,5,9,palette.outline)}`;
    case "civilian-shelter":
      return `${base}${polygon("11,69 31,48 54,69", palette.outline)}${polygon("16,68 32,52 49,68", palette.canvas)}${rect(16,68,33,11,palette.groundDark)}${rect(28,69,8,10,palette.outline)}${path("M39 57L45 62M39 62L45 57", palette.objective, 2)}`;
    default:
      throw new Error(`지원하지 않는 map frame입니다: ${kind}`);
  }
}

function generate(recipe) {
  assertRecipe(recipe);
  const frames = {};
  const artwork = [];
  MAP_ATLAS_KINDS.forEach((kind, index) => {
    const column = index % recipe.columns;
    const row = Math.floor(index / recipe.columns);
    const x = column * CELL_WIDTH;
    const y = row * CELL_HEIGHT;
    frames[kind] = {
      rect: { x, y, width: CELL_WIDTH, height: CELL_HEIGHT },
      anchor: ANCHOR,
    };
    artwork.push(`<g transform="translate(${x} ${y})">${frameArtwork(kind, recipe.palette)}</g>`);
  });
  const rows = Math.ceil(MAP_ATLAS_KINDS.length / recipe.columns);
  const size = { width: recipe.columns * CELL_WIDTH, height: rows * CELL_HEIGHT };
  const bridgeTiles = [
    ...bridgeDefenseMapSkin.water.map((position, index) => ({
      id: `haein-water-${index}`,
      kind: "water",
      position,
    })),
    ...bridgeDefenseMapSkin.crossings.map(({ id, kind, position }) => ({
      id,
      kind: kind === "bridge" ? "bridge" : "ford",
      position,
    })),
  ];
  const manifest = `${JSON.stringify({
    version: 1,
    image: "atlas.svg",
    size,
    frames,
    skins: {
      [bridgeDefenseMapSkin.id]: {
        tiles: bridgeTiles,
        props: bridgeDefenseMapSkin.landmarks,
      },
    },
  }, null, 2)}\n`;
  const atlas = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" shape-rendering="crispEdges">`,
    "  <title>자율군단 아이소메트릭 battlefield map atlas</title>",
    ...artwork.map((frame) => `  ${frame}`),
    "</svg>",
    "",
  ].join("\n");
  return { "atlas.svg": atlas, "manifest.json": manifest };
}

async function main() {
  const recipe = JSON.parse(await readFile(recipePath, "utf8"));
  const generated = generate(recipe);
  const check = process.argv.includes("--check");
  if (check) {
    const stale = [];
    for (const [filename, content] of Object.entries(generated)) {
      try {
        if (await readFile(join(outputDirectory, filename), "utf8") !== content) stale.push(filename);
      } catch {
        stale.push(filename);
      }
    }
    if (stale.length > 0) {
      throw new Error(`map 산출물이 없거나 오래되었습니다: ${stale.join(", ")}`);
    }
    console.log("production map 산출물이 recipe와 일치합니다.");
    return;
  }
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(Object.entries(generated).map(([filename, content]) => (
    writeFile(join(outputDirectory, filename), content, "utf8")
  )));
  console.log(`production map atlas를 생성했습니다: ${outputDirectory}`);
}

await main();
