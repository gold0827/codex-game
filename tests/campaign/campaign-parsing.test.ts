import { describe, expect, it } from "vitest";

import {
  parseCampaignJson,
  parseCampaignValue,
  type CampaignDefinition,
} from "../../src/campaign";
import { completeCampaign } from "../../src/scenarios/completeCampaign";

describe("campaign parsing", () => {
  it("parses the complete campaign and clones the parsed boundary", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const result = parseCampaignValue(source);

    expect(result).toMatchObject({ ok: true, value: completeCampaign });
    if (!result.ok) throw new Error("Expected the complete campaign to parse.");
    (source.scenes[0].copy as { title: string }).title = "changed outside";
    expect(result.value.scenes[0].copy.title).toBe(
      completeCampaign.scenes[0].copy.title,
    );
  });

  it("returns a JSON diagnostic for malformed input", () => {
    const result = parseCampaignJson('{"id":');

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ kind: "json", code: "malformed-json", path: "$" }],
    });
  });

  it("returns shape diagnostics before the semantic validator", () => {
    const result = parseCampaignJson(
      JSON.stringify({ id: "incomplete", title: "Incomplete" }),
    );

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected incomplete input to fail.");
    expect(result.diagnostics.every(({ kind }) => kind === "shape")).toBe(true);
    expect(result.diagnostics.map(({ path }) => path)).toContain("$.scenes");
  });

  it("delegates structurally complete campaigns to semantic validation", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const transition = source.scenes[0].transitions[0] as {
      targetSceneId: string;
    };
    transition.targetSceneId = "missing-scene";

    const result = parseCampaignJson(JSON.stringify(source));

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected semantic validation to fail.");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: "validation",
        code: "missing-transition-target",
      }),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite JSON-incompatible number %s at the shape boundary",
    (durationMs) => {
      const source = structuredClone(completeCampaign) as CampaignDefinition;
      (source.scenes[0].encounterParameters as { durationMs: number }).durationMs =
        durationMs;

      const result = parseCampaignValue(source);

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [
          {
            kind: "shape",
            code: "invalid-shape",
            path: "$.scenes[0].encounterParameters.durationMs",
          },
        ],
      });
    },
  );
});
