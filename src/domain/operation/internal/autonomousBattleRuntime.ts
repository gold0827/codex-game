import {
  createSeededRandom,
  deriveRandomStreamSeed,
  hashSeed,
  type RandomSeed,
  type SeededRandom,
} from "../../../simulation/seededRandom";
import type {
  AutonomousBattleActorCondition,
  AutonomousBattleDefinition,
  AutonomousBattleFormationSnapshot,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSimulation,
  AutonomousBattleSnapshot,
} from "../autonomousBattle";

const AUTONOMOUS_BATTLE_FIXED_STEP_MS = 250;

type ActorRuntime = {
  readonly id: string;
  readonly formationId: string;
  readonly profile: AutonomousBattleDefinition["formations"][number]["actors"][number]["profile"];
  readonly decisionNoise: number;
  readonly executionNoise: number;
  readonly random: SeededRandom;
  condition: AutonomousBattleActorCondition;
  selectedBehaviorId: string | null;
  decisionConfidence: number;
  previousTrace: Readonly<{
    behaviorId: string;
    executionSucceeded: boolean;
  }> | null;
};

type FormationRuntime = {
  readonly id: string;
  readonly sideId: string;
  readonly activeAtMs: number;
  readonly locationId: string;
  readonly actors: ActorRuntime[];
  intentId: string;
  guidanceId: string | null;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertRatio(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between zero and one.`);
  }
}

function validateDefinition(definition: AutonomousBattleDefinition): void {
  assertIdentifier(definition.id, "An autonomous battle identifier");
  if (!Number.isSafeInteger(definition.durationMs) || definition.durationMs <= 0) {
    throw new RangeError("An autonomous battle duration must be a positive safe integer.");
  }

  const formationIds = new Set<string>();
  const actorIds = new Set<string>();
  definition.formations.forEach((formation) => {
    assertIdentifier(formation.id, "An autonomous battle formation identifier");
    if (formationIds.has(formation.id)) {
      throw new RangeError(`Autonomous battle formation identifiers must be unique: "${formation.id}".`);
    }
    formationIds.add(formation.id);
    assertIdentifier(formation.sideId, `Formation "${formation.id}" side identifier`);
    assertIdentifier(formation.initialLocationId, `Formation "${formation.id}" location identifier`);
    assertIdentifier(formation.initialIntentId, `Formation "${formation.id}" intent identifier`);
    if (formation.entry.kind === "elapsed" &&
        (!Number.isSafeInteger(formation.entry.atMs) || formation.entry.atMs < 0)) {
      throw new RangeError(`Formation "${formation.id}" entry time must be a non-negative safe integer.`);
    }

    formation.actors.forEach((actor) => {
      assertIdentifier(actor.id, "An autonomous battle actor identifier");
      if (actorIds.has(actor.id)) {
        throw new RangeError(`Autonomous battle actor identifiers must be globally unique: "${actor.id}".`);
      }
      actorIds.add(actor.id);
      (["initiative", "caution", "discipline", "cooperation", "stressTolerance"] as const)
        .forEach((field) => assertRatio(actor.profile[field], `Actor "${actor.id}" profile ${field}`));
      if (!Number.isSafeInteger(actor.profile.memoryCapacity) || actor.profile.memoryCapacity < 0) {
        throw new RangeError(`Actor "${actor.id}" memory capacity must be a non-negative safe integer.`);
      }
      assertRatio(actor.variability.decisionNoise, `Actor "${actor.id}" decision noise`);
      assertRatio(actor.variability.executionNoise, `Actor "${actor.id}" execution noise`);
    });
  });

  const objectiveIds = new Set<string>();
  definition.objectives.forEach((objective) => {
    assertIdentifier(objective.id, "An autonomous battle objective identifier");
    if (objectiveIds.has(objective.id)) {
      throw new RangeError(`Autonomous battle objective identifiers must be unique: "${objective.id}".`);
    }
    objectiveIds.add(objective.id);
  });
}

function validateHarness(harness: AutonomousBattleHarnessPolicies): void {
  const fields = [
    "informationReach",
    "authorityClarity",
    "verificationDepth",
    "feedbackCompression",
  ] as const satisfies readonly (keyof AutonomousBattleHarnessPolicies)[];
  const suppliedFields = harness === null || typeof harness !== "object"
    ? []
    : Object.keys(harness).sort();
  const expectedFields = [...fields].sort();
  if (suppliedFields.length !== expectedFields.length ||
      suppliedFields.some((field, index) => field !== expectedFields[index])) {
    throw new TypeError(`An autonomous battle harness must define exactly: ${fields.join(", ")}.`);
  }
  fields.forEach((field) => {
    assertRatio(harness[field], `Autonomous battle harness ${field}`);
  });
}

/**
 * Minimal headless adapter for the public autonomous-battle boundary.
 *
 * It deliberately has no terrain, combat, historical-scenario, or presentation rules.
 * The behavior loop exists only to make authored actors and harness policies runnable.
 */
export function createAutonomousBattleSimulation(
  suppliedDefinition: AutonomousBattleDefinition,
  seed: RandomSeed,
  suppliedHarness: AutonomousBattleHarnessPolicies,
): AutonomousBattleSimulation {
  hashSeed(seed);
  const definition = structuredClone(suppliedDefinition);
  const harness = structuredClone(suppliedHarness);
  validateDefinition(definition);
  validateHarness(harness);

  let elapsedMs = 0;
  let accumulatedMs = 0;
  const objectiveProgress = new Map(definition.objectives.map(({ id }) => [id, 0]));
  const formations: FormationRuntime[] = definition.formations.map((formation) => {
    const activeAtMs = formation.entry.kind === "present" ? 0 : formation.entry.atMs;
    return {
      id: formation.id,
      sideId: formation.sideId,
      activeAtMs,
      locationId: formation.initialLocationId,
      intentId: formation.initialIntentId,
      guidanceId: null,
      actors: formation.actors.map((actor) => ({
        id: actor.id,
        formationId: formation.id,
        profile: structuredClone(actor.profile),
        decisionNoise: actor.variability.decisionNoise,
        executionNoise: actor.variability.executionNoise,
        random: createSeededRandom(deriveRandomStreamSeed(
          seed,
          `autonomous-battle:${definition.id}:actor:${actor.id}`,
        )),
        condition: "effective",
        selectedBehaviorId: null,
        decisionConfidence: 0,
        previousTrace: null,
      })),
    };
  });

  const decide = (actor: ActorRuntime, formation: FormationRuntime): number => {
    // Draw every stage unconditionally so actor streams remain stable as policies change.
    const observationRoll = actor.random.next();
    const verificationRoll = actor.random.next();
    const authorityRoll = actor.random.next();
    const feedbackRoll = actor.random.next();
    const executionRoll = actor.random.next();

    const observed = observationRoll < clamp(
      harness.informationReach * 0.75 + actor.profile.cooperation * 0.25 - actor.decisionNoise * 0.2,
    );
    const verified = observed && verificationRoll < clamp(
      harness.verificationDepth * 0.7 + actor.profile.caution * 0.2 + actor.profile.discipline * 0.1 -
      actor.decisionNoise * 0.15,
    );
    const authorityUnderstood = authorityRoll < clamp(
      harness.authorityClarity * 0.7 + actor.profile.discipline * 0.2 + actor.profile.initiative * 0.1 -
      actor.decisionNoise * 0.15,
    );
    const previousTrace = actor.previousTrace;
    const feedbackApplied = previousTrace !== null && feedbackRoll < clamp(
      harness.feedbackCompression * 0.65 + actor.profile.cooperation * 0.2 +
      Math.min(1, actor.profile.memoryCapacity / 4) * 0.15 - actor.decisionNoise * 0.15,
    );

    if (!observed) actor.selectedBehaviorId = "seek-information";
    else if (!verified && actor.profile.caution >= verificationRoll) actor.selectedBehaviorId = "verify";
    else if (feedbackApplied) {
      actor.selectedBehaviorId = previousTrace.executionSucceeded ? "feedback-repeat" : "feedback-revise";
    }
    else if (formation.guidanceId !== null && authorityUnderstood) {
      actor.selectedBehaviorId = `guidance:${formation.guidanceId}`;
    }
    else if (authorityUnderstood) actor.selectedBehaviorId = `intent:${formation.intentId}`;
    else actor.selectedBehaviorId = "act-independently";

    const evidence = (observed ? 0.3 : 0) + (verified ? 0.25 : 0) +
      (authorityUnderstood ? 0.25 : 0) + (feedbackApplied ? 0.2 : 0);
    actor.decisionConfidence = rounded(clamp(
      evidence * (0.6 + actor.profile.discipline * 0.25 + actor.profile.initiative * 0.15) *
      (1 - actor.decisionNoise * 0.35),
    ));

    if (actor.condition === "suppressed") {
      const recoveryChance = clamp(actor.profile.discipline * 0.35 + actor.profile.stressTolerance * 0.45);
      if (executionRoll < recoveryChance) actor.condition = "effective";
    } else if (actor.condition === "effective") {
      const disruptionChance = actor.executionNoise * (1 - actor.profile.stressTolerance) * 0.3;
      if (executionRoll < disruptionChance) actor.condition = "suppressed";
    }

    actor.previousTrace = {
      behaviorId: actor.selectedBehaviorId,
      executionSucceeded: actor.condition === "effective",
    };

    const conditionFactor = actor.condition === "effective" ? 1 : 0.35;
    const behaviorFactor = actor.selectedBehaviorId.startsWith("intent:") ||
      actor.selectedBehaviorId.startsWith("guidance:") || actor.selectedBehaviorId === "feedback-repeat"
      ? 1
      : 0.45;
    return actor.decisionConfidence * conditionFactor * behaviorFactor;
  };

  const runStep = (stepMs: number): void => {
    elapsedMs += stepMs;
    const activeActors = formations.flatMap((formation) => elapsedMs >= formation.activeAtMs
      ? formation.actors.map((actor) => ({ actor, formation }))
      : []);
    const contribution = activeActors.reduce(
      (total, { actor, formation }) => total + decide(actor, formation),
      0,
    );
    const readiness = activeActors.length === 0 ? 0 : contribution / activeActors.length;
    const progressIncrement = readiness * (stepMs / definition.durationMs);
    objectiveProgress.forEach((progress, objectiveId) => {
      objectiveProgress.set(objectiveId, clamp(progress + progressIncrement));
    });
  };

  const snapshot = (): AutonomousBattleSnapshot => {
    const resolved = elapsedMs >= definition.durationMs;
    const objectives = definition.objectives.map((objective) => {
      const progress = rounded(objectiveProgress.get(objective.id) ?? 0);
      return { id: objective.id, progress, completed: progress >= 0.5 };
    });
    const required = definition.objectives
      .filter(({ required }) => required)
      .every((objective) => objectives.find(({ id }) => id === objective.id)?.completed === true);
    return {
      battleId: definition.id,
      elapsedMs,
      durationMs: definition.durationMs,
      status: resolved ? "resolved" : "running",
      outcomeId: resolved ? (required ? "objectives-achieved" : "objectives-unmet") : null,
      formations: formations.map((formation): AutonomousBattleFormationSnapshot => ({
        id: formation.id,
        sideId: formation.sideId,
        active: elapsedMs >= formation.activeAtMs,
        locationId: formation.locationId,
        intentId: formation.intentId,
        actors: formation.actors.map((actor) => ({
          id: actor.id,
          formationId: actor.formationId,
          condition: actor.condition,
          selectedBehaviorId: actor.selectedBehaviorId,
          decisionConfidence: actor.decisionConfidence,
        })),
      })),
      objectives,
    };
  };

  return {
    snapshot,
    advance(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError("Autonomous battle advance time must be a finite non-negative number.");
      }
      if (elapsedMs >= definition.durationMs) return snapshot();
      accumulatedMs += deltaMs;
      let nextStepMs = Math.min(AUTONOMOUS_BATTLE_FIXED_STEP_MS, definition.durationMs - elapsedMs);
      while (accumulatedMs >= nextStepMs) {
        accumulatedMs -= nextStepMs;
        runStep(nextStepMs);
        if (elapsedMs >= definition.durationMs) {
          accumulatedMs = 0;
          break;
        }
        nextStepMs = Math.min(AUTONOMOUS_BATTLE_FIXED_STEP_MS, definition.durationMs - elapsedMs);
      }
      return snapshot();
    },
    intervene(intervention) {
      if (intervention.kind === "set-formation-intent") {
        assertIdentifier(intervention.intentId, "An autonomous battle intervention intent identifier");
        const formation = formations.find(({ id }) => id === intervention.formationId);
        if (!formation) throw new RangeError(`Unknown autonomous battle formation "${intervention.formationId}".`);
        formation.intentId = intervention.intentId;
        return snapshot();
      }

      assertIdentifier(intervention.guidanceId, "An autonomous battle guidance identifier");
      const recipients = intervention.recipientFormationIds.map((formationId) => {
        const formation = formations.find(({ id }) => id === formationId);
        if (!formation) throw new RangeError(`Unknown autonomous battle formation "${formationId}".`);
        return formation;
      });
      recipients.forEach((formation) => {
        formation.guidanceId = intervention.guidanceId;
      });
      return snapshot();
    },
  };
}
