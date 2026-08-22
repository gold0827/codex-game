import type { AutonomousOperationViewModel } from "../../operation/autonomousOperationProjector";
import { planBattlefieldChoreography } from "../battlefieldChoreography";

type OperationFormation = AutonomousOperationViewModel["formations"][number];
type OperationActor = OperationFormation["actors"][number];

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function textElement(className: string, text: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function behaviorLabel(behavior: string | null): string {
  if (behavior === null) return "명령 대기";
  if (behavior.startsWith("intent:")) return "지휘 의도 수행";
  if (behavior.startsWith("guidance:")) return "현장 지침 수행";
  return {
    "seek-information": "수색·관측",
    verify: "보고 검증",
    "feedback-repeat": "행동 지속",
    "feedback-revise": "전술 수정",
    "act-independently": "독립 행동",
  }[behavior] ?? "현장 행동";
}

function appendMapDefinitions(map: SVGSVGElement): void {
  const definitions = svg("defs");
  const paper = svg("linearGradient", { id: "prototype-c-paper", x1: "0", y1: "0", x2: "1", y2: "1" });
  paper.append(
    Object.assign(svg("stop", { offset: "0", "stop-color": "#b3a77d" })),
    Object.assign(svg("stop", { offset: ".5", "stop-color": "#8f9168" })),
    Object.assign(svg("stop", { offset: "1", "stop-color": "#686f50" })),
  );
  const water = svg("linearGradient", { id: "prototype-c-water", x1: "0", y1: "0", x2: "1", y2: "0" });
  water.append(
    svg("stop", { offset: "0", "stop-color": "#536e73" }),
    svg("stop", { offset: ".55", "stop-color": "#77959a" }),
    svg("stop", { offset: "1", "stop-color": "#3f6065" }),
  );
  const roughness = svg("filter", { id: "prototype-c-roughness", x: "-10%", y: "-10%", width: "120%", height: "120%" });
  roughness.append(
    svg("feTurbulence", { type: "fractalNoise", baseFrequency: ".018 .06", numOctaves: "2", seed: "19", result: "noise" }),
    svg("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: "5", xChannelSelector: "R", yChannelSelector: "G" }),
  );
  definitions.append(paper, water, roughness);
  map.append(definitions);
}

function appendTerrain(map: SVGSVGElement): void {
  map.append(svg("rect", { width: "1000", height: "620", fill: "url(#prototype-c-paper)" }));

  const highlands = svg("g", { class: "battlefield-prototype-c__highlands", filter: "url(#prototype-c-roughness)" });
  [
    "M-20 86 C120 14 244 28 347 119 C279 171 152 182 -20 145 Z",
    "M652 -20 C800 25 932 20 1036 121 L1034 252 C887 219 786 152 652 -20 Z",
    "M-34 449 C134 365 258 396 333 524 L280 651 L-28 653 Z",
    "M702 411 C818 369 946 389 1036 468 L1033 650 L770 650 Z",
  ].forEach((path, index) => highlands.append(svg("path", {
    d: path,
    class: `battlefield-prototype-c__mountain-wash battlefield-prototype-c__mountain-wash--${index + 1}`,
  })));
  map.append(highlands);

  const contourGroup = svg("g", { class: "battlefield-prototype-c__contours", "aria-hidden": "true" });
  [
    "M-30 113 C101 31 236 49 361 145 C285 206 151 213 -21 174",
    "M-29 143 C102 75 228 84 325 154 C246 191 131 208 -12 196",
    "M677 -17 C755 73 872 119 1030 134",
    "M720 -10 C806 87 900 126 1035 167",
    "M-12 475 C118 407 228 423 312 535",
    "M18 515 C136 463 217 475 271 577",
    "M712 449 C831 400 949 432 1032 509",
    "M747 484 C846 445 941 470 1034 548",
    "M353 101 C438 65 526 80 581 145",
    "M402 117 C466 97 520 115 559 158",
  ].forEach((path) => contourGroup.append(svg("path", { d: path })));
  map.append(contourGroup);

  map.append(
    svg("path", {
      class: "battlefield-prototype-c__river-shadow",
      d: "M-35 334 C114 292 198 351 317 335 C430 318 520 262 627 285 C748 311 858 372 1038 335",
    }),
    svg("path", {
      class: "battlefield-prototype-c__river",
      d: "M-35 326 C114 283 197 341 316 326 C431 311 520 252 630 275 C751 301 858 363 1038 325",
    }),
    svg("path", {
      class: "battlefield-prototype-c__river-highlight",
      d: "M-34 319 C118 285 201 337 318 317 C435 297 521 248 631 270 C755 296 866 354 1039 315",
    }),
  );

  const roads = svg("g", { class: "battlefield-prototype-c__roads" });
  roads.append(
    svg("path", { d: "M490 -24 C474 90 508 179 479 281 C456 363 470 472 430 645" }),
    svg("path", { d: "M101 79 C261 156 375 206 481 286 C603 381 739 420 957 561" }),
    svg("path", { d: "M840 45 C739 139 688 214 627 276 C559 347 554 457 594 642" }),
  );
  map.append(roads);

  const landmarks = svg("g", { class: "battlefield-prototype-c__landmarks" });
  const addLandmark = (x: string, y: string, label: string): void => {
    const group = svg("g", { transform: `translate(${x} ${y})` });
    group.append(svg("circle", { r: "4" }), svg("text", { x: "9", y: "4" }));
    group.lastElementChild!.textContent = label;
    landmarks.append(group);
  };
  addLandmark("492", "207", "춘천 북방");
  addLandmark("451", "367", "춘천");
  addLandmark("516", "496", "원창고개");
  map.append(landmarks);

  const riverLabel = svg("text", { class: "battlefield-prototype-c__river-label", x: "675", y: "333", transform: "rotate(8 675 333)" });
  riverLabel.textContent = "소 양 강";
  map.append(riverLabel);
}

function flowingLine(points: readonly Readonly<{ x: number; y: number }>[]): string | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((left, right) => left.x - right.x);
  const [first, ...rest] = sorted;
  if (!first) return null;
  return rest.reduce(
    (path, point, index) => {
      const previous = sorted[index]!;
      const middleX = (previous.x + point.x) / 2;
      return `${path} C${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`;
    },
    `M${first.x} ${first.y}`,
  );
}

function appendFrontLines(
  map: SVGSVGElement,
  operation: AutonomousOperationViewModel,
  anchorByFormation: ReadonlyMap<string, Readonly<{ x: number; y: number }>>,
): void {
  const sideOrder = [...new Set(operation.formations.map(({ sideId }) => sideId))];
  const fronts = svg("g", { class: "battlefield-prototype-c__fronts" });
  sideOrder.forEach((sideId, sideIndex) => {
    const points = operation.formations
      .filter((formation) => formation.sideId === sideId && formation.active)
      .map(({ id }) => anchorByFormation.get(id))
      .filter((anchor): anchor is Readonly<{ x: number; y: number }> => anchor !== undefined)
      .map(({ x, y }) => ({ x: x * 10, y: y * 6.2 }));
    const path = flowingLine(points);
    if (path !== null) fronts.append(svg("path", {
      d: path,
      class: "battlefield-prototype-c__front-line",
      "data-side": sideIndex === 0 ? "friendly" : "hostile",
    }));
  });
  map.append(fronts);
}

function actorButton(actor: OperationActor, onInspectActor: (id: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "battlefield-prototype-c__actor";
  button.dataset.actorId = actor.id;
  button.dataset.condition = actor.condition;
  button.dataset.behavior = actor.behavior ?? "waiting";
  button.setAttribute("aria-pressed", String(actor.selected));
  button.setAttribute("aria-label", `${actor.label} · ${actor.conditionLabel} · ${behaviorLabel(actor.behavior)}`);
  button.title = `${actor.label} — ${behaviorLabel(actor.behavior)}`;
  button.append(
    textElement("battlefield-prototype-c__actor-head", ""),
    textElement("battlefield-prototype-c__actor-body", ""),
  );
  button.addEventListener("click", () => onInspectActor(actor.id));
  return button;
}

function formationStandard(
  formation: OperationFormation,
  side: "friendly" | "hostile",
  locationIndex: number,
  onInspectActor: (id: string) => void,
): HTMLElement {
  const standard = document.createElement("section");
  standard.className = "battlefield-prototype-c__formation";
  standard.dataset.formationId = formation.id;
  standard.dataset.side = side;
  standard.dataset.active = String(formation.active);
  standard.style.setProperty("--formation-stagger-x", `${(locationIndex % 3 - 1) * 7}px`);
  standard.style.setProperty("--formation-stagger-y", `${Math.floor(locationIndex / 3) * 35}px`);
  standard.setAttribute("aria-label", `${formation.label} · ${formation.status} · 행동 주체 ${formation.actorCount}명`);

  const mast = document.createElement("span");
  mast.className = "battlefield-prototype-c__standard-mast";
  mast.setAttribute("aria-hidden", "true");
  const ribbon = document.createElement("header");
  ribbon.className = "battlefield-prototype-c__ribbon";
  ribbon.append(
    textElement("battlefield-prototype-c__formation-name", formation.label),
    textElement("battlefield-prototype-c__formation-state", formation.active ? "전선 투입" : "증원 대기"),
  );
  const actors = document.createElement("div");
  actors.className = "battlefield-prototype-c__actor-rank";
  actors.setAttribute("aria-label", `${formation.label} 행동 주체 선택`);
  formation.actors.forEach((actor) => actors.append(actorButton(actor, onInspectActor)));
  standard.append(mast, ribbon, actors);
  return standard;
}

function appendHud(root: HTMLElement, operation: AutonomousOperationViewModel): void {
  const hud = document.createElement("header");
  hud.className = "battlefield-prototype-c__hud";
  const title = document.createElement("div");
  title.className = "battlefield-prototype-c__operation-title";
  title.append(
    textElement("battlefield-prototype-c__eyebrow", "1950. 6. 춘천지구 전황도"),
    textElement("battlefield-prototype-c__title", "소양강 지연전"),
  );
  const clock = document.createElement("div");
  clock.className = "battlefield-prototype-c__clock";
  clock.append(
    textElement("battlefield-prototype-c__clock-label", operation.resolution.label),
    textElement("battlefield-prototype-c__clock-value", operation.clock.label),
  );
  const progress = document.createElement("div");
  progress.className = "battlefield-prototype-c__progress";
  const progressLabel = textElement("battlefield-prototype-c__progress-label", "작전 경과");
  const track = document.createElement("span");
  track.className = "battlefield-prototype-c__progress-track";
  const fill = document.createElement("span");
  fill.className = "battlefield-prototype-c__progress-fill";
  fill.style.width = `${Math.max(0, Math.min(100, operation.clock.progress * 100))}%`;
  track.append(fill);
  progress.append(progressLabel, track);
  hud.append(title, progress, clock);
  root.append(hud);
}

function appendLegend(root: HTMLElement, operation: AutonomousOperationViewModel): void {
  const footer = document.createElement("footer");
  footer.className = "battlefield-prototype-c__legend";
  footer.append(
    textElement("battlefield-prototype-c__legend-side battlefield-prototype-c__legend-side--friendly", "아군 방어선"),
    textElement("battlefield-prototype-c__legend-side battlefield-prototype-c__legend-side--hostile", "적군 진출선"),
    textElement(
      "battlefield-prototype-c__legend-note",
      `${operation.formations.filter(({ active }) => active).length}개 편성 교전 중 · 병사 표식을 선택해 판단 과정 확인`,
    ),
  );
  root.append(footer);
}

export function renderBattlefieldPrototypeVariantC(
  operation: AutonomousOperationViewModel,
  onInspectActor: (id: string) => void,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "battlefield-prototype battlefield-prototype-c";
  root.dataset.prototype = "variant-c";
  root.dataset.formationCount = String(operation.formations.length);
  root.dataset.actorCount = String(operation.formations.reduce((sum, formation) => sum + formation.actorCount, 0));
  root.setAttribute("aria-label", `춘천지구 전황도 · 편성 ${operation.formations.length}개`);

  const map = svg("svg", {
    class: "battlefield-prototype-c__map",
    viewBox: "0 0 1000 620",
    preserveAspectRatio: "xMidYMid slice",
    role: "img",
    "aria-label": "춘천과 소양강 일대의 작전참모 전황도",
  });
  appendMapDefinitions(map);
  appendTerrain(map);

  const choreography = planBattlefieldChoreography(operation, false);
  const anchors = new Map(choreography.formations.map(({ formationId, anchor }) => [formationId, anchor] as const));
  appendFrontLines(map, operation, anchors);
  root.append(map);
  appendHud(root, operation);

  const formations = document.createElement("div");
  formations.className = "battlefield-prototype-c__formations";
  const locationCounts = new Map<string, number>();
  const firstSideId = operation.formations.find(({ controllable }) => controllable)?.sideId
    ?? operation.formations[0]?.sideId;
  operation.formations.forEach((formation) => {
    const anchor = anchors.get(formation.id);
    if (!anchor) return;
    const locationIndex = locationCounts.get(formation.location) ?? 0;
    locationCounts.set(formation.location, locationIndex + 1);
    const standard = formationStandard(
      formation,
      formation.sideId === firstSideId ? "friendly" : "hostile",
      locationIndex,
      onInspectActor,
    );
    standard.style.left = `${anchor.x}%`;
    standard.style.top = `${anchor.y}%`;
    formations.append(standard);
  });
  root.append(formations);
  appendLegend(root, operation);
  return root;
}
