// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { spawnSync } from "node:child_process";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { tmpdir } from "node:os";
// @ts-expect-error The browser-focused tsconfig omits Node ambient types; this test runs in Node.
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

declare const process: Readonly<{ cwd(): string; execPath: string }>;

const projectRoot = process.cwd();
const checkerPath = join(projectRoot, "scripts", "check-dependencies.mjs");
const temporaryRoots: string[] = [];

function runChecker(arguments_: readonly string[] = []) {
  return spawnSync(process.execPath, [checkerPath, ...arguments_], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

describe("dependency direction checker", () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the repository graph without migration exceptions", () => {
    const result = runChecker();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 migration exceptions");
  });

  it("rejects a new presentation import from the campaign domain", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-game-dependencies-"));
    temporaryRoots.push(fixtureRoot);
    const sourceRoot = join(fixtureRoot, "src");
    const importerPath = join(sourceRoot, "ui", "NewView.ts");
    const importedPath = join(sourceRoot, "campaign", "model.ts");
    mkdirSync(dirname(importerPath), { recursive: true });
    mkdirSync(dirname(importedPath), { recursive: true });
    writeFileSync(importerPath, 'import type { Model } from "../campaign/model";\nexport type ViewModel = Model;\n');
    writeFileSync(importedPath, "export type Model = Readonly<{ id: string }>;\n");

    const result = runChecker(["--source-root", sourceRoot]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ui/NewView.ts [presentation]");
    expect(result.stderr).toContain("campaign/model.ts [domain/campaign]");
    expect(result.stderr).toContain(
      "Rule: presentation may depend only on presentation, application.",
    );
  });

  it("rejects a dynamic import written as a no-substitution template literal", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-game-dependencies-"));
    temporaryRoots.push(fixtureRoot);
    const sourceRoot = join(fixtureRoot, "src");
    const importerPath = join(sourceRoot, "ui", "NewView.ts");
    const importedPath = join(sourceRoot, "campaign", "model.ts");
    mkdirSync(dirname(importerPath), { recursive: true });
    mkdirSync(dirname(importedPath), { recursive: true });
    writeFileSync(importerPath, "void import(`../campaign/model`);\n");
    writeFileSync(importedPath, "export type Model = Readonly<{ id: string }>;\n");

    const result = runChecker(["--source-root", sourceRoot]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ui/NewView.ts [presentation]");
    expect(result.stderr).toContain("campaign/model.ts [domain/campaign]");
    expect(result.stderr).toContain(
      "Rule: presentation may depend only on presentation, application.",
    );
  });
});
