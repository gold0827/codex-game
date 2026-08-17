import { describe, expect, it, vi } from "vitest";

import type { BattlefieldThreatFrame } from "../../src/presentation/battlefield/battlefieldFrame";
import {
  drawBattlefieldThreatMarker,
  threatMarkerAppearance,
} from "../../src/presentation/battlefield/internal/threatMarker";

function threat(
  overrides: Partial<BattlefieldThreatFrame> = {},
): BattlefieldThreatFrame {
  return {
    id: "artillery",
    position: { x: 4, y: 5 },
    category: "physical",
    kind: "artillery",
    severity: "medium",
    state: "telegraphed",
    result: null,
    health: 55,
    glyph: "✹",
    severityGlyph: "Ⅱ",
    statusGlyph: "…",
    label: "물리적 위협 포격. 심각도 중간. 예고 중. 타일 4, 5",
    ...overrides,
  };
}

function recordingContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("procedural battlefield threat marker", () => {
  it("draws physical threats as diamonds with kind, severity, and state glyphs", () => {
    const context = recordingContext();
    const frame = threat();

    drawBattlefieldThreatMarker(context, frame, { x: 120, y: 80 }, 1);

    expect(threatMarkerAppearance(frame)).toMatchObject({
      shape: "diamond",
      fill: "#ef9145",
      opacity: 1,
    });
    expect(context.moveTo).toHaveBeenCalled();
    expect(context.lineTo).toHaveBeenCalledTimes(3);
    expect(context.setLineDash).toHaveBeenCalledWith([]);
    expect(context.fillText).toHaveBeenNthCalledWith(1, "✹", 120, 68);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "Ⅱ", 120, 77);
    expect(context.fillText).toHaveBeenNthCalledWith(3, "…", 130, 60);
  });

  it("draws resolved informational threats as dashed signals with an outcome glyph", () => {
    const context = recordingContext();
    const frame = threat({
      category: "informational",
      kind: "misinformation",
      severity: "high",
      state: "resolved",
      result: "blocked",
      glyph: "?",
      severityGlyph: "Ⅲ",
      statusGlyph: "✓",
    });

    drawBattlefieldThreatMarker(context, frame, { x: 120, y: 80 }, 1);

    expect(threatMarkerAppearance(frame)).toMatchObject({
      shape: "signal",
      fill: "#5f756c",
      opacity: 0.82,
    });
    expect(context.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(context.arc).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenNthCalledWith(1, "?", 120, 68);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "Ⅲ", 120, 77);
    expect(context.fillText).toHaveBeenNthCalledWith(3, "✓", 130, 60);
  });
});
