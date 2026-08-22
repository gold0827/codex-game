import type { CampaignDefinition, CampaignRole, CampaignScene } from "./types";
import {
  createCampaignProgress,
  type CampaignProgressSnapshot,
} from "./progress";

export type CampaignRunStatus = "operation" | "lesson" | "complete";

export type RoleLesson = Readonly<{
  id: string;
  roleId: string;
  summary: string;
}>;

export type RoleLessonMemory = Readonly<{
  roleId: string;
  lessons: readonly RoleLesson[];
}>;

export type OperationLaunch = Readonly<{
  campaignId: string;
  scene: CampaignScene;
  roles: readonly CampaignRole[];
  seed: string;
  roleMemory: readonly RoleLessonMemory[];
}>;

export type OperationResult = Readonly<{
  sceneId: string;
  status: "success" | "retry";
  outcomeId: string;
  lessonChoices: readonly RoleLesson[];
}>;

export type CampaignLessonChoice = Readonly<{
  lessonId: string;
}>;

export type CampaignRunSnapshot = Readonly<{
  status: CampaignRunStatus;
  progress: CampaignProgressSnapshot;
  attemptNumber: number;
  launch: OperationLaunch | null;
  roleMemory: readonly RoleLessonMemory[];
  lessonChoices: readonly RoleLesson[];
}>;

export type CampaignRun = Readonly<{
  read: () => CampaignRunSnapshot;
  decide: (choice: CampaignLessonChoice) => CampaignRunSnapshot;
  resolve: (result: OperationResult) => CampaignRunSnapshot;
}>;

export class CampaignRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignRunError";
  }
}

const LESSON_LIMIT = 2;

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function assertSeed(seed: string | number): void {
  if (
    (typeof seed !== "string" && typeof seed !== "number") ||
    (typeof seed === "number" && !Number.isFinite(seed))
  ) {
    throw new CampaignRunError("Campaign run seed must be a string or finite number.");
  }
}

function operationSeed(
  campaignId: string,
  sceneId: string,
  baseSeed: string | number,
): string {
  return JSON.stringify([campaignId, sceneId, typeof baseSeed, baseSeed]);
}

function validateMemory(
  roles: readonly CampaignRole[],
  supplied: readonly RoleLessonMemory[],
): Map<string, RoleLesson[]> {
  const roleIds = new Set(roles.map(({ id }) => id));
  const memory = new Map(roles.map(({ id }) => [id, [] as RoleLesson[]]));
  const seenRoles = new Set<string>();

  supplied.forEach((entry) => {
    if (!roleIds.has(entry.roleId)) {
      throw new CampaignRunError(`Memory references unknown role "${entry.roleId}".`);
    }
    if (seenRoles.has(entry.roleId)) {
      throw new CampaignRunError(`Memory repeats role "${entry.roleId}".`);
    }
    seenRoles.add(entry.roleId);
    entry.lessons.forEach((lesson) => validateLesson(lesson, roleIds));
    if (entry.lessons.some(({ roleId }) => roleId !== entry.roleId)) {
      throw new CampaignRunError("A lesson must belong to its enclosing role memory.");
    }
    memory.set(entry.roleId, clone(entry.lessons.slice(-LESSON_LIMIT)));
  });

  return memory;
}

function validateLesson(lesson: RoleLesson, roleIds: ReadonlySet<string>): void {
  if (!lesson.id.trim() || !lesson.summary.trim()) {
    throw new CampaignRunError("Lesson identifiers and summaries must not be empty.");
  }
  if (!roleIds.has(lesson.roleId)) {
    throw new CampaignRunError(`Lesson references unknown role "${lesson.roleId}".`);
  }
}

export function createCampaignRun(
  definition: CampaignDefinition,
  baseSeed: string | number,
  initialMemory: readonly RoleLessonMemory[] = [],
  initialProgress?: CampaignProgressSnapshot,
): CampaignRun {
  assertSeed(baseSeed);
  const progress = createCampaignProgress(definition, initialProgress);
  const internalDefinition = progress.definition();
  const roleIds = new Set(internalDefinition.roles.map(({ id }) => id));
  const memory = validateMemory(internalDefinition.roles, clone(initialMemory));
  let status: CampaignRunStatus = progress.snapshot().completed ? "complete" : "operation";
  let attemptNumber = 1;
  let pendingResult: OperationResult | null = null;

  const memorySnapshot = (): RoleLessonMemory[] =>
    internalDefinition.roles.map(({ id }) => ({
      roleId: id,
      lessons: clone(memory.get(id) ?? []),
    }));

  const launch = (): OperationLaunch | null => {
    if (status !== "operation") return null;
    const scene = progress.currentScene();
    return {
      campaignId: internalDefinition.id,
      scene,
      roles: clone(internalDefinition.roles),
      seed: operationSeed(internalDefinition.id, scene.identity.id, baseSeed),
      roleMemory: memorySnapshot(),
    };
  };

  const read = (): CampaignRunSnapshot =>
    clone({
      status,
      progress: progress.snapshot(),
      attemptNumber,
      launch: launch(),
      roleMemory: memorySnapshot(),
      lessonChoices: pendingResult?.lessonChoices ?? [],
    });

  const resolve = (suppliedResult: OperationResult): CampaignRunSnapshot => {
    if (status !== "operation") {
      throw new CampaignRunError("An operation result can only resolve an active launch.");
    }
    const result = clone(suppliedResult);
    const scene = progress.currentScene();
    if (result.sceneId !== scene.identity.id) {
      throw new CampaignRunError(
        `Result scene "${result.sceneId}" does not match launch scene "${scene.identity.id}".`,
      );
    }
    const transition = scene.transitions.find(({ outcomeId }) => outcomeId === result.outcomeId);
    if (!transition) {
      throw new CampaignRunError(`Result outcome "${result.outcomeId}" is not declared by the scene.`);
    }

    if (result.status === "retry") {
      if (transition.targetSceneId !== scene.identity.id) {
        throw new CampaignRunError("A retry result must target the active scene.");
      }
      attemptNumber += 1;
      return read();
    }

    if (transition.targetSceneId === scene.identity.id) {
      throw new CampaignRunError("A successful result must leave the active scene.");
    }
    const lessonIds = new Set<string>();
    result.lessonChoices.forEach((lesson) => {
      validateLesson(lesson, roleIds);
      if (lessonIds.has(lesson.id)) {
        throw new CampaignRunError(`Lesson choice id "${lesson.id}" is duplicated.`);
      }
      lessonIds.add(lesson.id);
    });
    if (result.lessonChoices.length === 0) {
      throw new CampaignRunError("A successful result must offer at least one lesson.");
    }

    pendingResult = result;
    status = "lesson";
    return read();
  };

  const decide = (choice: CampaignLessonChoice): CampaignRunSnapshot => {
    if (status !== "lesson" || !pendingResult) {
      throw new CampaignRunError("A lesson can only be chosen after a successful result.");
    }
    const selected = pendingResult.lessonChoices.find(({ id }) => id === choice.lessonId);
    if (!selected) {
      throw new CampaignRunError(`Lesson choice "${choice.lessonId}" was not offered.`);
    }

    const previous = memory.get(selected.roleId) ?? [];
    memory.set(
      selected.roleId,
      [...previous.filter(({ id }) => id !== selected.id), clone(selected)].slice(-LESSON_LIMIT),
    );
    progress.recordOutcome(pendingResult.outcomeId);
    pendingResult = null;
    attemptNumber = 1;
    status = progress.snapshot().completed ? "complete" : "operation";
    return read();
  };

  return { read, decide, resolve };
}
