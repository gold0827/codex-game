import type {
  BattlefieldThreatFrame,
  WorldPosition,
} from "../battlefieldFrame";

type ThreatMarkerFrame = Omit<BattlefieldThreatFrame, "position">;

export type ThreatMarkerAppearance = Readonly<{
  shape: "diamond" | "signal";
  fill: string;
  stroke: string;
  opacity: number;
}>;

const severityFill = {
  low: "#d8b36b",
  medium: "#ef9145",
  high: "#e55f55",
  critical: "#d9385f",
} as const satisfies Record<BattlefieldThreatFrame["severity"], string>;

export function threatMarkerAppearance(
  threat: ThreatMarkerFrame,
): ThreatMarkerAppearance {
  const resolvedFill = threat.result === "blocked" ? "#5f756c" : "#a9434e";
  return {
    shape: threat.category === "physical" ? "diamond" : "signal",
    fill: threat.state === "resolved" ? resolvedFill : severityFill[threat.severity],
    stroke: threat.category === "physical" ? "#2a0f16" : "#f2df9b",
    opacity: threat.state === "resolved" ? 0.82 : 1,
  };
}

export function drawBattlefieldThreatMarker(
  context: CanvasRenderingContext2D,
  threat: ThreatMarkerFrame,
  foot: WorldPosition,
  scale: number,
): void {
  const appearance = threatMarkerAppearance(threat);
  const radius = Math.max(8, Math.round(10 * scale));
  const center = { x: Math.round(foot.x), y: Math.round(foot.y - 10 * scale) };

  context.save();
  context.globalAlpha = appearance.opacity;
  context.fillStyle = appearance.fill;
  context.strokeStyle = appearance.stroke;
  context.lineWidth = Math.max(2, Math.round(2 * scale));
  context.setLineDash(appearance.shape === "signal" ? [4 * scale, 3 * scale] : []);
  context.beginPath();
  if (appearance.shape === "diamond") {
    context.moveTo(center.x, center.y - radius);
    context.lineTo(center.x + radius, center.y);
    context.lineTo(center.x, center.y + radius);
    context.lineTo(center.x - radius, center.y);
    context.closePath();
  } else {
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#fff8df";
  context.font = `700 ${Math.max(10, Math.round(12 * scale))}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(threat.glyph, center.x, center.y - 2 * scale);
  context.font = `700 ${Math.max(7, Math.round(8 * scale))}px ui-monospace, monospace`;
  context.fillText(threat.severityGlyph, center.x, center.y + 7 * scale);

  const badgeRadius = Math.max(5, Math.round(6 * scale));
  const badge = { x: center.x + radius, y: center.y - radius };
  context.fillStyle = "#101815";
  context.beginPath();
  context.arc(badge.x, badge.y, badgeRadius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff8df";
  context.stroke();
  context.fillStyle = "#fff8df";
  context.font = `700 ${Math.max(7, Math.round(9 * scale))}px ui-monospace, monospace`;
  context.fillText(threat.statusGlyph, badge.x, badge.y);
  context.restore();
}
