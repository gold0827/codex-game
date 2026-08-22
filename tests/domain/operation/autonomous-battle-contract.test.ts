import type {
  AutonomousBattleActorDefinition,
  AutonomousBattleDefinition,
  AutonomousBattleHarnessPolicies,
} from "../../../src/domain/operation/autonomousBattle";
import { runAutonomousBattleContract } from "../../contracts/autonomous-battle.contract";
import { createMockAutonomousBattle } from "../../fixtures/mock-autonomous-battle";

const actor = (id: string): AutonomousBattleActorDefinition => ({
  id,
  label: id,
  role: "contract-role",
  profile: {
    initiative: 0.5,
    caution: 0.5,
    discipline: 0.5,
    cooperation: 0.5,
    stressTolerance: 0.5,
    memoryCapacity: 2,
    sourceTrust: [],
  },
  variability: {
    decisionNoise: 0.25,
    executionNoise: 0.25,
  },
});

const definition: AutonomousBattleDefinition = {
  id: "contract-battle",
  durationMs: 10_000,
  formations: [
    {
      id: "delaying-force",
      label: "지연 부대",
      sideId: "friendly",
      initialLocationId: "forward-line",
      initialIntentId: "delay",
      entry: { kind: "present" },
      actors: [actor("delay-1"), actor("delay-2")],
    },
    {
      id: "main-force",
      label: "주력 부대",
      sideId: "hostile",
      initialLocationId: "approach",
      initialIntentId: "advance",
      entry: { kind: "present" },
      actors: [actor("main-1"), actor("main-2"), actor("main-3"), actor("main-4"), actor("main-5")],
    },
    {
      id: "reserve",
      label: "예비대",
      sideId: "friendly",
      initialLocationId: "rear",
      initialIntentId: "reserve",
      entry: { kind: "elapsed", atMs: 5_000 },
      actors: [actor("reserve-1")],
    },
  ],
  objectives: [{ id: "delay", label: "진격 지연", required: true }],
};

const harness: AutonomousBattleHarnessPolicies = {
  informationReach: 0.7,
  authorityClarity: 0.7,
  verificationDepth: 0.7,
  feedbackCompression: 0.7,
};

runAutonomousBattleContract("mock adapter", createMockAutonomousBattle, {
  definition,
  harness,
  interventionBudget: 4,
});
