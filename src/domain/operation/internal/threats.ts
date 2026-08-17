import type { CampaignThreat, ThreatSeverity } from "../../../campaign/types";
import type { SeededRandom } from "../../../simulation/seededRandom";
import type { OfficerBeliefSnapshot, ReplayDataValue } from "../../../simulation/simulationTypes";
import type { EncounterEvent, EncounterSimulation } from "./encounterTypes";
import type {
  AppendReplay,
  AppendWorldEvent,
  MutableMetrics,
  MutableObjective,
  MutableOfficer,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
} from "./operationTypes";
import { SEVERITY_DAMAGE, clamp, rounded } from "./operationTypes";
import type { SpatialWorld } from "./spatial";

export function threatDamage(severity: ThreatSeverity): number { return SEVERITY_DAMAGE[severity]; }

type ThreatContext = {
  durationMs: number;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  threats: MutableThreat[];
  objectives: MutableObjective[];
  units: MutableUnit[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  appendWorldEvent: AppendWorldEvent;
  addBelief: (officer: MutableOfficer, belief: OfficerBeliefSnapshot) => void;
  spatialWorld: SpatialWorld;
  encounter: EncounterSimulation;
  threatActorId: (threatId: string) => string;
  noticeThreat: (officer: MutableOfficer, threat: CampaignThreat) => boolean;
  resolutionRandom: (threatId: string) => SeededRandom;
};

function encounterEventData(event: EncounterEvent): Readonly<Record<string, ReplayDataValue>> {
  if (event.kind === "attack-blocked") {
    return { actorId: event.actorId, targetId: event.targetId, reason: event.reason };
  }
  if (event.kind === "attack-missed") {
    return { actorId: event.actorId, targetId: event.targetId };
  }
  if (event.kind === "unit-hit") {
    return {
      actorId: event.actorId,
      targetId: event.targetId,
      damage: event.damage,
      remainingHealth: event.remainingHealth,
      inCover: event.inCover,
    };
  }
  if (event.kind === "unit-suppressed") {
    return { actorId: event.actorId, sourceId: event.sourceId, suppression: event.suppression };
  }
  if (event.kind === "unit-retreated") {
    return {
      actorId: event.actorId,
      sourceId: event.sourceId,
      fromX: event.from.x,
      fromY: event.from.y,
      toX: event.to.x,
      toY: event.to.y,
    };
  }
  if (event.kind === "target-misidentified") {
    return { actorId: event.actorId, mistakenTargetId: event.mistakenTargetId ?? "" };
  }
  if (event.kind === "ally-followed") {
    return {
      actorId: event.actorId,
      allyId: event.allyId ?? "",
      fromX: event.from.x,
      fromY: event.from.y,
      toX: event.to.x,
      toY: event.to.y,
    };
  }
  return { actorId: event.actorId };
}

export function createThreats(context: ThreatContext) {
  const {
    durationMs, state, officers, threats, objectives, units, metrics, appendReplay, appendWorldEvent,
    addBelief, spatialWorld, encounter, threatActorId, noticeThreat, resolutionRandom,
  } = context;

  const recordEncounterEvents = (events: readonly EncounterEvent[]): void => {
    events.forEach((event) => {
      if ((event.kind === "unit-retreated" || event.kind === "ally-followed") &&
          (event.from.x !== event.to.x || event.from.y !== event.to.y) &&
          units.some(({ officerId }) => officerId === event.actorId)) {
        spatialWorld.execute({ actorId: event.actorId, destination: event.to });
      }
      appendWorldEvent(event.kind, event.timeMs, encounterEventData(event));
    });
  };

  const syncUnits = (): void => {
    const snapshots = encounter.snapshot().actors;
    units.forEach((unit) => {
      const actor = snapshots.find(({ id }) => id === unit.officerId);
      if (!actor) throw new Error(`Missing encounter actor "${unit.officerId}".`);
      unit.health = actor.health;
      unit.suppression = actor.suppression;
      unit.panicReaction = actor.panicReaction;
    });
  };

  const syncEncounter = (): void => {
    spatialWorld.snapshot().actors.forEach((actor) => {
      encounter.execute({ kind: "relocate", actorId: actor.actorId, position: actor.position });
    });
    const encounterElapsedMs = encounter.snapshot().elapsedMs;
    if (encounterElapsedMs > state.elapsedMs) {
      throw new Error("Encounter runtime advanced beyond operation time.");
    }
    recordEncounterEvents(encounter.advance(state.elapsedMs - encounterElapsedMs));
    syncUnits();
  };

  const telegraphThreat = (threat: CampaignThreat, timeMs: number): void => {
    const objective = objectives[threats.length % Math.max(1, objectives.length)];
    const telegraphEndsAtMs = timeMs + threat.telegraphDurationMs;
    threats.push({
      id: threat.id,
      kind: threat.kind,
      lane: threat.lane,
      severity: threat.severity,
      target: objective?.id ?? threat.lane,
      telegraphedAtMs: timeMs,
      telegraphEndsAtMs,
      resolutionTimeMs: telegraphEndsAtMs,
      state: "telegraphed",
      result: null,
    });
    const observedByOfficerIds: string[] = [];
    officers.forEach((officer) => {
      const unit = units.find(({ officerId }) => officerId === officer.id);
      const locallyVisible = unit?.lane === threat.lane ||
        (threat.lane === "command" && officer.disposition === "communication");
      if (locallyVisible && noticeThreat(officer, threat)) {
        observedByOfficerIds.push(officer.id);
        addBelief(officer, {
          subjectId: threat.id,
          category: "threat",
          assertion: `${threat.kind} telegraphed in ${threat.lane}`,
          origin: "direct",
          sourceOfficerId: null,
          receivedAtMs: timeMs,
          reliability: 1,
          confidence: 1,
          verificationState: "verified",
          threatKind: threat.kind,
          threatSeverity: threat.severity,
        });
      }
    });
    appendReplay("threat-telegraphed", timeMs, `Threat ${threat.id} telegraphed before resolution.`, {
      threatId: threat.id,
      kind: threat.kind,
      lane: threat.lane,
      severity: threat.severity,
      target: objective?.id ?? threat.lane,
      telegraphEndsAtMs,
      observedByOfficerIds,
    });
  };

  const resolveThreat = (threat: MutableThreat): void => {
    const hostileId = threatActorId(threat.id);
    const encounterActors = encounter.snapshot().actors;
    const hostile = encounterActors.find(({ id }) => id === hostileId);
    if (!hostile) throw new Error(`Missing hostile encounter actor "${hostileId}".`);
    const signalReach = Math.max(2, Math.floor(spatialWorld.snapshot().topology.height / 4));
    const knowsThreat = (officer: MutableOfficer): boolean => officer.memory.entries.some((entry) => {
      if (entry.subjectId === threat.id) return true;
      const match = entry.category === "signal"
        ? /^defend@(\d+),(\d+)$/.exec(entry.assertion)
        : null;
      if (!match) return false;
      const signalPosition = { x: Number(match[1]), y: Number(match[2]) };
      return Math.abs(signalPosition.x - hostile.position.x) +
        Math.abs(signalPosition.y - hostile.position.y) <= signalReach;
    });
    const canAct = (officer: MutableOfficer): boolean =>
      (units.find(({ officerId }) => officerId === officer.id)?.health ?? 0) > 0 &&
      units.find(({ officerId }) => officerId === officer.id)?.panicReaction === null;
    let engagingOfficerId = "";
    let blocked = false;

    if (threat.kind === "misinformation" || threat.kind === "communications") {
      const responseKinds = threat.kind === "misinformation"
        ? new Set(["verify", "investigate"])
        : new Set(["broadcast", "support"]);
      const responders = officers.filter((officer) => {
        const action = officer.committedAction?.trace.selectedAction.kind;
        return action !== undefined && responseKinds.has(action) && knowsThreat(officer) && canAct(officer);
      });
      const random = resolutionRandom(threat.id);
      for (const officer of responders) {
        const action = officer.committedAction?.trace.selectedAction.kind;
        const skill = threat.kind === "misinformation"
          ? officer.profile.discipline
          : officer.profile.cooperation;
        const chance = clamp(
          0.2 + skill * 0.5 + (action === "verify" || action === "broadcast" ? 0.12 : 0),
        );
        if (random.next() < chance) {
          engagingOfficerId = officer.id;
          blocked = true;
          break;
        }
      }
    } else {
      const actionPriority = { defend: 0, move: 1, support: 2 } as const;
      const candidates = officers
      .filter((officer) =>
        officer.committedAction !== null &&
        officer.committedAction.trace.selectedAction.kind in actionPriority &&
        knowsThreat(officer) && canAct(officer)
      )
      .sort((left, right) => {
        const leftUnit = units.find(({ officerId }) => officerId === left.id);
        const rightUnit = units.find(({ officerId }) => officerId === right.id);
        const laneOrder = Number(rightUnit?.lane === threat.lane) - Number(leftUnit?.lane === threat.lane);
        if (laneOrder !== 0) return laneOrder;
        const priority = (officer: MutableOfficer): number => {
          const kind = officer.committedAction?.trace.selectedAction.kind;
          return kind && kind in actionPriority
            ? actionPriority[kind as keyof typeof actionPriority]
            : 3;
        };
        return priority(left) - priority(right) || left.id.localeCompare(right.id);
      });
      const officer = candidates[0];
      if (officer) {
        engagingOfficerId = officer.id;
        const action = officer.committedAction?.trace.selectedAction.kind;
        const attempts = action === "defend" ? 3 : 1;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const events = encounter.execute({ kind: "attack", actorId: officer.id, targetId: hostileId });
          recordEncounterEvents(events);
          if (encounter.snapshot().actors.find(({ id }) => id === hostileId)?.health === 0) break;
        }
      }
      blocked = encounter.snapshot().actors.find(({ id }) => id === hostileId)?.health === 0;
    }
    const informationalThreat = threat.kind === "misinformation" || threat.kind === "communications";
    if (!blocked && !informationalThreat) {
      const livingUnits = units.filter(({ health }) => health > 0);
      const target = livingUnits.find(({ lane }) => lane === threat.lane) ?? livingUnits[0];
      if (target) {
        recordEncounterEvents(encounter.execute({
          kind: "attack",
          actorId: hostileId,
          targetId: target.officerId,
        }));
      }
    }
    syncUnits();
    threat.state = "resolved";
    threat.result = blocked ? "blocked" : "damaged-objective";
    if (blocked) {
      const objective = objectives.find(({ id }) => id === threat.target);
      if (objective) objective.progress = clamp(objective.progress + 0.12);
      metrics.organizationTrust = clamp(metrics.organizationTrust + 1, 0, 100);
    } else {
      const damage = threatDamage(threat.severity);
      if (informationalThreat) {
        metrics.logistics = clamp(metrics.logistics - Math.ceil(damage * 0.25), 0, 100);
        metrics.organizationTrust = clamp(metrics.organizationTrust - damage, 0, 100);
      } else {
        const objective = objectives.find(({ id }) => id === threat.target);
        if (objective) objective.progress = clamp(objective.progress - 0.18);
        metrics.civilianSafety = clamp(metrics.civilianSafety - damage, 0, 100);
        metrics.logistics = clamp(metrics.logistics - Math.ceil(damage * 0.7), 0, 100);
        metrics.organizationTrust = clamp(metrics.organizationTrust - Math.ceil(damage * 0.6), 0, 100);
      }
    }
    appendReplay("threat-resolved", threat.resolutionTimeMs, `Threat ${threat.id} ${blocked ? "was blocked" : "damaged its objective"} after its telegraph ended.`, {
      threatId: threat.id,
      result: threat.result,
      target: threat.target,
      telegraphEndsAtMs: threat.telegraphEndsAtMs,
      resolutionTimeMs: threat.resolutionTimeMs,
      engagingOfficerId,
    });
  };

  const processThreats = (): void => {
    syncEncounter();
    threats.forEach((threat) => {
      if (threat.state === "telegraphed" && threat.resolutionTimeMs <= state.elapsedMs) resolveThreat(threat);
    });
  };

  const updateProgress = (stepMs: number): void => {
    const healthyRatio = units.reduce((total, unit) => total + unit.health, 0) /
      Math.max(1, units.length * 100);
    const progressIncrement = (stepMs / durationMs) * healthyRatio * 1.25;
    objectives.forEach((objective) => { objective.progress = clamp(objective.progress + progressIncrement); });
    spatialWorld.advance();
    metrics.objectiveProgress = rounded(
      objectives.reduce((total, objective) => total + objective.progress, 0) / Math.max(1, objectives.length),
    );
  };

  return { telegraphThreat, resolveThreat, processThreats, updateProgress };
}
