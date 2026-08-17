import { describe, expect, it } from "vitest";

import {
  validateCampaignDefinition,
  type AgentProfile,
  type CampaignDefinition,
  type CampaignOfficer,
  type CampaignScene,
} from "../../../../src/campaign";
import { createBoundedMemory } from "../../../../src/domain/operation/internal/agent/memory";
import {
  defaultAgentProfile,
  perceive,
  type PerceptionMemoryEntry,
} from "../../../../src/domain/operation/internal/agent/perception";
import { completeCampaign } from "../../../../src/scenarios/completeCampaign";
import { createOperationSimulation } from "../../../../src/simulation/operationSimulation";
import { BALANCED_HARNESS } from "../../../../src/simulation/simulationTypes";

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  initiative: 0.5,
  caution: 0.5,
  discipline: 0.5,
  cooperation: 0.5,
  stressTolerance: 0.5,
  memoryCapacity: 4,
  sourceTrust: [],
  ...overrides,
});

const emptyMemory = (capacity = 4) =>
  createBoundedMemory<PerceptionMemoryEntry>(capacity);

describe("officer perception", () => {
  it("materializes all five personality traits for every disposition", () => {
    const profiles = ["action", "verification", "communication"].map((disposition) =>
      defaultAgentProfile(disposition as "action" | "verification" | "communication"),
    );

    profiles.forEach((agentProfile) => {
      expect(agentProfile).toMatchObject({
        initiative: expect.any(Number),
        caution: expect.any(Number),
        discipline: expect.any(Number),
        cooperation: expect.any(Number),
        stressTolerance: expect.any(Number),
      });
    });
    expect(new Set(profiles.map(({ initiative }) => initiative)).size).toBeGreaterThan(1);
  });

  it("distinguishes direct observations from received reports", () => {
    const perception = perceive({
      observation: {
        observedAtMs: 1_000,
        facts: [{
          subjectId: "bridge-state",
          category: "threat",
          assertion: "bridge is blocked",
          confidence: 1,
        }],
      },
      receivedReports: [{
        reportId: "report-1",
        subjectId: "reserve-state",
        category: "report",
        assertion: "reserve is ready",
        sourceOfficerId: "captain-han",
        receivedAtMs: 1_000,
        reliability: 0.9,
        verificationState: "verified",
      }],
      profile: profile(),
      memory: emptyMemory(),
      nowMs: 1_000,
    });

    expect(perception.beliefs).toEqual([
      expect.objectContaining({ subjectId: "bridge-state", origin: "direct" }),
      expect.objectContaining({
        subjectId: "reserve-state",
        origin: "received",
        sourceOfficerId: "captain-han",
      }),
    ]);
  });

  it("applies officer-specific source trust and time decay to confidence", () => {
    const report = {
      reportId: "report-1",
      subjectId: "ridge-state",
      category: "report" as const,
      assertion: "ridge is clear",
      sourceOfficerId: "captain-han",
      receivedAtMs: 0,
      reliability: 1,
      verificationState: "verified" as const,
    };
    const highTrustProfile = profile({
      discipline: 0.8,
      sourceTrust: [{ officerId: "captain-han", trust: 0.9 }],
    });
    const lowTrustProfile = profile({
      discipline: 0.8,
      sourceTrust: [{ officerId: "captain-han", trust: 0.2 }],
    });
    const atReceipt = perceive({
      observation: { observedAtMs: 0, facts: [] },
      receivedReports: [report],
      profile: highTrustProfile,
      memory: emptyMemory(),
      nowMs: 0,
    });
    const later = perceive({
      observation: { observedAtMs: 60_000, facts: [] },
      receivedReports: [],
      profile: highTrustProfile,
      memory: atReceipt.memory,
      nowMs: 60_000,
    });
    const lowTrust = perceive({
      observation: { observedAtMs: 0, facts: [] },
      receivedReports: [report],
      profile: lowTrustProfile,
      memory: emptyMemory(),
      nowMs: 0,
    });

    expect(atReceipt.beliefs[0]?.confidence).toBe(0.9);
    expect(lowTrust.beliefs[0]?.confidence).toBe(0.2);
    expect(later.beliefs[0]?.confidence).toBeLessThan(atReceipt.beliefs[0]?.confidence ?? 0);
  });

  it("keeps only each officer's most recent bounded memories", () => {
    let memory = emptyMemory(2);
    for (let index = 0; index < 3; index += 1) {
      memory = perceive({
        observation: {
          observedAtMs: index,
          facts: [{
            subjectId: `fact-${index}`,
            category: "threat",
            assertion: `fact ${index}`,
            confidence: 1,
          }],
        },
        receivedReports: [],
        profile: profile({ memoryCapacity: 2 }),
        memory,
        nowMs: index,
      }).memory;
    }

    expect(memory.entries.map(({ subjectId }) => subjectId)).toEqual(["fact-1", "fact-2"]);
  });

  it("does not expose an unreceived officer fact through the headless runtime", () => {
    const scene = completeCampaign.scenes.find(
      ({ identity }) => identity.kind === "tutorial",
    ) as CampaignScene;
    const simulation = createOperationSimulation(
      scene,
      completeCampaign.officers,
      "local-memory-counterexample",
      { ...BALANCED_HARNESS, informationReach: 0 },
    );
    simulation.advance(5_000);
    const snapshot = simulation.snapshot();
    const reportId = scene.beats[0]?.reports[0]?.id;
    const sourceOfficerId = scene.beats[0]?.reports[0]?.officerId;
    const source = snapshot.officers.find(({ id }) => id === sourceOfficerId);
    const uninformed = snapshot.officers.filter(({ id }) => id !== sourceOfficerId);

    expect(source?.beliefs).toContainEqual(expect.objectContaining({
      subjectId: reportId,
      origin: "direct",
    }));
    uninformed.forEach((officer) => {
      expect(officer.beliefs.some(({ subjectId }) => subjectId === reportId)).toBe(false);
    });
    snapshot.officers.forEach((officer) => {
      expect(officer.memorySize).toBeLessThanOrEqual(officer.profile.memoryCapacity);
    });
  });

  it("uses authored source trust and memory caps in the headless runtime", () => {
    const scene = completeCampaign.scenes.find(
      ({ identity }) => identity.kind === "tutorial",
    ) as CampaignScene;
    const sourceOfficerId = scene.beats[0]?.reports[0]?.officerId ?? "major-baek";
    const reportId = scene.beats[0]?.reports[0]?.id;
    const roster = completeCampaign.officers.map((officer): CampaignOfficer => ({
      ...officer,
      profile: profile({
        memoryCapacity: 1,
        sourceTrust: [{
          officerId: sourceOfficerId,
          trust: officer.id === "captain-han" ? 0.9 : 0.2,
        }],
      }),
    }));
    const simulation = createOperationSimulation(
      scene,
      roster,
      "authored-trust-runtime",
      { ...BALANCED_HARNESS, informationReach: 1 },
    );
    simulation.advance(5_000);
    const snapshot = simulation.snapshot();
    const trustedBelief = snapshot.officers.find(({ id }) => id === "captain-han")
      ?.beliefs.find(({ subjectId }) => subjectId === reportId);
    const distrustedBelief = snapshot.officers.find(({ id }) => id === "lieutenant-kim")
      ?.beliefs.find(({ subjectId }) => subjectId === reportId);

    expect(trustedBelief?.origin).toBe("received");
    expect(trustedBelief?.confidence).toBeGreaterThan(distrustedBelief?.confidence ?? 1);
    snapshot.officers.forEach((officer) => {
      expect(officer.profile.memoryCapacity).toBe(1);
      expect(officer.memorySize).toBeLessThanOrEqual(1);
    });
  });
});

describe("officer profile validation", () => {
  it("rejects out-of-range traits, invalid memory caps, and unknown trust sources", () => {
    const definition = structuredClone(completeCampaign) as CampaignDefinition;
    (definition.officers[0] as { profile: AgentProfile }).profile = profile({
      initiative: 1.1,
      memoryCapacity: 0,
      sourceTrust: [{ officerId: "missing-officer", trust: 0.5 }],
    });

    expect(validateCampaignDefinition(definition).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-officer-profile",
          field: "officers[0].profile.initiative",
        }),
        expect.objectContaining({
          code: "invalid-officer-profile",
          field: "officers[0].profile.memoryCapacity",
        }),
        expect.objectContaining({
          code: "unknown-officer-reference",
          field: "officers[0].profile.sourceTrust[0].officerId",
        }),
      ]),
    );
  });
});
