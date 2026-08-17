import { describe, expect, it } from "vitest";

import {
  parseCampaignJson,
  parseCampaignValue,
  type CampaignDefinition,
  type CampaignGuidanceStep,
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

  it("round-trips a spatial signal guidance through JSON parsing", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    const guidance: CampaignGuidanceStep = {
      id: "defend-bridge",
      instruction: "교량에 방어 신호를 보낸다.",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "defend",
        strength: 2,
        position: { x: 11, y: 7 },
      },
      completionEvent: "spatial-signal-issued",
    };
    (source.scenes[0].guidance as CampaignGuidanceStep[])[0] = guidance;

    const result = parseCampaignJson(JSON.stringify(source));

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("Expected spatial signal guidance to parse.");
    expect(result.value.scenes[0].guidance[0]).toEqual(guidance);
  });

  it("imports legacy encounter knobs but removes them from the normalized campaign", () => {
    const source = structuredClone(completeCampaign) as unknown as {
      scenes: Array<{
        encounterParameters: Record<string, unknown>;
      }>;
    };
    source.scenes.forEach(({ encounterParameters }, index) => {
      encounterParameters.threatBudget = index * 1_000;
      encounterParameters.reinforcementIntervalMs = index === 0 ? "legacy" : -1;
    });

    const result = parseCampaignValue(source);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("Expected legacy campaign JSON to parse.");
    result.value.scenes.forEach(({ encounterParameters }) => {
      expect(encounterParameters).toEqual({ durationMs: encounterParameters.durationMs });
      expect(encounterParameters).not.toHaveProperty("threatBudget");
      expect(encounterParameters).not.toHaveProperty("reinforcementIntervalMs");
    });
  });

  it("rejects an unknown spatial signal kind at the shape boundary", () => {
    const source = structuredClone(completeCampaign) as CampaignDefinition;
    (source.scenes[0].guidance as unknown as Array<Record<string, unknown>>)[0] = {
      id: "invalid-signal",
      instruction: "잘못된 신호",
      action: "signal",
      target: {
        kind: "spatial-signal",
        signal: "broadcast",
        strength: 2,
        position: { x: 11, y: 7 },
      },
      completionEvent: "spatial-signal-issued",
    };

    const result = parseCampaignValue(source);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          kind: "shape",
          path: "$.scenes[0].guidance[0].target.signal",
        }),
      ],
    });
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
