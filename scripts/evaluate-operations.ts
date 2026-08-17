import { completeCampaign } from "../src/scenarios/completeCampaign";
import {
  NO_INTERVENTION_POLICY,
  compareOperationPolicies,
  createScriptedPolicy,
  evaluateOperations,
} from "../src/simulation/operationEvaluation";
import { BALANCED_HARNESS } from "../src/simulation/simulationTypes";

type EvaluationMode = "none" | "scripted" | "paired";

type CliOptions = Readonly<{
  sceneId: string;
  start: number;
  count: number;
  mode: EvaluationMode;
}>;

const playableScenes = completeCampaign.scenes.filter(
  ({ identity }) => identity.kind !== "epilogue",
);

function readInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`${option} requires a safe integer.`);
  }
  return parsed;
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  let sceneId = playableScenes[0]?.identity.id ?? "";
  let start = 0;
  let count = 500;
  let mode: EvaluationMode = "paired";

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (value === undefined) throw new TypeError(`${option} requires a value.`);

    if (option === "--scene") sceneId = value;
    else if (option === "--start") start = readInteger(value, option);
    else if (option === "--count") count = readInteger(value, option);
    else if (option === "--mode") {
      if (value !== "none" && value !== "scripted" && value !== "paired") {
        throw new RangeError("--mode must be none, scripted, or paired.");
      }
      mode = value;
    } else {
      throw new TypeError(`Unknown option ${option}.`);
    }
  }

  return { sceneId, start, count, mode };
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const scene = playableScenes.find(
    ({ identity }) => identity.id === options.sceneId,
  );
  if (!scene) {
    throw new RangeError(`Unknown playable scene ${options.sceneId}.`);
  }
  const firstThreatBeat = scene.beats.find(({ threats }) => threats.length > 0);
  const firstThreat = firstThreatBeat?.threats[0];
  const laneIndex = firstThreat?.lane === "south" ? 2 : firstThreat?.lane === "center" ? 1 : 0;
  const signalPosition = scene.mapTopology?.destinations[laneIndex]?.position;
  if (!firstThreatBeat || !firstThreat || !signalPosition) {
    throw new RangeError("Operation evaluation requires a spatially authored threat.");
  }
  if (options.mode !== "none" && scene.gameplayTuning.interventionBudget < 1) {
    throw new RangeError("Paired operation evaluation requires at least one intervention point.");
  }
  const signalAtMs = Math.max(0, firstThreatBeat.timeMs - 1_000);
  const signalStrength = Math.min(
    3,
    Math.max(1, Math.floor(scene.gameplayTuning.interventionBudget)),
  ) as 1 | 2 | 3;
  const scriptedPolicy = createScriptedPolicy("scripted-spatial-control", [
    {
      atMs: signalAtMs,
      intervention: {
        kind: "issue-spatial-signal",
        signal: firstThreat.kind === "misinformation" ? "investigate" : "defend",
        strength: signalStrength,
        position: signalPosition,
      },
    },
  ]);
  const commonInput = {
    scene,
    roster: completeCampaign.officers,
    seedRange: { start: options.start, count: options.count },
    harness: BALANCED_HARNESS,
  };
  const result =
    options.mode === "paired"
      ? compareOperationPolicies({
          ...commonInput,
          baselinePolicy: NO_INTERVENTION_POLICY,
          comparisonPolicy: scriptedPolicy,
        })
      : evaluateOperations({
          ...commonInput,
          policy:
            options.mode === "scripted"
              ? scriptedPolicy
              : NO_INTERVENTION_POLICY,
        });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
