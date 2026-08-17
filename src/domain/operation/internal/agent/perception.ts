import type {
  AgentProfile,
  OfficerDisposition,
} from "../../../../campaign/types";
import type { VerificationState } from "../../../../simulation/simulationTypes";
import {
  createBoundedMemory,
  rememberInMemory,
  type BoundedMemory,
  type MemoryEntry,
} from "./memory";

export type PerceptionCategory = "report" | "signal" | "threat" | "outcome";
export type BeliefOrigin = "direct" | "received";

export interface ObservedFact {
  readonly subjectId: string;
  readonly category: PerceptionCategory;
  readonly assertion: string;
  readonly confidence: number;
  readonly sourceOfficerId?: string | null;
  readonly verificationState?: VerificationState;
}

export interface WorldObservation {
  readonly observedAtMs: number;
  readonly facts: readonly ObservedFact[];
}

export interface ReceivedReport {
  readonly reportId: string;
  readonly subjectId: string;
  readonly category: PerceptionCategory;
  readonly assertion: string;
  readonly sourceOfficerId: string;
  readonly receivedAtMs: number;
  readonly reliability: number;
  readonly verificationState: VerificationState;
}

export interface PerceptionMemoryEntry extends MemoryEntry {
  readonly subjectId: string;
  readonly category: PerceptionCategory;
  readonly assertion: string;
  readonly origin: BeliefOrigin;
  readonly sourceOfficerId: string | null;
  readonly receivedAtMs: number;
  readonly reliability: number;
  readonly verificationState: VerificationState;
}

export interface PerceivedBelief {
  readonly subjectId: string;
  readonly category: PerceptionCategory;
  readonly assertion: string;
  readonly origin: BeliefOrigin;
  readonly sourceOfficerId: string | null;
  readonly receivedAtMs: number;
  readonly reliability: number;
  readonly confidence: number;
  readonly verificationState: VerificationState;
}

export interface Perception {
  readonly beliefs: readonly PerceivedBelief[];
  readonly memory: BoundedMemory<PerceptionMemoryEntry>;
}

export interface PerceptionInput {
  readonly observation: WorldObservation;
  readonly receivedReports: readonly ReceivedReport[];
  readonly profile: AgentProfile;
  readonly memory: BoundedMemory<PerceptionMemoryEntry>;
  readonly nowMs: number;
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;
const clamp = (value: number): number => Math.min(1, Math.max(0, value));

function defaultTrust(profile: AgentProfile): number {
  return clamp(0.45 + profile.cooperation * 0.35 - profile.caution * 0.15);
}

function trustFor(profile: AgentProfile, sourceOfficerId: string | null): number {
  if (sourceOfficerId === null) return 1;
  return profile.sourceTrust.find(({ officerId }) => officerId === sourceOfficerId)?.trust ??
    defaultTrust(profile);
}

function confidenceAt(
  entry: PerceptionMemoryEntry,
  profile: AgentProfile,
  nowMs: number,
): number {
  const ageMs = Math.max(0, nowMs - entry.rememberedAtMs);
  const halfLifeMs = 10_000 + profile.discipline * 50_000;
  const decay = 0.5 ** (ageMs / halfLifeMs);
  const verificationFactor = entry.verificationState === "verified"
    ? 1
    : entry.verificationState === "pending"
      ? 0.9
      : entry.verificationState === "unverified"
        ? 0.75
        : 0.2;
  const sourceFactor = entry.origin === "direct"
    ? 0.8 + profile.discipline * 0.2
    : trustFor(profile, entry.sourceOfficerId);
  return round(clamp(entry.reliability * sourceFactor * verificationFactor * decay));
}

function validateTimeAndConfidence(timeMs: number, confidence: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new RangeError("Perception time must be a non-negative finite number.");
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError("Evidence confidence must be between zero and one.");
  }
}

export function perceive(input: PerceptionInput): Perception {
  const { observation, receivedReports, profile, nowMs } = input;
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("Perception time must be a non-negative finite number.");
  }
  const directEntries = observation.facts.map((fact): PerceptionMemoryEntry => {
    validateTimeAndConfidence(observation.observedAtMs, fact.confidence);
    return {
      memoryId: `direct:${fact.subjectId}`,
      rememberedAtMs: observation.observedAtMs,
      subjectId: fact.subjectId,
      category: fact.category,
      assertion: fact.assertion,
      origin: "direct",
      sourceOfficerId: fact.sourceOfficerId ?? null,
      receivedAtMs: observation.observedAtMs,
      reliability: fact.confidence,
      verificationState: fact.verificationState ?? "verified",
    };
  });
  const receivedEntries = receivedReports.map((report): PerceptionMemoryEntry => {
    validateTimeAndConfidence(report.receivedAtMs, report.reliability);
    return {
      memoryId: `received:${report.subjectId}:${report.sourceOfficerId}`,
      rememberedAtMs: report.receivedAtMs,
      subjectId: report.subjectId,
      category: report.category,
      assertion: report.assertion,
      origin: "received",
      sourceOfficerId: report.sourceOfficerId,
      receivedAtMs: report.receivedAtMs,
      reliability: report.reliability,
      verificationState: report.verificationState,
    };
  });
  const normalizedMemory = createBoundedMemory(
    profile.memoryCapacity,
    input.memory.entries,
  );
  const memory = rememberInMemory(normalizedMemory, [...directEntries, ...receivedEntries]);
  return {
    memory,
    beliefs: memory.entries.map((entry) => ({
      subjectId: entry.subjectId,
      category: entry.category,
      assertion: entry.assertion,
      origin: entry.origin,
      sourceOfficerId: entry.sourceOfficerId,
      receivedAtMs: entry.receivedAtMs,
      reliability: entry.reliability,
      confidence: confidenceAt(entry, profile, nowMs),
      verificationState: entry.verificationState,
    })),
  };
}

export function defaultAgentProfile(disposition: OfficerDisposition): AgentProfile {
  if (disposition === "action") {
    return {
      initiative: 0.85,
      caution: 0.25,
      discipline: 0.65,
      cooperation: 0.55,
      stressTolerance: 0.8,
      memoryCapacity: 8,
      sourceTrust: [],
    };
  }
  if (disposition === "verification") {
    return {
      initiative: 0.4,
      caution: 0.85,
      discipline: 0.9,
      cooperation: 0.65,
      stressTolerance: 0.7,
      memoryCapacity: 10,
      sourceTrust: [],
    };
  }
  return {
    initiative: 0.55,
    caution: 0.55,
    discipline: 0.7,
    cooperation: 0.9,
    stressTolerance: 0.6,
    memoryCapacity: 12,
    sourceTrust: [],
  };
}
