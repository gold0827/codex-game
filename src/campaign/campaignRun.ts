import type { CampaignDefinition, CampaignOfficer, CampaignScene } from "./types";
import {
  createCampaignProgress,
  type CampaignProgressSnapshot,
} from "./progress";

export type CampaignRunStatus = "operation" | "lesson" | "complete";

export type OfficerLesson = Readonly<{
  id: string;
  officerId: string;
  summary: string;
}>;

export type OfficerLessonMemory = Readonly<{
  officerId: string;
  lessons: readonly OfficerLesson[];
}>;

export type OperationLaunch = Readonly<{
  campaignId: string;
  scene: CampaignScene;
  officers: readonly CampaignOfficer[];
  seed: string;
  memory: readonly OfficerLessonMemory[];
}>;

export type OperationResult = Readonly<{
  sceneId: string;
  status: "success" | "retry";
  outcomeId: string;
  lessonChoices: readonly OfficerLesson[];
}>;

export type CampaignLessonChoice = Readonly<{
  lessonId: string;
}>;

export type CampaignRunSnapshot = Readonly<{
  status: CampaignRunStatus;
  progress: CampaignProgressSnapshot;
  attemptNumber: number;
  launch: OperationLaunch | null;
  memory: readonly OfficerLessonMemory[];
  lessonChoices: readonly OfficerLesson[];
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
  officers: readonly CampaignOfficer[],
  supplied: readonly OfficerLessonMemory[],
): Map<string, OfficerLesson[]> {
  const officerIds = new Set(officers.map(({ id }) => id));
  const memory = new Map(officers.map(({ id }) => [id, [] as OfficerLesson[]]));
  const seenOfficers = new Set<string>();

  supplied.forEach((entry) => {
    if (!officerIds.has(entry.officerId)) {
      throw new CampaignRunError(`Memory references unknown officer "${entry.officerId}".`);
    }
    if (seenOfficers.has(entry.officerId)) {
      throw new CampaignRunError(`Memory repeats officer "${entry.officerId}".`);
    }
    seenOfficers.add(entry.officerId);
    entry.lessons.forEach((lesson) => validateLesson(lesson, officerIds));
    if (entry.lessons.some(({ officerId }) => officerId !== entry.officerId)) {
      throw new CampaignRunError("A lesson must belong to its enclosing officer memory.");
    }
    memory.set(entry.officerId, clone(entry.lessons.slice(-LESSON_LIMIT)));
  });

  return memory;
}

function validateLesson(lesson: OfficerLesson, officerIds: ReadonlySet<string>): void {
  if (!lesson.id.trim() || !lesson.summary.trim()) {
    throw new CampaignRunError("Lesson identifiers and summaries must not be empty.");
  }
  if (!officerIds.has(lesson.officerId)) {
    throw new CampaignRunError(`Lesson references unknown officer "${lesson.officerId}".`);
  }
}

export function createCampaignRun(
  definition: CampaignDefinition,
  baseSeed: string | number,
  initialMemory: readonly OfficerLessonMemory[] = [],
  initialProgress?: CampaignProgressSnapshot,
): CampaignRun {
  assertSeed(baseSeed);
  const progress = createCampaignProgress(definition, initialProgress);
  const internalDefinition = progress.definition();
  const officerIds = new Set(internalDefinition.officers.map(({ id }) => id));
  const memory = validateMemory(internalDefinition.officers, clone(initialMemory));
  let status: CampaignRunStatus = progress.snapshot().completed ? "complete" : "operation";
  let attemptNumber = 1;
  let pendingResult: OperationResult | null = null;

  const memorySnapshot = (): OfficerLessonMemory[] =>
    internalDefinition.officers.map(({ id }) => ({
      officerId: id,
      lessons: clone(memory.get(id) ?? []),
    }));

  const launch = (): OperationLaunch | null => {
    if (status !== "operation") return null;
    const scene = progress.currentScene();
    return {
      campaignId: internalDefinition.id,
      scene,
      officers: clone(internalDefinition.officers),
      seed: operationSeed(internalDefinition.id, scene.identity.id, baseSeed),
      memory: memorySnapshot(),
    };
  };

  const read = (): CampaignRunSnapshot =>
    clone({
      status,
      progress: progress.snapshot(),
      attemptNumber,
      launch: launch(),
      memory: memorySnapshot(),
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
      validateLesson(lesson, officerIds);
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

    const previous = memory.get(selected.officerId) ?? [];
    memory.set(
      selected.officerId,
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
