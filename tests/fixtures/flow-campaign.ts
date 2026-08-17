import type { CampaignDefinition } from "../../src/campaign";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

export const flowCampaign: CampaignDefinition = {
  ...structuredClone(completeCampaign),
  id: "flow-campaign",
  scenes: completeCampaign.scenes.map((scene) => scene.identity.kind === "epilogue"
    ? structuredClone(scene)
    : {
        ...structuredClone(scene),
        beats: scene.beats.map((beat) => ({ ...structuredClone(beat), threats: [] })),
        objectives: scene.objectives.map((objective) => ({
          ...structuredClone(objective),
          required: false,
        })),
      }),
};
