import {
  parseCampaignJson,
  parseCampaignValue,
  type CampaignDefinition,
  type CampaignParseDiagnostic,
  type CampaignScene,
} from "../campaign";

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CampaignDocumentOptions {
  readonly storage?: CampaignStorage;
  readonly storageKey?: string;
}

export type CampaignDocumentDiagnostic =
  | CampaignParseDiagnostic
  | Readonly<{
      kind: "scene";
      code: "unknown-scene" | "scene-id-mismatch";
      path: string;
      message: string;
    }>
  | Readonly<{
      kind: "storage";
      code: "storage-read" | "storage-write" | "storage-remove";
      path: string;
      message: string;
    }>;

export type CampaignDocumentResult =
  | Readonly<{ ok: true; value: CampaignDefinition }>
  | Readonly<{
      ok: false;
      diagnostics: readonly CampaignDocumentDiagnostic[];
    }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CampaignDocument {
  readonly #authoredSource: CampaignDefinition;
  readonly #storage: CampaignStorage | undefined;
  readonly #storageKey: string;
  #current: CampaignDefinition;

  constructor(
    authoredSource: CampaignDefinition,
    options: CampaignDocumentOptions = {},
  ) {
    const parsed = parseCampaignValue(authoredSource);
    if (!parsed.ok) {
      throw new TypeError(
        `Authored campaign is invalid: ${parsed.diagnostics
          .map(({ path, message }) => `${path}: ${message}`)
          .join("; ")}`,
      );
    }
    this.#authoredSource = structuredClone(parsed.value);
    this.#current = structuredClone(parsed.value);
    this.#storage = options.storage;
    this.#storageKey = options.storageKey ?? `campaign-document:${parsed.value.id}`;
  }

  #success(): CampaignDocumentResult {
    return { ok: true, value: this.snapshot() };
  }

  snapshot(): CampaignDefinition {
    return structuredClone(this.#current);
  }

  listScenes(): readonly CampaignScene[] {
    return structuredClone(this.#current.scenes);
  }

  scene(sceneId: string): CampaignScene | undefined {
    const scene = this.#current.scenes.find(
      (candidate) => candidate.identity.id === sceneId,
    );
    return scene ? structuredClone(scene) : undefined;
  }

  replaceScene(sceneId: string, replacement: unknown): CampaignDocumentResult {
    const sceneIndex = this.#current.scenes.findIndex(
      (scene) => scene.identity.id === sceneId,
    );
    if (sceneIndex < 0) {
      return {
        ok: false,
        diagnostics: [
          {
            kind: "scene",
            code: "unknown-scene",
            path: "scenes",
            message: `Scene "${sceneId}" does not exist.`,
          },
        ],
      };
    }

    const replacementId =
      typeof replacement === "object" &&
      replacement !== null &&
      "identity" in replacement &&
      typeof replacement.identity === "object" &&
      replacement.identity !== null &&
      "id" in replacement.identity
        ? replacement.identity.id
        : undefined;
    if (replacementId !== undefined && replacementId !== sceneId) {
      return {
        ok: false,
        diagnostics: [
          {
            kind: "scene",
            code: "scene-id-mismatch",
            path: `scenes[${sceneIndex}].identity.id`,
            message: `Replacement scene identifier must remain "${sceneId}".`,
          },
        ],
      };
    }

    const candidate = this.snapshot();
    (candidate.scenes as CampaignScene[])[sceneIndex] = replacement as CampaignScene;
    const parsed = parseCampaignValue(candidate);
    if (!parsed.ok) return parsed;
    this.#current = parsed.value;
    return this.#success();
  }

  exportJson(): string {
    return `${JSON.stringify(this.#current, null, 2)}\n`;
  }

  importJson(source: string): CampaignDocumentResult {
    const parsed = parseCampaignJson(source);
    if (!parsed.ok) return parsed;
    this.#current = parsed.value;
    return this.#success();
  }

  save(): CampaignDocumentResult {
    if (!this.#storage) return this.#success();
    try {
      this.#storage.setItem(this.#storageKey, this.exportJson());
      return this.#success();
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          {
            kind: "storage",
            code: "storage-write",
            path: this.#storageKey,
            message: errorMessage(error),
          },
        ],
      };
    }
  }

  load(): CampaignDocumentResult {
    if (!this.#storage) return this.#success();
    let stored: string | null;
    try {
      stored = this.#storage.getItem(this.#storageKey);
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          {
            kind: "storage",
            code: "storage-read",
            path: this.#storageKey,
            message: errorMessage(error),
          },
        ],
      };
    }
    if (stored === null) return this.#success();
    return this.importJson(stored);
  }

  restore(): CampaignDocumentResult {
    if (this.#storage) {
      try {
        this.#storage.removeItem(this.#storageKey);
      } catch (error) {
        return {
          ok: false,
          diagnostics: [
            {
              kind: "storage",
              code: "storage-remove",
              path: this.#storageKey,
              message: errorMessage(error),
            },
          ],
        };
      }
    }
    this.#current = structuredClone(this.#authoredSource);
    return this.#success();
  }
}

export function createCampaignDocument(
  authoredSource: CampaignDefinition,
  options?: CampaignDocumentOptions,
): CampaignDocument {
  return new CampaignDocument(authoredSource, options);
}
