import type {
  AutonomousBattleActorCondition,
  AutonomousBattleDecisionTrace,
  AutonomousBattleEvent,
  AutonomousBattleHarnessConsequence,
  AutonomousBattleHarnessPolicies,
  AutonomousBattleSimulationFactory,
  AutonomousBattleSnapshot,
} from "../../src/domain/operation/autonomousBattle";
import {
  createSeededRandom,
  deriveRandomStreamSeed,
  hashSeed,
  type SeededRandom,
} from "../../src/simulation/seededRandom";

const EVENT_CAPACITY = 12;

type RuntimeActor = {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly profile: AutonomousBattleSnapshot["formations"][number]["actors"][number]["profile"];
  readonly variability: AutonomousBattleSnapshot["formations"][number]["actors"][number]["variability"];
  readonly random: SeededRandom;
  condition: AutonomousBattleActorCondition;
  latestDecision: AutonomousBattleDecisionTrace | null;
  decisionCount: number;
};

type RuntimeFormation = {
  readonly id: string;
  readonly label: string;
  readonly sideId: string;
  readonly activeAtMs: number;
  readonly locationId: string;
  readonly actors: RuntimeActor[];
  intentId: string;
};

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

function validateHarness(harness: AutonomousBattleHarnessPolicies): void {
  const axes = [
    "informationReach",
    "authorityClarity",
    "verificationDepth",
    "feedbackCompression",
  ] as const;
  const keys = Object.keys(harness).sort();
  const expected = [...axes].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("A harness must contain exactly the four canonical policies.");
  }
  axes.forEach((axis) => assertRatio(harness[axis], `Harness ${axis}`));
}

function validateDefinition(
  definition: Parameters<AutonomousBattleSimulationFactory>[0],
): void {
  assertIdentifier(definition.id, "Battle id");
  assertIdentifier(definition.playerControlledSideId, "Player-controlled side id");
  if (!Number.isSafeInteger(definition.durationMs) || definition.durationMs <= 0) {
    throw new RangeError("Battle duration must be a positive safe integer.");
  }
  if (definition.formations.length === 0 || definition.objectives.length === 0) {
    throw new RangeError("A battle needs at least one formation and objective.");
  }

  const formationIds = new Set<string>();
  const actorIds = new Set<string>();
  for (const formation of definition.formations) {
    assertIdentifier(formation.id, "Formation id");
    assertIdentifier(formation.label, `Formation ${formation.id} label`);
    assertIdentifier(formation.sideId, `Formation ${formation.id} side`);
    assertIdentifier(formation.initialLocationId, `Formation ${formation.id} location`);
    assertIdentifier(formation.initialIntentId, `Formation ${formation.id} intent`);
    if (formationIds.has(formation.id)) {
      throw new RangeError(`Duplicate formation id ${formation.id}.`);
    }
    formationIds.add(formation.id);
    if (formation.actors.length === 0) {
      throw new RangeError(`Formation ${formation.id} needs at least one actor.`);
    }
    if (formation.entry.kind === "elapsed" &&
        (!Number.isSafeInteger(formation.entry.atMs) || formation.entry.atMs < 0)) {
      throw new RangeError(`Formation ${formation.id} has an invalid entry time.`);
    }

    for (const actor of formation.actors) {
      assertIdentifier(actor.id, "Actor id");
      assertIdentifier(actor.label, `Actor ${actor.id} label`);
      assertIdentifier(actor.role, `Actor ${actor.id} role`);
      if (actorIds.has(actor.id)) throw new RangeError(`Duplicate actor id ${actor.id}.`);
      actorIds.add(actor.id);
      (["initiative", "caution", "discipline", "cooperation", "stressTolerance"] as const)
        .forEach((field) => assertRatio(actor.profile[field], `Actor ${actor.id} ${field}`));
      if (!Number.isSafeInteger(actor.profile.memoryCapacity) || actor.profile.memoryCapacity < 0) {
        throw new RangeError(`Actor ${actor.id} has invalid memory capacity.`);
      }
      actor.profile.sourceTrust.forEach(({ officerId, trust }) => {
        assertIdentifier(officerId, `Actor ${actor.id} trusted source`);
        assertRatio(trust, `Actor ${actor.id} source trust`);
      });
      assertRatio(actor.variability.decisionNoise, `Actor ${actor.id} decision noise`);
      assertRatio(actor.variability.executionNoise, `Actor ${actor.id} execution noise`);
    }
  }
  if (!definition.formations.some(({ sideId }) => sideId === definition.playerControlledSideId)) {
    throw new RangeError("A battle needs a player-controlled formation.");
  }

  const objectiveIds = new Set<string>();
  for (const objective of definition.objectives) {
    assertIdentifier(objective.id, "Objective id");
    assertIdentifier(objective.label, `Objective ${objective.id} label`);
    if (objectiveIds.has(objective.id)) {
      throw new RangeError(`Duplicate objective id ${objective.id}.`);
    }
    objectiveIds.add(objective.id);
  }
}

function consequences(
  harness: AutonomousBattleHarnessPolicies,
): AutonomousBattleHarnessConsequence[] {
  const candidates: Array<AutonomousBattleHarnessConsequence | null> = [
    harness.informationReach < 0.4 ? {
      code: "information-saturation",
      axis: "informationReach",
      severity: 1 - harness.informationReach,
    } : null,
    harness.authorityClarity < 0.4 ? {
      code: "ambiguous-authority",
      axis: "authorityClarity",
      severity: 1 - harness.authorityClarity,
    } : null,
    harness.verificationDepth < 0.4 ? {
      code: "verification-congestion",
      axis: "verificationDepth",
      severity: 1 - harness.verificationDepth,
    } : null,
    harness.feedbackCompression < 0.4 ? {
      code: "noisy-feedback",
      axis: "feedbackCompression",
      severity: 1 - harness.feedbackCompression,
    } : null,
    harness.authorityClarity > 0.9 ? {
      code: "over-centralization",
      axis: "authorityClarity",
      severity: harness.authorityClarity,
    } : null,
  ];
  return candidates.filter((candidate): candidate is AutonomousBattleHarnessConsequence =>
    candidate !== null,
  );
}

/** Test-only Adapter. Its arbitrary behavior is not a gameplay proposal. */
export const createMockAutonomousBattle: AutonomousBattleSimulationFactory = (
  suppliedDefinition,
  suppliedOptions,
) => {
  const options = structuredClone(suppliedOptions);
  hashSeed(options.seed);
  const definition = structuredClone(suppliedDefinition);
  const harness = options.harness;
  validateDefinition(definition);
  validateHarness(harness);
  if (!Number.isFinite(options.interventionBudget) || options.interventionBudget < 0) {
    throw new RangeError("An intervention budget must be a non-negative finite number.");
  }

  let elapsedMs = 0;
  let interventionSpent = 0;
  let interventionCount = 0;
  let nextEventSequence = 0;
  const events: AutonomousBattleEvent[] = [];
  const harnessConsequences = consequences(harness);
  const formations: RuntimeFormation[] = definition.formations.map((formation) => ({
    id: formation.id,
    label: formation.label,
    sideId: formation.sideId,
    activeAtMs: formation.entry.kind === "present" ? 0 : formation.entry.atMs,
    locationId: formation.initialLocationId,
    intentId: formation.initialIntentId,
    actors: formation.actors.map((actor) => ({
      id: actor.id,
      label: actor.label,
      role: actor.role,
      profile: structuredClone(actor.profile),
      variability: structuredClone(actor.variability),
      random: createSeededRandom(deriveRandomStreamSeed(
        options.seed,
        `mock-autonomous-battle:${definition.id}:actor:${actor.id}`,
      )),
      condition: "effective",
      latestDecision: null,
      decisionCount: 0,
    })),
  }));

  const append = (event: AutonomousBattleEvent): void => {
    events.push(structuredClone(event));
    if (events.length > EVENT_CAPACITY) events.shift();
  };

  formations.filter(({ activeAtMs }) => activeAtMs === 0).forEach((formation) => {
    append({
      sequence: nextEventSequence++,
      atMs: 0,
      kind: "formation-activated",
      formationId: formation.id,
    });
  });
  harnessConsequences.forEach((consequence) => {
    append({
      sequence: nextEventSequence++,
      atMs: 0,
      kind: "harness-consequence",
      consequence,
    });
  });

  const decide = (actor: RuntimeActor, intentId: string): void => {
    const feedbackSource = actor.latestDecision === null ? "none" as const : "prior-action" as const;
    actor.decisionCount += 1;
    const traceId = `trace:${actor.id}:${actor.decisionCount}`;
    const informationConfidence = actor.random.next();
    const verificationConfidence = actor.random.next();
    const authorityConfidence = actor.random.next();
    const actionConfidence = actor.random.next();
    const feedbackConfidence = actor.random.next();
    const received = informationConfidence <= harness.informationReach;
    const verified = received && verificationConfidence <= harness.verificationDepth;
    const clear = authorityConfidence <= harness.authorityClarity;
    const executed = actionConfidence >= actor.variability.executionNoise;
    const integrated = feedbackConfidence <= harness.feedbackCompression;

    actor.latestDecision = {
      id: traceId,
      actorId: actor.id,
      startedAtMs: elapsedMs,
      completedAtMs: elapsedMs,
      information: {
        atMs: elapsedMs,
        state: received ? "received" : "missed",
        observationId: received ? `observation:${actor.id}:${actor.decisionCount}` : null,
        confidence: informationConfidence,
      },
      verification: {
        atMs: elapsedMs,
        observationId: received ? `observation:${actor.id}:${actor.decisionCount}` : null,
        state: !received ? "skipped" : verified ? "verified" : "contradicted",
        confidence: verificationConfidence,
      },
      authority: {
        atMs: elapsedMs,
        state: clear ? "clear" : actor.profile.initiative > 0.6 ? "self-directed" : "ambiguous",
        intentId: clear ? intentId : null,
        confidence: authorityConfidence,
      },
      action: {
        atMs: elapsedMs,
        state: executed ? "executed" : clear ? "failed" : "deferred",
        behaviorId: clear ? `intent:${intentId}` : "mock-independent-action",
        targetId: null,
        confidence: actionConfidence,
      },
      feedback: {
        atMs: elapsedMs,
        source: feedbackSource,
        state: feedbackSource === "none" ? "missing" : integrated ? "integrated" : "ignored",
        outcomeId: feedbackSource === "prior-action" && executed ? "mock-action-effective" : null,
        confidence: feedbackConfidence,
      },
    };
    append({
      sequence: nextEventSequence++,
      atMs: elapsedMs,
      kind: "actor-decision",
      actorId: actor.id,
      traceId,
    });
  };

  const snapshot = (): AutonomousBattleSnapshot => {
    const resolved = elapsedMs >= definition.durationMs;
    const progress = elapsedMs / definition.durationMs;
    return structuredClone({
      battleId: definition.id,
      elapsedMs,
      durationMs: definition.durationMs,
      resolution: resolved
        ? {
            state: "resolved" as const,
            disposition: "success" as const,
            outcomeId: "mock-objectives-achieved",
            resolvedAtMs: elapsedMs,
          }
        : { state: "running" as const },
      harness: {
        policies: harness,
        consequences: harnessConsequences,
      },
      formations: formations.map((formation) => ({
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
      objectives: definition.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        required: objective.required,
        progress: objective.criterion.comparator === "at-least"
          ? objective.criterion.required === 0 ? 1 : Math.min(1, progress / objective.criterion.required)
          : progress === 0 ? 1 : Math.min(1, objective.criterion.required / progress),
        state: resolved
          ? (objective.criterion.comparator === "at-least"
              ? progress >= objective.criterion.required
              : progress <= objective.criterion.required)
            ? "achieved" as const
            : "failed" as const
          : "active" as const,
        evidence: [{
          id: `evidence:${objective.id}:${objective.measurement}`,
          label: `${objective.label} 측정값`,
          kind: "number" as const,
          observed: progress,
          required: objective.criterion.required,
          comparator: objective.criterion.comparator,
          unit: "ratio" as const,
          satisfied: objective.criterion.comparator === "at-least"
            ? progress >= objective.criterion.required
            : progress <= objective.criterion.required,
        }],
      })),
      interventionBudget: {
        available: options.interventionBudget,
        spent: interventionSpent,
        remaining: options.interventionBudget - interventionSpent,
        count: interventionCount,
      },
      recentEvents: {
        capacity: EVENT_CAPACITY,
        firstSequence: events[0]?.sequence ?? nextEventSequence,
        nextSequence: nextEventSequence,
        items: events,
      },
    });
  };

  return {
    snapshot,
    advance(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError("Mock battle delta must be a non-negative finite number.");
      }
      if (elapsedMs >= definition.durationMs || deltaMs === 0) return snapshot();
      const beforeMs = elapsedMs;
      elapsedMs = Math.min(definition.durationMs, elapsedMs + deltaMs);
      formations.forEach((formation) => {
        if (beforeMs < formation.activeAtMs && elapsedMs >= formation.activeAtMs) {
          append({
            sequence: nextEventSequence++,
            atMs: elapsedMs,
            kind: "formation-activated",
            formationId: formation.id,
          });
        }
        if (elapsedMs >= formation.activeAtMs) {
          formation.actors.forEach((actor) => decide(actor, formation.intentId));
        }
      });
      if (elapsedMs >= definition.durationMs) {
        definition.objectives.forEach((objective) => append({
          sequence: nextEventSequence++,
          atMs: elapsedMs,
          kind: "objective-state-changed",
          objectiveId: objective.id,
          state: "achieved",
          progress: 1,
        }));
        append({
          sequence: nextEventSequence++,
          atMs: elapsedMs,
          kind: "operation-resolved",
          disposition: "success",
          outcomeId: "mock-objectives-achieved",
        });
      }
      return snapshot();
    },
    intervene(intervention) {
      let affected: RuntimeFormation[];
      if (intervention.kind === "set-formation-intent") {
        assertIdentifier(intervention.intentId, "Intervention intent");
        const formation = formations.find(({ id }) => id === intervention.formationId);
        if (!formation) throw new RangeError(`Unknown mock formation ${intervention.formationId}.`);
        affected = [formation];
      } else {
        assertIdentifier(intervention.guidanceId, "Intervention guidance");
        if (intervention.recipientFormationIds.length === 0 ||
            new Set(intervention.recipientFormationIds).size !==
              intervention.recipientFormationIds.length) {
          throw new RangeError("Guidance recipients must be non-empty and unique.");
        }
        affected = intervention.recipientFormationIds.map((formationId) => {
          const formation = formations.find(({ id }) => id === formationId);
          if (!formation) throw new RangeError(`Unknown mock formation ${formationId}.`);
          return formation;
        });
      }

      const rejectedReason = elapsedMs >= definition.durationMs
        ? "operation-resolved" as const
        : affected.some(({ sideId }) => sideId !== definition.playerControlledSideId)
          ? "formation-not-controllable" as const
        : interventionSpent + 1 > options.interventionBudget
          ? "insufficient-budget" as const
          : null;
      if (rejectedReason !== null) {
        const receipt = {
          status: "rejected" as const,
          id: `rejected:${rejectedReason}:${intervention.kind}:${elapsedMs}`,
          kind: intervention.kind,
          rejectedAtMs: elapsedMs,
          reason: rejectedReason,
          cost: 0 as const,
          affectedFormationIds: affected.map(({ id }) => id),
        };
        return structuredClone({ snapshot: snapshot(), receipt });
      }

      interventionSpent += 1;
      interventionCount += 1;
      const receipt = {
        status: "accepted" as const,
        id: `intervention:${interventionCount}`,
        kind: intervention.kind,
        appliedAtMs: elapsedMs,
        cost: 1,
        affectedFormationIds: affected.map(({ id }) => id),
      } as const;
      if (intervention.kind === "set-formation-intent") {
        affected[0]!.intentId = intervention.intentId;
        append({
          sequence: nextEventSequence++,
          atMs: elapsedMs,
          kind: "formation-intent-changed",
          formationId: affected[0]!.id,
          intentId: intervention.intentId,
        });
      }
      append({
        sequence: nextEventSequence++,
        atMs: elapsedMs,
        kind: "intervention-applied",
        receiptId: receipt.id,
        affectedFormationIds: receipt.affectedFormationIds,
      });
      return structuredClone({ snapshot: snapshot(), receipt });
    },
  };
};
