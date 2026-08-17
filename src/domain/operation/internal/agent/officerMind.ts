import type { AgentProfile } from "../../../../campaign/types";
import type { SeededRandom } from "../../../../simulation/seededRandom";
import type { Perception } from "./perception";
import {
  type ActionCommitment,
  type DecisionTrace,
  type OfficerAction,
  type OfficerActionKind,
} from "./actions";

export type OfficerMindContext = Readonly<{
  objectiveId: string;
  positionId: string;
  fallbackAreaId: string;
  supportOfficerId: string;
  normalizedDistance: number;
  risk: number;
  memoryPressure: number;
  signalLoad: number;
}>;

export type OfficerMindInput = Readonly<{
  perception: Perception;
  context: OfficerMindContext;
  nowMs: number;
  currentCommitment: ActionCommitment | null;
}>;

export type OfficerMind = Readonly<{
  cadenceMs: number;
  consider: (input: OfficerMindInput) => ActionCommitment | null;
}>;

type UtilityComponent = Readonly<{ value: number; reason: string }>;
type Candidate = Readonly<{
  action: OfficerAction;
  utility: number;
  topReason: string;
}>;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;

function strongest(components: readonly UtilityComponent[]): UtilityComponent {
  return components.reduce((best, component) =>
    component.value > best.value ? component : best
  );
}

function targetFor(
  kind: OfficerActionKind,
  perception: Perception,
  context: OfficerMindContext,
): OfficerAction["target"] {
  const uncertainBelief = [...perception.beliefs]
    .sort((left, right) => left.confidence - right.confidence)[0];
  const latestBelief = perception.beliefs.at(-1);
  if (kind === "move") return { kind: "position", id: context.positionId };
  if (kind === "investigate" || kind === "verify") {
    return { kind: "belief", id: uncertainBelief?.subjectId ?? "unconfirmed-local-report" };
  }
  if (kind === "defend") return { kind: "objective", id: context.objectiveId };
  if (kind === "broadcast") {
    return { kind: "belief", id: latestBelief?.subjectId ?? "local-status" };
  }
  if (kind === "support") return { kind: "officer", id: context.supportOfficerId };
  return { kind: "area", id: context.fallbackAreaId };
}

function scoreCandidates(
  profile: AgentProfile,
  perception: Perception,
  context: OfficerMindContext,
  random: SeededRandom,
): Candidate[] {
  const averageConfidence = perception.beliefs.length === 0
    ? 0
    : perception.beliefs.reduce((total, belief) => total + belief.confidence, 0) /
      perception.beliefs.length;
  const uncertainty = 1 - averageConfidence;
  const components: Record<OfficerActionKind, readonly UtilityComponent[]> = {
    move: [
      { value: profile.initiative * 0.52, reason: "initiative favors moving" },
      { value: context.normalizedDistance * 0.24, reason: "the objective is still distant" },
      { value: (1 - context.risk * profile.caution) * 0.12, reason: "the route risk is acceptable" },
    ],
    investigate: [
      { value: profile.caution * 0.3, reason: "caution favors investigation" },
      { value: profile.discipline * 0.2, reason: "discipline favors gathering evidence" },
      { value: uncertainty * 0.36, reason: "belief confidence is low" },
    ],
    defend: [
      { value: profile.caution * 0.24, reason: "caution favors holding ground" },
      { value: profile.discipline * 0.2, reason: "discipline favors protecting the objective" },
      { value: context.risk * 0.42, reason: "local threat risk is high" },
    ],
    verify: [
      { value: profile.caution * 0.3, reason: "caution favors verification" },
      { value: profile.discipline * 0.25, reason: "discipline favors cross-checking" },
      { value: uncertainty * 0.38, reason: "available evidence is uncertain" },
    ],
    broadcast: [
      { value: profile.cooperation ** 2 * 0.8, reason: "cooperation favors sharing information" },
      { value: averageConfidence * 0.22, reason: "a credible belief is ready to share" },
      { value: (1 - context.signalLoad) * 0.18, reason: "the signal channel has capacity" },
    ],
    support: [
      { value: profile.cooperation * 0.48, reason: "cooperation favors supporting a peer" },
      { value: context.risk * 0.2, reason: "a peer faces local danger" },
      { value: profile.initiative * 0.1, reason: "initiative favors acting on the request" },
    ],
    retreat: [
      { value: profile.caution * 0.2, reason: "caution favors breaking contact" },
      { value: (1 - profile.stressTolerance) * 0.3, reason: "stress exceeds tolerance" },
      { value: context.risk * 0.48, reason: "local threat risk is overwhelming" },
    ],
  };

  return (Object.keys(components) as OfficerActionKind[]).map((kind) => {
    const values = components[kind];
    const memoryFactor = kind === "investigate" || kind === "verify"
      ? context.memoryPressure * 0.08
      : 0;
    const noise = (random.next() - 0.5) * 0.12;
    return {
      action: { kind, target: targetFor(kind, perception, context) },
      utility: rounded(clamp(0.08 + values.reduce((total, component) => total + component.value, 0) + memoryFactor + noise)),
      topReason: strongest(values).reason,
    };
  });
}

export function decideOfficerAction(
  perception: Perception,
  profile: AgentProfile,
  context: OfficerMindContext,
  random: SeededRandom,
): DecisionTrace {
  const ranked = scoreCandidates(profile, perception, context, random)
    .sort((left, right) => right.utility - left.utility || left.action.kind.localeCompare(right.action.kind));
  const selected = ranked[0] as Candidate;
  const abandoned = ranked[1] as Candidate;
  return {
    selectedAction: selected.action,
    utility: selected.utility,
    topReason: selected.topReason,
    abandonedAlternative: {
      action: abandoned.action,
      utility: abandoned.utility,
    },
  };
}

export function createOfficerMind(
  actorId: string,
  profile: AgentProfile,
  random: SeededRandom,
): OfficerMind {
  if (actorId.length === 0) throw new TypeError("OfficerMind requires an actor identifier.");
  const cadenceMs = Math.round(
    650 + (1 - profile.discipline) * 550 + random.next() * 350,
  );
  let nextDecisionAtMs = 0;

  const consider = (input: OfficerMindInput): ActionCommitment | null => {
    if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
      throw new RangeError("OfficerMind time must be a non-negative safe integer.");
    }
    if (
      input.currentCommitment &&
      input.currentCommitment.endsAtMs > input.nowMs
    ) return null;
    if (input.nowMs < nextDecisionAtMs) return null;

    const trace = decideOfficerAction(input.perception, profile, input.context, random);
    const durationMs = 1_000 + random.integer(2_001);
    nextDecisionAtMs = input.nowMs + cadenceMs;
    return {
      trace,
      startedAtMs: input.nowMs,
      endsAtMs: input.nowMs + durationMs,
    };
  };

  return { cadenceMs, consider };
}
