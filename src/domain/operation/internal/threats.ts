import type { CampaignThreat, ThreatSeverity } from "../../../campaign/types";
import type { HarnessConfiguration, OfficerBeliefSnapshot } from "../../../simulation/simulationTypes";
import type {
  AppendReplay,
  MutableMetrics,
  MutableObjective,
  MutableOfficer,
  MutableThreat,
  MutableUnit,
  OperationRuntimeState,
} from "./operationTypes";
import { SEVERITY_DAMAGE, SEVERITY_THRESHOLD, clamp, rounded } from "./operationTypes";

export function threatDamage(severity: ThreatSeverity): number { return SEVERITY_DAMAGE[severity]; }
export function isThreatBlocked(defense: number, severity: ThreatSeverity): boolean { return defense >= SEVERITY_THRESHOLD[severity]; }

type ThreatContext = {
  harness: HarnessConfiguration;
  durationMs: number;
  readiness: number;
  state: OperationRuntimeState;
  officers: MutableOfficer[];
  threats: MutableThreat[];
  objectives: MutableObjective[];
  units: MutableUnit[];
  metrics: MutableMetrics;
  appendReplay: AppendReplay;
  addBelief: (officer: MutableOfficer, belief: OfficerBeliefSnapshot) => void;
  advanceSpatial: () => void;
};

export function createThreats(context: ThreatContext) {
  const { durationMs, readiness, state, officers, threats, objectives, units, metrics, appendReplay, addBelief, advanceSpatial } = context;

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
    officers.forEach((officer) => {
      const unit = units.find(({ officerId }) => officerId === officer.id);
      const locallyVisible = unit?.lane === threat.lane || (threat.lane === "command" && officer.disposition === "communication");
      if (locallyVisible) {
        addBelief(officer, {
          subjectId: threat.id,
          category: "threat",
          assertion: `${threat.kind} telegraphed in ${threat.lane}`,
          sourceOfficerId: null,
          receivedAtMs: timeMs,
          reliability: 1,
          verificationState: "verified",
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
    });
  };

  const resolveThreat = (threat: MutableThreat): void => {
    const dispositionSupport = officers.some(({ disposition, authorized }) => disposition === "action" && authorized) ? 0.07 : 0;
    const crossCheckSupport = threat.kind === "misinformation" && state.crossChecked ? 0.22 : 0;
    const replanSupport = state.autonomousReplan ? 0.12 : 0;
    const defense = readiness + dispositionSupport + crossCheckSupport + replanSupport;
    const blocked = isThreatBlocked(defense, threat.severity);
    threat.state = "resolved";
    threat.result = blocked ? "blocked" : "damaged-objective";
    if (blocked) {
      const objective = objectives.find(({ id }) => id === threat.target);
      if (objective) objective.progress = clamp(objective.progress + 0.12);
      metrics.organizationTrust = clamp(metrics.organizationTrust + 1, 0, 100);
    } else {
      const damage = threatDamage(threat.severity);
      const objective = objectives.find(({ id }) => id === threat.target);
      if (objective) objective.progress = clamp(objective.progress - 0.18);
      metrics.civilianSafety = clamp(metrics.civilianSafety - damage, 0, 100);
      metrics.logistics = clamp(metrics.logistics - Math.ceil(damage * 0.7), 0, 100);
      metrics.organizationTrust = clamp(metrics.organizationTrust - Math.ceil(damage * 0.6), 0, 100);
      const unit = units.find(({ lane }) => lane === threat.lane);
      if (unit) unit.health = clamp(unit.health - damage, 0, 100);
    }
    appendReplay("threat-resolved", threat.resolutionTimeMs, `Threat ${threat.id} ${blocked ? "was blocked" : "damaged its objective"} after its telegraph ended.`, {
      threatId: threat.id,
      result: threat.result,
      target: threat.target,
      telegraphEndsAtMs: threat.telegraphEndsAtMs,
      resolutionTimeMs: threat.resolutionTimeMs,
      defense: rounded(defense),
    });
  };

  const processThreats = (): void => {
    threats.forEach((threat) => {
      if (threat.state === "telegraphed" && threat.resolutionTimeMs <= state.elapsedMs) resolveThreat(threat);
    });
  };

  const updateProgress = (stepMs: number): void => {
    const progressIncrement = (stepMs / durationMs) * readiness * 1.25;
    objectives.forEach((objective) => { objective.progress = clamp(objective.progress + progressIncrement); });
    advanceSpatial();
    metrics.objectiveProgress = rounded(
      objectives.reduce((total, objective) => total + objective.progress, 0) / Math.max(1, objectives.length),
    );
  };

  return { telegraphThreat, resolveThreat, processThreats, updateProgress };
}
