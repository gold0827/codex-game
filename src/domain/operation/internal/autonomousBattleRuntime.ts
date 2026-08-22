import {
  createSeededRandom,
  deriveRandomStreamSeed,
  hashSeed,
  type SeededRandom,
} from "../../../simulation/seededRandom";
import type {
  AutonomousBattleActorCondition,
  AutonomousBattleDecisionTrace,
  AutonomousBattleDefinition,
  AutonomousBattleEvent,
  AutonomousBattleFormationSnapshot,
  AutonomousBattleHarnessConsequence,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleIntervention,
  AutonomousBattleInterventionResult,
  AutonomousBattleSimulation,
  AutonomousBattleSimulationOptions,
  AutonomousBattleSnapshot,
} from "../autonomousBattle";

const AUTONOMOUS_BATTLE_FIXED_STEP_MS = 250;
const AUTONOMOUS_BATTLE_RECENT_EVENT_CAPACITY = 128;
const INTERVENTION_COST = 1;

type ActorRuntime = {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly profile: AutonomousBattleDefinition["formations"][number]["actors"][number]["profile"];
  readonly variability: AutonomousBattleDefinition["formations"][number]["actors"][number]["variability"];
  readonly random: SeededRandom;
  condition: AutonomousBattleActorCondition;
  latestDecision: AutonomousBattleDecisionTrace | null;
  decisionCount: number;
  previousAction: Readonly<{
    traceId: string;
    behaviorId: string;
    executionSucceeded: boolean;
  }> | null;
};

type FormationRuntime = {
  readonly id: string;
  readonly label: string;
  readonly sideId: string;
  readonly activeAtMs: number;
  readonly locationId: string;
  readonly actors: ActorRuntime[];
  intentId: string;
  guidanceId: string | null;
  coordinationBoost: number;
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
  assertIdentifier(definition.playerControlledSideId, "The player-controlled side identifier");
  if (!Number.isSafeInteger(definition.durationMs) || definition.durationMs <= 0) {
    throw new RangeError("An autonomous battle duration must be a positive safe integer.");
  }
  if (definition.formations.length === 0 || definition.objectives.length === 0) {
    throw new RangeError("An autonomous battle needs at least one formation and objective.");
  }

  const formationIds = new Set<string>();
  const actorIds = new Set<string>();
  definition.formations.forEach((formation) => {
    assertIdentifier(formation.id, "An autonomous battle formation identifier");
    assertIdentifier(formation.label, `Formation "${formation.id}" label`);
    if (formationIds.has(formation.id)) {
      throw new RangeError(
        `Autonomous battle formation identifiers must be unique: "${formation.id}".`,
      );
    }
    formationIds.add(formation.id);
    assertIdentifier(formation.sideId, `Formation "${formation.id}" side identifier`);
    assertIdentifier(formation.initialLocationId, `Formation "${formation.id}" location identifier`);
    assertIdentifier(formation.initialIntentId, `Formation "${formation.id}" intent identifier`);
    if (formation.actors.length === 0) {
      throw new RangeError(`Formation "${formation.id}" must contain at least one actor.`);
    }
    if (formation.entry.kind === "elapsed" &&
        (!Number.isSafeInteger(formation.entry.atMs) || formation.entry.atMs < 0)) {
      throw new RangeError(
        `Formation "${formation.id}" entry time must be a non-negative safe integer.`,
      );
    }

    formation.actors.forEach((actor) => {
      assertIdentifier(actor.id, "An autonomous battle actor identifier");
      assertIdentifier(actor.label, `Actor "${actor.id}" label`);
      assertIdentifier(actor.role, `Actor "${actor.id}" role`);
      if (actorIds.has(actor.id)) {
        throw new RangeError(
          `Autonomous battle actor identifiers must be globally unique: "${actor.id}".`,
        );
      }
      actorIds.add(actor.id);
      (["initiative", "caution", "discipline", "cooperation", "stressTolerance"] as const)
        .forEach((field) => assertRatio(
          actor.profile[field],
          `Actor "${actor.id}" profile ${field}`,
        ));
      if (!Number.isSafeInteger(actor.profile.memoryCapacity) || actor.profile.memoryCapacity < 0) {
        throw new RangeError(`Actor "${actor.id}" memory capacity must be non-negative.`);
      }
      assertRatio(actor.variability.decisionNoise, `Actor "${actor.id}" decision noise`);
      assertRatio(actor.variability.executionNoise, `Actor "${actor.id}" execution noise`);
    });
  });

  if (!definition.formations.some(({ sideId }) => sideId === definition.playerControlledSideId)) {
    throw new RangeError("An autonomous battle must contain the player-controlled side.");
  }

  const objectiveIds = new Set<string>();
  const objectiveMeasurements = new Set([
    "contested-delay",
    "controlled-readiness",
    "controlled-effective-preservation",
  ]);
  definition.objectives.forEach((objective) => {
    assertIdentifier(objective.id, "An autonomous battle objective identifier");
    assertIdentifier(objective.label, `Objective "${objective.id}" label`);
    if (objectiveIds.has(objective.id)) {
      throw new RangeError(
        `Autonomous battle objective identifiers must be unique: "${objective.id}".`,
      );
    }
    objectiveIds.add(objective.id);
    if (!objectiveMeasurements.has(objective.measurement)) {
      throw new RangeError(`Objective "${objective.id}" has an unknown measurement.`);
    }
    assertRatio(objective.criterion.required, `Objective "${objective.id}" criterion`);
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
    throw new TypeError(
      `An autonomous battle harness must define exactly: ${fields.join(", ")}.`,
    );
  }
  fields.forEach((field) => {
    assertRatio(harness[field], `Autonomous battle harness ${field}`);
  });
}

function harnessConsequences(
  harness: AutonomousBattleHarnessPolicies,
): AutonomousBattleHarnessConsequence[] {
  const candidates: Array<AutonomousBattleHarnessConsequence | null> = [
    harness.informationReach > 0.85 ? {
      code: "information-saturation",
      axis: "informationReach",
      severity: rounded(harness.informationReach),
    } : null,
    harness.authorityClarity < 0.4 ? {
      code: "ambiguous-authority",
      axis: "authorityClarity",
      severity: rounded(1 - harness.authorityClarity),
    } : null,
    harness.verificationDepth < 0.4 ? {
      code: "verification-congestion",
      axis: "verificationDepth",
      severity: rounded(1 - harness.verificationDepth),
    } : null,
    harness.feedbackCompression < 0.4 ? {
      code: "noisy-feedback",
      axis: "feedbackCompression",
      severity: rounded(1 - harness.feedbackCompression),
    } : null,
    harness.authorityClarity > 0.9 ? {
      code: "over-centralization",
      axis: "authorityClarity",
      severity: rounded(harness.authorityClarity),
    } : null,
  ];
  return candidates.filter((candidate): candidate is AutonomousBattleHarnessConsequence =>
    candidate !== null,
  );
}

/** Headless in-process Adapter for the canonical autonomous-operation seam. */
export function createAutonomousBattleSimulation(
  suppliedDefinition: AutonomousBattleDefinition,
  suppliedOptions: AutonomousBattleSimulationOptions,
): AutonomousBattleSimulation {
  const options = structuredClone(suppliedOptions);
  hashSeed(options.seed);
  const definition = structuredClone(suppliedDefinition);
  const harness = options.harness;
  validateDefinition(definition);
  validateHarness(harness);
  if (!Number.isFinite(options.interventionBudget) || options.interventionBudget < 0) {
    throw new RangeError("An autonomous battle intervention budget must be non-negative and finite.");
  }

  let elapsedMs = 0;
  let accumulatedMs = 0;
  let interventionSpent = 0;
  let interventionCount = 0;
  let nextEventSequence = 0;
  let resolved = false;
  let contestedDelayFact = 0;
  let controlledReadinessFact = 0;
  let controlledPreservationFact = 0;
  const recentEvents: AutonomousBattleEvent[] = [];
  const consequences = harnessConsequences(harness);
  const formations: FormationRuntime[] = definition.formations.map((formation) => ({
    id: formation.id,
    label: formation.label,
    sideId: formation.sideId,
    activeAtMs: formation.entry.kind === "present" ? 0 : formation.entry.atMs,
    locationId: formation.initialLocationId,
    intentId: formation.initialIntentId,
    guidanceId: null,
    coordinationBoost: 0,
    actors: formation.actors.map((actor) => ({
      id: actor.id,
      label: actor.label,
      role: actor.role,
      profile: structuredClone(actor.profile),
      variability: structuredClone(actor.variability),
      random: createSeededRandom(deriveRandomStreamSeed(
        options.seed,
        `autonomous-battle:${definition.id}:actor:${actor.id}`,
      )),
      condition: "effective",
      latestDecision: null,
      decisionCount: 0,
      previousAction: null,
    })),
  }));

  const appendEvent = (event: AutonomousBattleEvent): void => {
    recentEvents.push(structuredClone(event));
    if (recentEvents.length > AUTONOMOUS_BATTLE_RECENT_EVENT_CAPACITY) {
      recentEvents.shift();
    }
  };

  formations.filter(({ activeAtMs }) => activeAtMs === 0).forEach((formation) => {
    appendEvent({
      sequence: nextEventSequence++,
      atMs: 0,
      kind: "formation-activated",
      formationId: formation.id,
    });
  });
  consequences.forEach((consequence) => {
    appendEvent({
      sequence: nextEventSequence++,
      atMs: 0,
      kind: "harness-consequence",
      consequence,
    });
  });

  const decide = (actor: ActorRuntime, formation: FormationRuntime): number => {
    // Preserve the historical per-actor stream order across harness comparisons.
    const observationRoll = actor.random.next();
    const verificationRoll = actor.random.next();
    const authorityRoll = actor.random.next();
    const feedbackRoll = actor.random.next();
    const executionRoll = actor.random.next();

    const informationConfidence = clamp(
      harness.informationReach * 0.75 + actor.profile.cooperation * 0.25 -
      actor.variability.decisionNoise * 0.2,
    );
    const verificationConfidence = clamp(
      harness.verificationDepth * 0.7 + actor.profile.caution * 0.2 +
      actor.profile.discipline * 0.1 - actor.variability.decisionNoise * 0.15,
    );
    const authorityConfidence = clamp(
      harness.authorityClarity * 0.7 + actor.profile.discipline * 0.2 +
      actor.profile.initiative * 0.1 - actor.variability.decisionNoise * 0.15,
    );
    const feedbackConfidence = clamp(
      harness.feedbackCompression * 0.65 + actor.profile.cooperation * 0.2 +
      Math.min(1, actor.profile.memoryCapacity / 4) * 0.15 -
      actor.variability.decisionNoise * 0.15,
    );

    const observed = observationRoll < informationConfidence;
    const verified = observed && verificationRoll < verificationConfidence;
    const authorityUnderstood = authorityRoll < authorityConfidence;
    const previousAction = actor.previousAction;
    const feedbackApplied = previousAction !== null && feedbackRoll < feedbackConfidence;

    let behaviorId: string;
    if (!observed) behaviorId = "seek-information";
    else if (!verified && actor.profile.caution >= verificationRoll) behaviorId = "verify";
    else if (feedbackApplied) {
      behaviorId = previousAction.executionSucceeded ? "feedback-repeat" : "feedback-revise";
    } else if (formation.guidanceId !== null && authorityUnderstood) {
      behaviorId = `guidance:${formation.guidanceId}`;
    } else if (authorityUnderstood) behaviorId = `intent:${formation.intentId}`;
    else behaviorId = "act-independently";

    const evidence = (observed ? 0.3 : 0) + (verified ? 0.25 : 0) +
      (authorityUnderstood ? 0.25 : 0) + (feedbackApplied ? 0.2 : 0);
    const decisionConfidence = rounded(clamp(
      evidence * (0.6 + actor.profile.discipline * 0.25 + actor.profile.initiative * 0.15) *
      (1 - actor.variability.decisionNoise * 0.35),
    ));

    const previousCondition = actor.condition;
    if (actor.condition === "suppressed") {
      const recoveryChance = clamp(
        actor.profile.discipline * 0.35 + actor.profile.stressTolerance * 0.45,
      );
      if (executionRoll < recoveryChance) actor.condition = "effective";
    } else if (actor.condition === "effective") {
      const disruptionChance = actor.variability.executionNoise *
        (1 - actor.profile.stressTolerance) * 0.3;
      if (executionRoll < disruptionChance) actor.condition = "suppressed";
    }

    actor.decisionCount += 1;
    const traceId = `decision:${actor.id}:${actor.decisionCount}`;
    const observationId = observed ? `observation:${actor.id}:${actor.decisionCount}` : null;
    const executionSucceeded = actor.condition === "effective";
    actor.latestDecision = {
      id: traceId,
      actorId: actor.id,
      startedAtMs: elapsedMs,
      completedAtMs: elapsedMs,
      information: {
        atMs: elapsedMs,
        state: observed ? "received" : "missed",
        observationId,
        confidence: rounded(informationConfidence),
      },
      verification: {
        atMs: elapsedMs,
        observationId,
        state: !observed ? "skipped" : verified ? "verified" : "contradicted",
        confidence: rounded(verificationConfidence),
      },
      authority: {
        atMs: elapsedMs,
        state: authorityUnderstood
          ? "clear"
          : actor.profile.initiative >= 0.65 ? "self-directed" : "ambiguous",
        intentId: authorityUnderstood ? formation.intentId : null,
        confidence: rounded(authorityConfidence),
      },
      action: {
        atMs: elapsedMs,
        state: executionSucceeded ? "executed" : "failed",
        behaviorId,
        targetId: null,
        confidence: decisionConfidence,
      },
      feedback: {
        atMs: elapsedMs,
        source: previousAction === null ? "none" : "prior-action",
        state: previousAction === null ? "missing" : feedbackApplied ? "integrated" : "ignored",
        outcomeId: previousAction === null
          ? null
          : previousAction.executionSucceeded ? "prior-action-effective" : "prior-action-failed",
        confidence: rounded(feedbackConfidence),
      },
    };
    actor.previousAction = {
      traceId,
      behaviorId,
      executionSucceeded,
    };

    appendEvent({
      sequence: nextEventSequence++,
      atMs: elapsedMs,
      kind: "actor-decision",
      actorId: actor.id,
      traceId,
    });
    if (actor.condition !== previousCondition) {
      appendEvent({
        sequence: nextEventSequence++,
        atMs: elapsedMs,
        kind: "actor-condition-changed",
        actorId: actor.id,
        condition: actor.condition,
      });
    }

    const conditionFactor = actor.condition === "effective" ? 1 : 0.35;
    const behaviorFactor = behaviorId.startsWith("intent:") ||
      behaviorId.startsWith("guidance:") || behaviorId === "feedback-repeat"
      ? 1
      : 0.45;
    return clamp(
      decisionConfidence * conditionFactor * behaviorFactor + formation.coordinationBoost,
    );
  };

  const objectiveFact = (
    measurement: AutonomousBattleDefinition["objectives"][number]["measurement"],
  ): number => {
    if (measurement === "contested-delay") return rounded(contestedDelayFact);
    if (measurement === "controlled-readiness") return rounded(controlledReadinessFact);
    return rounded(controlledPreservationFact);
  };

  const currentObjectives = () => definition.objectives.map((objective) => {
    const observed = objectiveFact(objective.measurement);
    const satisfied = objective.criterion.comparator === "at-least"
      ? observed >= objective.criterion.required
      : observed <= objective.criterion.required;
    const progress = objective.criterion.comparator === "at-least"
      ? objective.criterion.required === 0 ? 1 : clamp(observed / objective.criterion.required)
      : observed === 0 ? 1 : clamp(objective.criterion.required / observed);
    return {
      id: objective.id,
      label: objective.label,
      required: objective.required,
      progress,
      state: resolved ? (satisfied ? "achieved" as const : "failed" as const) : "active" as const,
      evidence: [{
        id: `evidence:${objective.id}:${objective.measurement}`,
        label: `${objective.label} 측정값`,
        kind: "number" as const,
        observed,
        required: objective.criterion.required,
        comparator: objective.criterion.comparator,
        unit: "ratio" as const,
        satisfied,
      }],
    };
  });

  const terminalDisposition = (): "success" | "failure" => {
    const objectives = currentObjectives();
    return definition.objectives.filter(({ required }) => required).every((objective) =>
      objectives.find(({ id }) => id === objective.id)?.state === "achieved",
    ) ? "success" : "failure";
  };

  const finish = (): void => {
    if (resolved) return;
    resolved = true;
    const objectives = currentObjectives();
    objectives.forEach((objective) => {
      appendEvent({
        sequence: nextEventSequence++,
        atMs: elapsedMs,
        kind: "objective-state-changed",
        objectiveId: objective.id,
        state: objective.state,
        progress: objective.progress,
      });
    });
    const disposition = terminalDisposition();
    appendEvent({
      sequence: nextEventSequence++,
      atMs: elapsedMs,
      kind: "operation-resolved",
      disposition,
      outcomeId: disposition === "success" ? "objectives-achieved" : "objectives-unmet",
    });
  };

  const runStep = (stepMs: number): void => {
    const beforeMs = elapsedMs;
    elapsedMs += stepMs;
    formations.forEach((formation) => {
      if (beforeMs < formation.activeAtMs && elapsedMs >= formation.activeAtMs) {
        appendEvent({
          sequence: nextEventSequence++,
          atMs: elapsedMs,
          kind: "formation-activated",
          formationId: formation.id,
        });
      }
    });
    const activeActors = formations.flatMap((formation) => elapsedMs >= formation.activeAtMs
      ? formation.actors.map((actor) => ({ actor, formation }))
      : []);
    const contributions = activeActors.map(({ actor, formation }) => ({
      sideId: formation.sideId,
      value: decide(actor, formation),
    }));
    const average = (values: readonly number[]): number => values.length === 0
      ? 0
      : values.reduce((total, value) => total + value, 0) / values.length;
    const controlledReadiness = average(contributions
      .filter(({ sideId }) => sideId === definition.playerControlledSideId)
      .map(({ value }) => value));
    const activeActorCount = Math.max(1, contributions.length);
    const controlledPower = contributions
      .filter(({ sideId }) => sideId === definition.playerControlledSideId)
      .reduce((total, { value }) => total + value, 0) / activeActorCount;
    const opposingPressure = contributions
      .filter(({ sideId }) => sideId !== definition.playerControlledSideId)
      .reduce((total, { value }) => total + value, 0) / activeActorCount;
    const controlledActors = formations
      .filter(({ sideId }) => sideId === definition.playerControlledSideId)
      .flatMap(({ actors }) => actors);
    const effectivePreservation = controlledActors.length === 0 ? 0 :
      controlledActors.filter(({ condition }) => condition === "effective").length /
      controlledActors.length;
    const elapsedShare = stepMs / definition.durationMs;
    controlledReadinessFact = clamp(
      controlledReadinessFact + controlledReadiness * elapsedShare,
    );
    contestedDelayFact = clamp(
      contestedDelayFact + clamp(0.5 + (controlledPower - opposingPressure) * 0.5) *
        elapsedShare,
    );
    controlledPreservationFact = clamp(
      controlledPreservationFact + effectivePreservation * elapsedShare,
    );
    if (elapsedMs >= definition.durationMs) finish();
  };

  const snapshot = (): AutonomousBattleSnapshot => {
    const disposition = resolved ? terminalDisposition() : null;
    return structuredClone({
      battleId: definition.id,
      elapsedMs,
      durationMs: definition.durationMs,
      resolution: resolved && disposition !== null
        ? {
            state: "resolved" as const,
            disposition,
            outcomeId: disposition === "success" ? "objectives-achieved" : "objectives-unmet",
            resolvedAtMs: elapsedMs,
          }
        : { state: "running" as const },
      harness: {
        policies: harness,
        consequences,
      },
      formations: formations.map((formation): AutonomousBattleFormationSnapshot => ({
        id: formation.id,
        label: formation.label,
        sideId: formation.sideId,
        controllable: formation.sideId === definition.playerControlledSideId,
        active: elapsedMs >= formation.activeAtMs,
        locationId: formation.locationId,
        intentId: formation.intentId,
        actors: formation.actors.map((actor) => ({
          id: actor.id,
          label: actor.label,
          role: actor.role,
          profile: actor.profile,
          variability: actor.variability,
          condition: actor.condition,
          latestDecision: actor.latestDecision,
        })),
      })),
      objectives: currentObjectives(),
      interventionBudget: {
        available: options.interventionBudget,
        spent: interventionSpent,
        remaining: options.interventionBudget - interventionSpent,
        count: interventionCount,
      },
      recentEvents: {
        capacity: AUTONOMOUS_BATTLE_RECENT_EVENT_CAPACITY,
        firstSequence: recentEvents[0]?.sequence ?? nextEventSequence,
        nextSequence: nextEventSequence,
        items: recentEvents,
      },
    });
  };

  const validateIntervention = (
    intervention: AutonomousBattleIntervention,
  ): FormationRuntime[] => {
    if (intervention.kind === "set-formation-intent") {
      assertIdentifier(intervention.intentId, "An autonomous battle intervention intent identifier");
      const formation = formations.find(({ id }) => id === intervention.formationId);
      if (!formation) {
        throw new RangeError(`Unknown autonomous battle formation "${intervention.formationId}".`);
      }
      return [formation];
    }

    assertIdentifier(intervention.guidanceId, "An autonomous battle guidance identifier");
    if (intervention.recipientFormationIds.length === 0 ||
        new Set(intervention.recipientFormationIds).size !==
          intervention.recipientFormationIds.length) {
      throw new RangeError("Guidance recipients must be non-empty and unique.");
    }
    return intervention.recipientFormationIds.map((formationId) => {
      const formation = formations.find(({ id }) => id === formationId);
      if (!formation) throw new RangeError(`Unknown autonomous battle formation "${formationId}".`);
      return formation;
    });
  };

  const rejectedIntervention = (
    intervention: AutonomousBattleIntervention,
    affected: readonly FormationRuntime[],
    reason: "insufficient-budget" | "operation-resolved" | "formation-not-controllable",
  ): AutonomousBattleInterventionResult => structuredClone({
    snapshot: snapshot(),
    receipt: {
      status: "rejected" as const,
      id: `rejected:${reason}:${intervention.kind}:${elapsedMs}`,
      kind: intervention.kind,
      rejectedAtMs: elapsedMs,
      reason,
      cost: 0 as const,
      affectedFormationIds: affected.map(({ id }) => id),
    },
  });

  return {
    snapshot,
    advance(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0 ||
          deltaMs > Number.MAX_SAFE_INTEGER - accumulatedMs) {
        throw new RangeError(
          "Autonomous battle advance time must be finite, non-negative, and safe.",
        );
      }
      if (resolved || deltaMs === 0) return snapshot();
      accumulatedMs += deltaMs;
      let nextStepMs = Math.min(
        AUTONOMOUS_BATTLE_FIXED_STEP_MS,
        definition.durationMs - elapsedMs,
      );
      while (accumulatedMs >= nextStepMs) {
        accumulatedMs -= nextStepMs;
        runStep(nextStepMs);
        if (resolved) {
          accumulatedMs = 0;
          break;
        }
        nextStepMs = Math.min(
          AUTONOMOUS_BATTLE_FIXED_STEP_MS,
          definition.durationMs - elapsedMs,
        );
      }
      return snapshot();
    },
    intervene(intervention) {
      const affected = validateIntervention(intervention);
      if (resolved) return rejectedIntervention(intervention, affected, "operation-resolved");
      if (affected.some(({ sideId }) => sideId !== definition.playerControlledSideId)) {
        return rejectedIntervention(intervention, affected, "formation-not-controllable");
      }
      if (interventionSpent + INTERVENTION_COST > options.interventionBudget) {
        return rejectedIntervention(intervention, affected, "insufficient-budget");
      }

      interventionSpent += INTERVENTION_COST;
      interventionCount += 1;
      const receipt = {
        status: "accepted" as const,
        id: `intervention:${interventionCount}`,
        kind: intervention.kind,
        appliedAtMs: elapsedMs,
        cost: INTERVENTION_COST,
        affectedFormationIds: affected.map(({ id }) => id),
      };
      if (intervention.kind === "set-formation-intent") {
        affected[0]!.intentId = intervention.intentId;
        appendEvent({
          sequence: nextEventSequence++,
          atMs: elapsedMs,
          kind: "formation-intent-changed",
          formationId: affected[0]!.id,
          intentId: intervention.intentId,
        });
      } else {
        affected.forEach((formation) => {
          formation.guidanceId = intervention.guidanceId;
        });
      }
      affected.forEach((formation) => {
        formation.coordinationBoost = clamp(formation.coordinationBoost + 0.04);
      });
      appendEvent({
        sequence: nextEventSequence++,
        atMs: elapsedMs,
        kind: "intervention-applied",
        receiptId: receipt.id,
        affectedFormationIds: receipt.affectedFormationIds,
      });
      return structuredClone({ snapshot: snapshot(), receipt });
    },
  };
}
