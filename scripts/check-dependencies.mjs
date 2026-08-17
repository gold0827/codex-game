import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createScanner, SyntaxKind } from "typescript/unstable/ast";

const TARGET_DEPENDENCIES = Object.freeze({
  app: ["app", "presentation", "application", "platform", "authoring", "content"],
  presentation: ["presentation", "application"],
  application: ["application", "domain/operation", "domain/campaign"],
  platform: ["platform", "domain/operation", "domain/campaign"],
  authoring: ["authoring", "domain/campaign"],
  content: ["content", "domain/campaign"],
  "domain/operation": ["domain/operation", "domain/campaign"],
  "domain/campaign": ["domain/campaign"],
});

const MIGRATION_EXCEPTIONS = Object.freeze({
  "ui/CampaignEditor.ts -> campaign/index.ts": "Remove when #75 moves campaign authoring out of presentation.",
  "ui/CampaignEditor.ts -> editor/index.ts": "Remove when #75 moves campaign authoring out of presentation.",
  "ui/CommandRoom.ts -> scenarios/commandRoomScenario.ts": "Remove when #72 replaces the legacy scenario-backed view.",
  "ui/GameApp.ts -> campaign/index.ts": "Remove when #72 introduces the presentation view model.",
  "ui/GameApp.ts -> simulation/simulationTypes.ts": "Remove when #72 introduces the presentation view model.",
  "ui/GameBattlefield.ts -> campaign/index.ts": "Remove when #72 introduces the presentation view model.",
  "ui/GameBattlefield.ts -> simulation/simulationTypes.ts": "Remove when #72 introduces the presentation view model.",
  "ui/GameWorkbench.ts -> campaign/index.ts": "Remove when #75 isolates campaign authoring from the runtime UI.",
  "ui/GameWorkbench.ts -> editor/index.ts": "Remove when #75 isolates campaign authoring from the runtime UI.",
  "ui/TacticalMap.ts -> scenarios/commandRoomScenario.ts": "Remove when #72 replaces the legacy scenario-backed view.",
});

const SOURCE_EXTENSIONS = Object.freeze([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositorySourceRoot = join(projectRoot, "src");

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function samePath(left, right) {
  const normalizeCase = process.platform === "win32"
    ? (value) => value.toLowerCase()
    : (value) => value;
  return normalizeCase(resolve(left)) === normalizeCase(resolve(right));
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function collectSourceFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    compareNames(left.name, right.name))) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.isFile() && isSourceFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function classifyModule(sourceRelativePath) {
  const segments = sourceRelativePath.split("/");
  const [first, second] = segments;

  if (segments.length === 1 && (first === "main.ts" || first === "main.d.ts")) {
    return "app";
  }

  if (first === "domain" && (second === "campaign" || second === "operation")) {
    return `domain/${second}`;
  }

  return {
    app: "app",
    presentation: "presentation",
    application: "application",
    platform: "platform",
    authoring: "authoring",
    content: "content",
    campaign: "domain/campaign",
    simulation: "domain/operation",
    game: "application",
    ui: "presentation",
    styles: "presentation",
    editor: "authoring",
    scenarios: "content",
  }[first] ?? null;
}

function collectModuleSpecifiers(filePath) {
  const source = readFileSync(filePath, "utf8");
  const scanner = createScanner(true, undefined, source);
  const tokens = [];
  const specifiers = [];

  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    tokens.push({ kind, value: scanner.getTokenValue() });
  }

  function addStringLiteralAt(index) {
    if (tokens[index]?.kind === SyntaxKind.StringLiteral) {
      specifiers.push(tokens[index].value);
      return true;
    }
    return false;
  }

  function addFromSpecifier(startIndex) {
    for (let index = startIndex; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.kind === SyntaxKind.SemicolonToken
        || token.kind === SyntaxKind.ImportKeyword
        || token.kind === SyntaxKind.ExportKeyword) {
        return;
      }
      if (token.kind === SyntaxKind.FromKeyword) {
        addStringLiteralAt(index + 1);
        return;
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === SyntaxKind.ImportKeyword) {
      if (tokens[index + 1]?.kind === SyntaxKind.OpenParenToken) {
        addStringLiteralAt(index + 2);
      } else if (!addStringLiteralAt(index + 1)) {
        addFromSpecifier(index + 1);
      }
    } else if (token.kind === SyntaxKind.ExportKeyword) {
      addFromSpecifier(index + 1);
    } else if (token.kind === SyntaxKind.Identifier
      && token.value === "require"
      && tokens[index + 1]?.kind === SyntaxKind.OpenParenToken) {
      addStringLiteralAt(index + 2);
    }
  }

  return specifiers;
}

function candidatePaths(basePath) {
  const candidates = [basePath];
  const extension = extname(basePath);

  if (!extension) {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}${sourceExtension}`);
    }
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(join(basePath, `index${sourceExtension}`));
    }
  } else if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const withoutExtension = basePath.slice(0, -extension.length);
    for (const sourceExtension of [".ts", ".tsx", ".mts", ".cts"]) {
      candidates.push(`${withoutExtension}${sourceExtension}`);
    }
  }

  return candidates;
}

function resolveRelativeImport(importerPath, specifier) {
  const basePath = resolve(dirname(importerPath), specifier);
  for (const candidate of candidatePaths(basePath)) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function allowedDescription(moduleName) {
  return TARGET_DEPENDENCIES[moduleName].join(", ");
}

function checkSourceRoot(sourceRoot) {
  const diagnostics = [];
  const usedMigrationExceptions = new Set();
  let relativeImportCount = 0;

  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    return {
      diagnostics: [`Source root does not exist or is not a directory: ${sourceRoot}`],
      fileCount: 0,
      relativeImportCount,
      migrationExceptionCount: 0,
    };
  }

  const sourceFiles = collectSourceFiles(sourceRoot);
  const enforceRepositoryExceptions = samePath(sourceRoot, repositorySourceRoot);

  for (const importerPath of sourceFiles) {
    const importerRelativePath = normalizePath(relative(sourceRoot, importerPath));
    const importerModule = classifyModule(importerRelativePath);

    if (!importerModule) {
      diagnostics.push(
        `Unclassified source module: ${importerRelativePath}. Rule: every source path must belong to the documented architecture graph.`,
      );
      continue;
    }

    for (const specifier of collectModuleSpecifiers(importerPath)) {
      if (!specifier.startsWith(".")) continue;
      relativeImportCount += 1;

      const importedPath = resolveRelativeImport(importerPath, specifier);
      if (!importedPath) {
        diagnostics.push(
          `Unresolved local dependency: ${importerRelativePath} -> ${specifier}. Rule: relative imports must resolve inside the source root.`,
        );
        continue;
      }

      const importedRelativePath = normalizePath(relative(sourceRoot, importedPath));
      if (isAbsolute(importedRelativePath) || importedRelativePath === ".."
        || importedRelativePath.startsWith("../")) {
        diagnostics.push(
          `Dependency leaves source root: ${importerRelativePath} -> ${importedRelativePath}. Rule: source modules may not reach repository internals by relative import.`,
        );
        continue;
      }

      const importedModule = classifyModule(importedRelativePath);
      if (!importedModule) {
        diagnostics.push(
          `Unclassified imported module: ${importerRelativePath} -> ${importedRelativePath}. Rule: every imported source path must belong to the documented architecture graph.`,
        );
        continue;
      }

      if (TARGET_DEPENDENCIES[importerModule].includes(importedModule)) continue;

      const dependencyKey = `${importerRelativePath} -> ${importedRelativePath}`;
      if (enforceRepositoryExceptions && Object.hasOwn(MIGRATION_EXCEPTIONS, dependencyKey)) {
        usedMigrationExceptions.add(dependencyKey);
        continue;
      }

      diagnostics.push(
        `Dependency direction violation: ${importerRelativePath} [${importerModule}] -> ${importedRelativePath} [${importedModule}] via "${specifier}". Rule: ${importerModule} may depend only on ${allowedDescription(importerModule)}.`,
      );
    }
  }

  if (enforceRepositoryExceptions) {
    for (const [dependencyKey, removalIntent] of Object.entries(MIGRATION_EXCEPTIONS)) {
      if (!usedMigrationExceptions.has(dependencyKey)) {
        diagnostics.push(
          `Stale migration exception: ${dependencyKey}. Rule: remove resolved exceptions from the checker and documentation. ${removalIntent}`,
        );
      }
    }
  }

  return {
    diagnostics,
    fileCount: sourceFiles.length,
    relativeImportCount,
    migrationExceptionCount: usedMigrationExceptions.size,
  };
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return repositorySourceRoot;
  if (arguments_.length === 2 && arguments_[0] === "--source-root") {
    return resolve(process.cwd(), arguments_[1]);
  }

  throw new Error("Usage: node scripts/check-dependencies.mjs [--source-root <directory>]");
}

try {
  const sourceRoot = parseArguments(process.argv.slice(2));
  const result = checkSourceRoot(sourceRoot);

  if (result.diagnostics.length > 0) {
    for (const diagnostic of result.diagnostics) {
      console.error(diagnostic);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Dependency check passed: ${result.fileCount} source files, ${result.relativeImportCount} relative imports, ${result.migrationExceptionCount} migration exceptions.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
