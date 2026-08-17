import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  SPRITE_ACTIONS,
  SPRITE_FACINGS,
} from "../../src/presentation/spriteAtlas.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..");
const recipePath = join(scriptDirectory, "officer-sprites.recipe.json");
const outputDirectory = join(
  projectRoot,
  "public",
  "assets",
  "visual",
  "sprites",
  "officers",
);

const CELL_SIZE = 48;

const FACING_METADATA = {
  north: { vector: [0, -1], angle: -90 },
  "north-east": { vector: [1, -1], angle: -45 },
  east: { vector: [1, 0], angle: 0 },
  "south-east": { vector: [1, 1], angle: 45 },
  south: { vector: [0, 1], angle: 90 },
  "south-west": { vector: [-1, 1], angle: 135 },
  west: { vector: [-1, 0], angle: 180 },
  "north-west": { vector: [-1, -1], angle: -135 },
};

const PALETTE_KEYS = [
  "outline",
  "shadow",
  "uniformDark",
  "uniform",
  "uniformLight",
  "skin",
  "helmet",
  "visor",
  "equipment",
  "danger",
  "signal",
];

function assertFacingMetadata() {
  const metadataKeys = Object.keys(FACING_METADATA);
  const missing = SPRITE_FACINGS.filter((facing) => !metadataKeys.includes(facing));
  const unknown = metadataKeys.filter((facing) => !SPRITE_FACINGS.includes(facing));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `facing metadata가 canonical 계약과 다릅니다. missing=${missing.join(",")} unknown=${unknown.join(",")}`,
    );
  }
}

function assertRecipe(recipe) {
  if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) {
    throw new Error("recipe는 객체여야 합니다.");
  }
  if (recipe.version !== 1) throw new Error("recipe version은 1이어야 합니다.");
  if (!Number.isInteger(recipe.columns) || recipe.columns < 1) {
    throw new Error("columns는 양의 정수여야 합니다.");
  }
  if (
    typeof recipe.anchor !== "object" ||
    recipe.anchor === null ||
    !Number.isInteger(recipe.anchor.x) ||
    !Number.isInteger(recipe.anchor.y) ||
    recipe.anchor.x < 0 ||
    recipe.anchor.x > CELL_SIZE ||
    recipe.anchor.y < 0 ||
    recipe.anchor.y > CELL_SIZE
  ) {
    throw new Error("anchor x/y는 cell 안의 정수여야 합니다.");
  }
  if (typeof recipe.animations !== "object" || recipe.animations === null) {
    throw new Error("animations는 객체여야 합니다.");
  }
  const unknownActions = Object.keys(recipe.animations).filter(
    (action) => !SPRITE_ACTIONS.includes(action),
  );
  if (unknownActions.length > 0) {
    throw new Error(`알 수 없는 animation입니다: ${unknownActions.join(", ")}`);
  }
  for (const action of SPRITE_ACTIONS) {
    const durations = recipe.animations[action];
    if (!Array.isArray(durations) || durations.length === 0) {
      throw new Error(`${action} animation에는 frame이 하나 이상 필요합니다.`);
    }
    if (durations.some((duration) => !Number.isInteger(duration) || duration <= 0)) {
      throw new Error(`${action} duration은 양의 정수여야 합니다.`);
    }
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

function rect(x, y, width, height, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${extra}/>`;
}

function line(x1, y1, x2, y2, color, width = 2) {
  return `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="square"/>`;
}

function standingSprite(action, facing, frameIndex, frameCount, palette) {
  const [dx, dy] = FACING_METADATA[facing].vector;
  const phase = frameCount === 1 ? 0 : frameIndex / frameCount;
  const step = action === "walk" || action === "panic"
    ? Math.round(Math.sin(phase * Math.PI * 2) * 2)
    : 0;
  const bob = action === "idle"
    ? frameIndex % 2
    : action === "walk" || action === "panic"
      ? Math.abs(step) === 2 ? 1 : 0
      : 0;
  const recoil = action === "attack" && frameIndex === 1 ? 1 : 0;
  const hurtLean = action === "hurt" && frameIndex === 0 ? -dx * 2 : 0;
  const centerX = 24 + hurtLean - dx * recoil;
  const top = 9 + bob;
  const frontX = dx * 3;
  const frontY = dy * 2;
  const parts = [];

  parts.push(rect(16, 39, 16, 2, palette.shadow, ' opacity=".55"'));
  parts.push(rect(19, 37, 10, 5, palette.shadow, ' opacity=".55"'));

  const leftLegX = centerX - 6 + (step > 0 ? 1 : 0);
  const rightLegX = centerX + 2 - (step < 0 ? 1 : 0);
  parts.push(rect(leftLegX, top + 27 + Math.max(0, -step), 4, 9 - Math.max(0, -step), palette.outline));
  parts.push(rect(rightLegX, top + 27 + Math.max(0, step), 4, 9 - Math.max(0, step), palette.outline));
  parts.push(rect(leftLegX + 1, top + 27, 3, 6, palette.uniformDark));
  parts.push(rect(rightLegX, top + 27, 3, 6, palette.uniformDark));

  parts.push(rect(centerX - 8, top + 12, 16, 17, palette.outline));
  parts.push(rect(centerX - 6, top + 13, 12, 14, palette.uniform));
  parts.push(rect(centerX - 4 - dx, top + 17 - dy, 8, 7, palette.uniformDark));
  parts.push(rect(centerX - 1 + frontX, top + 19 + frontY, 3, 5, palette.equipment));

  const headX = centerX - 5 + dx;
  const headY = top + 4 + dy;
  parts.push(rect(headX - 1, headY - 1, 12, 10, palette.outline));
  parts.push(rect(headX, headY, 10, 8, palette.skin));
  parts.push(rect(headX - 1, headY - 2, 12, 5, palette.helmet));
  parts.push(rect(headX + 2 + dx * 3, headY + 3 + dy * 2, 5, 2, palette.visor));

  const shoulderY = top + 15;
  if (action === "panic") {
    parts.push(line(centerX - 6, shoulderY, centerX - 10, shoulderY - 8, palette.uniformLight, 4));
    parts.push(line(centerX + 6, shoulderY, centerX + 10, shoulderY - 8, palette.uniformLight, 4));
    if (frameIndex % 2 === 0) {
      parts.push(rect(centerX - 1, top - 2, 3, 5, palette.danger));
      parts.push(rect(centerX - 1, top + 4, 3, 2, palette.danger));
    }
  } else {
    parts.push(rect(centerX - 11, shoulderY, 4, 12, palette.outline));
    parts.push(rect(centerX + 7, shoulderY, 4, 12, palette.outline));
    parts.push(rect(centerX - 10, shoulderY + 1, 3, 9, palette.uniformLight));
    parts.push(rect(centerX + 7, shoulderY + 1, 3, 9, palette.uniformLight));
  }

  if (action === "attack") {
    const muzzleX = centerX + dx * (14 + frameIndex * 2);
    const muzzleY = top + 20 + dy * (8 + frameIndex);
    parts.push(line(centerX + dx * 3, top + 20 + dy * 2, muzzleX, muzzleY, palette.outline, 4));
    parts.push(line(centerX + dx * 5, top + 19 + dy * 2, muzzleX, muzzleY, palette.equipment, 2));
    if (frameIndex === 1) {
      parts.push(rect(muzzleX - 2, muzzleY - 2, 5, 5, palette.danger));
      parts.push(rect(muzzleX - 4, muzzleY, 9, 1, palette.equipment));
    }
  }

  if (action === "inspect") {
    const toolX = centerX + dx * 7;
    const toolY = top + 9 + dy * 4;
    parts.push(rect(toolX - 4, toolY - 2, 3, 4, palette.outline));
    parts.push(rect(toolX + 1, toolY - 2, 3, 4, palette.outline));
    parts.push(rect(toolX - 3, toolY - 1, 2, 2, palette.visor));
    parts.push(rect(toolX + 2, toolY - 1, 2, 2, palette.visor));
    if (frameIndex === 2) parts.push(rect(toolX - 5, toolY + 4, 10, 2, palette.signal));
  }

  if (action === "broadcast") {
    const radioX = centerX - dx * 7 - 2;
    const radioY = top + 17 - dy * 4;
    parts.push(rect(radioX, radioY, 5, 8, palette.outline));
    parts.push(rect(radioX + 1, radioY + 1, 3, 5, palette.equipment));
    parts.push(line(radioX + 3, radioY, radioX + 3 - dx * 2, radioY - 7, palette.signal, 1));
    if (frameIndex > 0) {
      const wave = frameIndex * 2;
      parts.push(line(centerX + dx * 9 - wave, top + 3 + dy * 5, centerX + dx * 9 + wave, top + 3 + dy * 5, palette.signal, 1));
    }
  }

  if (action === "hurt" && frameIndex === 0) {
    parts.push(line(centerX - 10, top + 8, centerX + 10, top + 28, palette.danger, 2));
    parts.push(line(centerX + 8, top + 6, centerX - 8, top + 30, palette.danger, 2));
  }

  return parts.join("");
}

function downSprite(facing, palette) {
  const angle = FACING_METADATA[facing].angle;
  const parts = [
    rect(12, 38, 24, 3, palette.shadow, ' opacity=".6"'),
    `<g transform="rotate(${angle} 24 35)">`,
    rect(12, 32, 23, 7, palette.outline),
    rect(14, 31, 16, 6, palette.uniformDark),
    rect(31, 30, 7, 8, palette.outline),
    rect(32, 31, 5, 6, palette.skin),
    rect(31, 30, 7, 3, palette.helmet),
    rect(18, 34, 8, 3, palette.equipment),
    "</g>",
  ];
  return parts.join("");
}

function sprite(action, facing, frameIndex, frameCount, palette) {
  return action === "down"
    ? downSprite(facing, palette)
    : standingSprite(action, facing, frameIndex, frameCount, palette);
}

function generate(recipe) {
  assertFacingMetadata();
  assertRecipe(recipe);
  const frames = [];
  const animations = {};
  let frameNumber = 0;

  for (const action of SPRITE_ACTIONS) {
    animations[action] = {};
    const durations = recipe.animations[action];
    for (const facing of SPRITE_FACINGS) {
      animations[action][facing] = durations.map((durationMs, frameIndex) => {
        const column = frameNumber % recipe.columns;
        const row = Math.floor(frameNumber / recipe.columns);
        const x = column * CELL_SIZE;
        const y = row * CELL_SIZE;
        frames.push(
          `<g transform="translate(${x} ${y})">${sprite(action, facing, frameIndex, durations.length, recipe.palette)}</g>`,
        );
        frameNumber += 1;
        return {
          rect: { x, y, width: CELL_SIZE, height: CELL_SIZE },
          durationMs,
          anchor: recipe.anchor,
        };
      });
    }
  }

  const rows = Math.ceil(frameNumber / recipe.columns);
  const size = {
    width: recipe.columns * CELL_SIZE,
    height: rows * CELL_SIZE,
  };
  const manifest = `${JSON.stringify({
    version: 1,
    image: "atlas.svg",
    size,
    animations,
  }, null, 2)}\n`;
  const atlas = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" shape-rendering="crispEdges">`,
    "  <title>자율군단 장교 production sprite atlas</title>",
    ...frames.map((frame) => `  ${frame}`),
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
      throw new Error(`sprite 산출물이 없거나 오래되었습니다: ${stale.join(", ")}`);
    }
    console.log("production sprite 산출물이 recipe와 일치합니다.");
    return;
  }

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(Object.entries(generated).map(([filename, content]) => (
    writeFile(join(outputDirectory, filename), content, "utf8")
  )));
  console.log(`production sprite atlas를 생성했습니다: ${outputDirectory}`);
}

await main();
