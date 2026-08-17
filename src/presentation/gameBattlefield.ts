import { node } from "./dom";
import type { GameViewModel, ThreatImpactViewModel } from "./gameViewModel";

type BattlefieldViewModel = NonNullable<GameViewModel["operation"]>["battlefield"];

const laneTop = { north: 21, center: 48, south: 74, command: 8 } as const;

export function renderGameBattlefield(
  battlefieldView: BattlefieldViewModel,
  threatImpacts: ReadonlyMap<string, ThreatImpactViewModel>,
): HTMLElement {
  const battlefield = node("section", "battlefield");
  battlefield.dataset.region = "battlefield";
  battlefield.dataset.mapId = battlefieldView.mapId;
  battlefield.setAttribute("aria-label", "실시간 픽셀 전장");
  const image = node("img", "battlefield-image");
  image.src = `${import.meta.env.BASE_URL}assets/campaign-battlefield.png`;
  image.alt = "";
  image.draggable = false;
  battlefield.append(image);

  const units = node("div", "battlefield-units");
  units.setAttribute("aria-label", "아군 부대");
  battlefieldView.units.forEach((unit) => {
    const marker = node("div", "unit-marker");
    marker.style.left = `${unit.left}%`;
    marker.style.top = `${laneTop[unit.lane]}%`;
    marker.dataset.intent = unit.intent;
    marker.setAttribute("aria-label", `${unit.officerName}, ${unit.laneLabel} 전선, ${unit.intentLabel}, 체력 ${unit.health}`);
    const sprite = node("span", `unit-sprite unit-sprite-${unit.sprite}`);
    sprite.setAttribute("aria-hidden", "true");
    const label = node("span", "unit-label");
    label.append(node("strong", undefined, unit.officerName), node("small", undefined, `${unit.intentLabel} · ${unit.health}%`));
    marker.append(sprite, label);
    units.append(marker);
  });
  battlefield.append(units);

  const threats = node("div", "battlefield-threats");
  threats.setAttribute("aria-label", "현재 위협");
  battlefieldView.threats.forEach((threat) => {
    const marker = node("article", `threat-marker threat-${threat.severity} threat-${threat.state}`);
    marker.style.left = `${54 + (threat.index % 3) * 13}%`;
    marker.style.top = `${laneTop[threat.lane]}%`;
    marker.dataset.threatId = threat.id;
    marker.append(
      node("strong", "threat-name", `${threat.laneLabel} · ${threat.kindLabel} · ${threat.severityLabel}`),
      node("span", "threat-state", threat.stateLabel),
    );
    const impact = threatImpacts.get(threat.id);
    if (impact) marker.append(node("span", "threat-impact", `${impact.label} ${Math.round(impact.before)} → ${Math.round(impact.after)}`));
    const meter = node("span", "threat-meter");
    const fill = node("span", "threat-meter-fill");
    fill.style.width = `${threat.progress}%`;
    meter.append(fill);
    marker.append(meter);
    marker.setAttribute("aria-label", `${threat.laneLabel} 전선 ${threat.severityLabel} ${threat.kindLabel} 위협, ${threat.stateLabel}, 예고 ${Math.round(threat.progress)}퍼센트`);
    threats.append(marker);
  });
  battlefield.append(threats);
  const legend = node("div", "battlefield-legend");
  legend.append(node("span", undefined, "아군 이동"), node("span", undefined, "위협 예고"), node("span", undefined, battlefieldView.fixedStepLabel));
  battlefield.append(legend);
  return battlefield;
}
