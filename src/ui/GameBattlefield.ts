import type { CampaignDefinition, ThreatLane } from "../campaign";
import type { GameSnapshot } from "../game";
import type {
  OfficerIntent,
  OperationThreatSnapshot,
  ThreatResult,
} from "../simulation/simulationTypes";

export type ThreatImpactSnapshot = Readonly<{
  label: string;
  before: number;
  after: number;
}>;

const laneTop: Readonly<Record<ThreatLane, number>> = {
  north: 21,
  center: 48,
  south: 74,
  command: 8,
};

const laneLabels: Readonly<Record<ThreatLane, string>> = {
  north: "북쪽",
  center: "중앙",
  south: "남쪽",
  command: "지휘",
};

const intentLabels: Readonly<Record<OfficerIntent, string>> = {
  "advance-locally": "현장 전진",
  "engage-threat": "위협 대응",
  "secure-objective": "목표 확보",
  "cross-check-report": "보고 대조",
  "inspect-source": "출처 확인",
  "hold-for-evidence": "근거 대기",
  "route-report": "보고 전달",
  "broadcast-update": "상황 전파",
  "compress-feedback": "피드백 압축",
};

const resultLabels: Readonly<Record<Exclude<ThreatResult, null>, string>> = {
  blocked: "차단",
  "damaged-objective": "목표 피해",
};

const severityLabels = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "치명",
} as const;

const threatKindLabels = {
  communications: "통신",
  flood: "침수",
  artillery: "포격",
  ambush: "매복",
  misinformation: "거짓 정보",
  obstruction: "장애물",
} as const;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function threatProgress(threat: OperationThreatSnapshot, elapsedMs: number): number {
  if (threat.state === "resolved") return 100;
  const duration = Math.max(1, threat.telegraphEndsAtMs - threat.telegraphedAtMs);
  return Math.max(
    0,
    Math.min(100, ((elapsedMs - threat.telegraphedAtMs) / duration) * 100),
  );
}

export function renderGameBattlefield(
  snapshot: GameSnapshot,
  campaign: CampaignDefinition,
  threatImpacts: ReadonlyMap<string, ThreatImpactSnapshot> = new Map(),
): HTMLElement {
  const battlefield = node("section", "battlefield");
  battlefield.dataset.region = "battlefield";
  battlefield.dataset.mapId = snapshot.scene.presentation.mapId;
  battlefield.setAttribute("aria-label", "실시간 픽셀 전장");

  const image = node("img", "battlefield-image");
  image.src = `${import.meta.env.BASE_URL}assets/campaign-battlefield.png`;
  image.alt = "";
  image.draggable = false;
  battlefield.append(image);

  const operation = snapshot.operation;
  if (!operation) return battlefield;

  const roster = new Map(campaign.officers.map((officer) => [officer.id, officer]));
  const units = node("div", "battlefield-units");
  units.setAttribute("aria-label", "아군 부대");
  operation.units.forEach((unit, index) => {
    const officer = roster.get(unit.officerId);
    const marker = node("div", "unit-marker");
    marker.style.left = `${8 + unit.position * 82}%`;
    marker.style.top = `${laneTop[unit.lane]}%`;
    marker.dataset.intent = unit.intent;
    marker.setAttribute(
      "aria-label",
      `${officer?.name ?? unit.officerId}, ${laneLabels[unit.lane]} 전선, ${intentLabels[unit.intent]}, 체력 ${Math.round(unit.health)}`,
    );
    const sprite = node("span", `unit-sprite unit-sprite-${index + 1}`);
    sprite.setAttribute("aria-hidden", "true");
    const label = node("span", "unit-label");
    label.append(
      node("strong", undefined, officer?.name ?? unit.officerId),
      node("small", undefined, `${intentLabels[unit.intent]} · ${Math.round(unit.health)}%`),
    );
    marker.append(sprite, label);
    units.append(marker);
  });
  battlefield.append(units);

  const threats = node("div", "battlefield-threats");
  threats.setAttribute("aria-label", "현재 위협");
  operation.threats.forEach((threat, index) => {
    const marker = node(
      "article",
      `threat-marker threat-${threat.severity} threat-${threat.state}`,
    );
    const progress = threatProgress(threat, operation.elapsedMs);
    marker.style.left = `${54 + (index % 3) * 13}%`;
    marker.style.top = `${laneTop[threat.lane]}%`;
    marker.dataset.threatId = threat.id;
    marker.append(
      node(
        "strong",
        "threat-name",
        `${laneLabels[threat.lane]} · ${threatKindLabels[threat.kind]} · ${severityLabels[threat.severity]}`,
      ),
      node(
        "span",
        "threat-state",
        threat.result ? resultLabels[threat.result] : threat.state === "resolved" ? "해결" : "예고 중",
      ),
    );
    const impact = threatImpacts.get(threat.id);
    if (impact) {
      marker.append(
        node(
          "span",
          "threat-impact",
          `${impact.label} ${Math.round(impact.before)} → ${Math.round(impact.after)}`,
        ),
      );
    }
    const meter = node("span", "threat-meter");
    const fill = node("span", "threat-meter-fill");
    fill.style.width = `${progress}%`;
    meter.append(fill);
    marker.append(meter);
    marker.setAttribute(
      "aria-label",
      `${laneLabels[threat.lane]} 전선 ${severityLabels[threat.severity]} ${threatKindLabels[threat.kind]} 위협, ${marker.querySelector(".threat-state")?.textContent}, 예고 ${Math.round(progress)}퍼센트`,
    );
    threats.append(marker);
  });
  battlefield.append(threats);

  const legend = node("div", "battlefield-legend");
  legend.append(
    node("span", undefined, "아군 이동"),
    node("span", undefined, "위협 예고"),
    node("span", undefined, `고정 스텝 ${operation.fixedStepMs}ms`),
  );
  battlefield.append(legend);
  return battlefield;
}
