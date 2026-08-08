import type {
  CommandRoomScenario,
  TacticalMapState,
} from "../scenarios/commandRoomScenario";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}

function appendText(
  parent: SVGElement,
  text: string,
  x: number,
  y: number,
  className: string,
): SVGTextElement {
  const label = svgElement("text", {
    x: String(x),
    y: String(y),
    class: className,
  });
  label.textContent = text;
  parent.append(label);
  return label;
}

function appendVehicle(
  parent: SVGElement,
  x: number,
  y: number,
  label: string,
  state: "moving" | "waiting" | "stranded",
  rotation = 0,
): void {
  const vehicle = svgElement("g", {
    class: `convoy-vehicle convoy-${state}`,
    transform: `translate(${x} ${y}) rotate(${rotation})`,
    "data-vehicle": label,
    role: "img",
    "aria-label": `${label} ${
      state === "stranded" ? "고립" : state === "moving" ? "이동 중" : "대기"
    }`,
  });
  const title = svgElement("title");
  title.textContent = `${label} 차량 실루엣`;
  vehicle.append(
    title,
    svgElement("rect", { x: "-20", y: "-9", width: "27", height: "16", rx: "2" }),
    svgElement("path", { d: "M7 -7 H17 L23 -1 V7 H7 Z" }),
    svgElement("path", { d: "M12 -5 H16 L19 -1 H12 Z", class: "vehicle-window" }),
    svgElement("circle", { cx: "-12", cy: "10", r: "4" }),
    svgElement("circle", { cx: "15", cy: "10", r: "4" }),
  );
  if (state === "stranded") {
    vehicle.append(
      svgElement("path", {
        d: "M-27 -17 L27 17 M27 -17 L-27 17",
        class: "stranded-cross",
        "data-cue": "stranded-cross",
      }),
    );
  }
  parent.append(vehicle);
}

function appendFriendlyMarker(
  parent: SVGElement,
  x: number,
  y: number,
  code: string,
  label: string,
  symbol: string,
): void {
  const marker = svgElement("g", {
    class: "friendly-marker",
    transform: `translate(${x} ${y})`,
    role: "img",
    "aria-label": label,
  });
  marker.append(
    svgElement("rect", { x: "-24", y: "-18", width: "48", height: "36", rx: "2" }),
  );
  appendText(marker, symbol, 0, 5, "marker-symbol").setAttribute("text-anchor", "middle");
  appendText(marker, code, 0, 33, "marker-code").setAttribute("text-anchor", "middle");
  parent.append(marker);
}

function appendMapDefinitions(svg: SVGSVGElement): void {
  const definitions = svgElement("defs");

  const minorGrid = svgElement("pattern", {
    id: "minor-grid",
    width: "32",
    height: "32",
    patternUnits: "userSpaceOnUse",
  });
  minorGrid.append(svgElement("path", { d: "M32 0 H0 V32", class: "minor-grid-line" }));

  const majorGrid = svgElement("pattern", {
    id: "major-grid",
    width: "160",
    height: "160",
    patternUnits: "userSpaceOnUse",
  });
  majorGrid.append(
    svgElement("rect", { width: "160", height: "160", fill: "url(#minor-grid)" }),
    svgElement("path", { d: "M160 0 H0 V160", class: "major-grid-line" }),
  );

  const hatch = svgElement("pattern", {
    id: "flood-hatch",
    width: "14",
    height: "14",
    patternUnits: "userSpaceOnUse",
    patternTransform: "rotate(35)",
  });
  hatch.append(
    svgElement("rect", { width: "14", height: "14", class: "hatch-base" }),
    svgElement("line", { x1: "0", y1: "0", x2: "0", y2: "14", class: "hatch-line" }),
  );

  const routeArrow = svgElement("marker", {
    id: "route-arrow",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "8",
    markerHeight: "8",
    orient: "auto-start-reverse",
  });
  routeArrow.append(svgElement("path", { d: "M0 0 L10 5 L0 10 Z", class: "route-arrow" }));

  definitions.append(minorGrid, majorGrid, hatch, routeArrow);
  svg.append(definitions);
}

function appendTerrain(svg: SVGSVGElement): void {
  const terrain = svgElement("g", { class: "map-terrain", "aria-hidden": "true" });
  terrain.append(
    svgElement("rect", { width: "960", height: "540", class: "terrain-base" }),
    svgElement("path", {
      d: "M0 82 C118 28 236 38 326 104 S514 188 620 112 S838 36 960 74 V0 H0 Z",
      class: "terrain-rise terrain-rise-north",
    }),
    svgElement("path", {
      d: "M0 410 C156 338 258 438 376 394 S622 334 760 398 S900 450 960 410 V540 H0 Z",
      class: "terrain-rise terrain-rise-south",
    }),
    svgElement("rect", { width: "960", height: "540", fill: "url(#major-grid)" }),
  );

  const contours = [
    "M-30 138 C112 70 240 86 340 148 S548 224 676 132 S882 52 1000 106",
    "M-24 174 C116 108 232 124 332 180 S544 258 688 166 S878 94 994 142",
    "M-18 212 C98 162 232 166 322 220 S536 302 696 202 S870 138 990 184",
    "M-30 374 C90 302 236 316 348 370 S554 420 678 356 S876 300 994 350",
    "M-28 414 C98 350 230 354 342 408 S552 462 692 394 S866 346 990 392",
    "M-16 456 C114 396 238 400 360 452 S568 504 704 438 S866 392 984 438",
  ];
  contours.forEach((path) => {
    terrain.append(svgElement("path", { d: path, class: "map-contour" }));
  });

  terrain.append(
    svgElement("path", { d: "M58 420 C146 372 218 334 302 314", class: "map-road" }),
    svgElement("path", {
      d: "M302 314 C398 258 452 198 548 210 C652 224 734 278 850 210",
      class: "map-road map-road-north",
    }),
    svgElement("path", { d: "M302 314 C430 366 590 430 828 448", class: "map-road minor-road" }),
    svgElement("path", {
      d: "M602 -30 C548 76 586 144 526 224 C470 298 532 364 470 438 C438 476 440 508 422 570",
      class: "river-bank",
    }),
    svgElement("path", {
      d: "M602 -30 C548 76 586 144 526 224 C470 298 532 364 470 438 C438 476 440 508 422 570",
      class: "river-water",
    }),
  );
  svg.append(terrain);

  const bridge = svgElement("g", {
    class: "broken-bridge",
    role: "img",
    "aria-label": "불어난 하천의 붕괴 교량",
    "data-cue": "broken-bridge",
  });
  bridge.append(
    svgElement("path", { d: "M474 278 L501 257", class: "bridge-deck" }),
    svgElement("path", { d: "M523 240 L550 219", class: "bridge-deck" }),
    svgElement("path", { d: "M503 259 l10 -18 l10 1 l-11 17", class: "bridge-break" }),
  );
  appendText(bridge, "교량 붕괴", 548, 265, "map-label map-label-fixed");
  svg.append(bridge);
}

function appendRoute(svg: SVGSVGElement): void {
  const route = svgElement("g", {
    class: "route-layer",
    "data-cue": "dashed-route",
    role: "img",
    "aria-label": "화살표와 점선으로 표시한 선정 경로",
  });
  route.append(
    svgElement("path", {
      d: "M112 410 C184 366 250 338 302 314 C398 258 452 198 548 210 C652 224 734 278 850 210",
      class: "convoy-route route-outline",
    }),
    svgElement("path", {
      d: "M112 410 C184 366 250 338 302 314 C398 258 452 198 548 210 C652 224 734 278 850 210",
      class: "convoy-route",
      "marker-end": "url(#route-arrow)",
    }),
  );
  appendText(route, "선정 경로 · 북쪽 우회로", 650, 190, "map-label route-label");
  svg.append(route);
}

function appendFloodWarning(svg: SVGSVGElement): void {
  const zone = svgElement("g", {
    class: "flood-zone",
    "data-cue": "hatched-zone",
    role: "img",
    "aria-label": "빗금과 경계선으로 표시한 침수 위험 구역",
  });
  zone.append(
    svgElement("path", {
      d: "M438 180 C492 154 574 166 622 220 C652 254 630 316 570 344 C510 372 432 330 416 278 C402 234 410 198 438 180 Z",
      fill: "url(#flood-hatch)",
      class: "flood-boundary",
    }),
  );
  appendText(zone, "침수 위험 구역", 584, 330, "map-label flood-label");
  svg.append(zone);

  const warning = svgElement("g", {
    class: "warning-source",
    "data-cue": "triangle-warning",
    role: "img",
    "aria-label": "삼각형 느낌표로 표시한 정보 장교 정찰 경고",
  });
  warning.append(
    svgElement("path", { d: "M0 -24 L22 17 H-22 Z", class: "warning-triangle" }),
  );
  appendText(warning, "!", 0, 10, "warning-symbol").setAttribute("text-anchor", "middle");
  warning.setAttribute("transform", "translate(708 112)");
  svg.append(warning);

  const warningTrace = svgElement("g", {
    class: "warning-trace",
    "data-cue": "warning-trace",
  });
  warningTrace.append(
    svgElement("path", { d: "M686 126 C648 154 596 176 546 224", class: "warning-line" }),
  );
  appendText(warningTrace, "정찰 경고 · 수위 급상승", 716, 105, "map-label warning-label");
  svg.append(warningTrace);
}

function appendConvoy(svg: SVGSVGElement, mapState: TacticalMapState): void {
  const convoy = svgElement("g", {
    class: "convoy-layer",
    "data-map-layer": "convoy",
  });
  const positions: Record<TacticalMapState, { x: number; y: number; rotation: number }> = {
    command: { x: 126, y: 407, rotation: -25 },
    route: { x: 282, y: 320, rotation: -24 },
    warning: { x: 412, y: 258, rotation: -34 },
    stranded: { x: 505, y: 254, rotation: -38 },
    failed: { x: 505, y: 254, rotation: -38 },
  };
  const position = positions[mapState];
  const isStranded = mapState === "stranded" || mapState === "failed";
  const vehicleState = mapState === "command" ? "waiting" : "moving";

  if (!isStranded) {
    appendVehicle(convoy, position.x - 50, position.y + 26, "수송 3호차", vehicleState, position.rotation);
    appendVehicle(convoy, position.x - 25, position.y + 13, "수송 2호차", vehicleState, position.rotation);
    appendVehicle(convoy, position.x, position.y, "수송 1호차", vehicleState, position.rotation);
  } else {
    appendVehicle(convoy, 424, 284, "수송 3호차", "waiting", -35);
    appendVehicle(convoy, 458, 266, "수송 1호차", "waiting", -35);
    appendVehicle(convoy, position.x, position.y, "수송 2호차", "stranded", position.rotation);
  }
  appendText(
    convoy,
    isStranded
      ? "수송 2호차 · 고립"
      : mapState === "command"
        ? "수송대 · 출발 대기"
        : "수송대 · 이동 중",
    isStranded ? 520 : Math.max(115, position.x - 20),
    isStranded ? 300 : position.y + 52,
    `map-label convoy-label${isStranded ? " convoy-label-critical" : ""}`,
  );
  svg.append(convoy);
}

function appendFailureStamp(svg: SVGSVGElement): void {
  const stamp = svgElement("g", {
    class: "failure-stamp",
    "data-cue": "failure-stamp",
    role: "img",
    "aria-label": "엑스 표식과 작전 실패 도장",
    transform: "translate(692 400) rotate(-7)",
  });
  stamp.append(
    svgElement("rect", { x: "-132", y: "-48", width: "264", height: "96", rx: "4" }),
    svgElement("path", { d: "M-110 -28 L-62 28 M-62 -28 L-110 28", class: "stamp-cross" }),
  );
  appendText(stamp, "작전 실패", 20, 13, "failure-stamp-text").setAttribute(
    "text-anchor",
    "middle",
  );
  svg.append(stamp);
}

export function renderTacticalMap(
  scenario: CommandRoomScenario,
  currentPhaseIndex: number,
): HTMLElement {
  const phase = scenario.timeline.phases[currentPhaseIndex];
  const map = scenario.tacticalMap;
  const mapPhase = map.phases[currentPhaseIndex];
  const mapState = mapPhase.state;
  const section = document.createElement("section");
  section.className = "panel tactical-map";
  section.dataset.region = "tactical-map";
  section.dataset.phaseIndex = String(currentPhaseIndex);
  section.dataset.mapState = mapState;
  section.setAttribute("aria-labelledby", "tactical-map-title");

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.id = "tactical-map-title";
  heading.textContent = map.regionLabel;

  const phaseSummary = document.createElement("p");
  phaseSummary.className = "map-phase-summary";
  phaseSummary.append(
    Object.assign(document.createElement("time"), { textContent: phase.time }),
    Object.assign(document.createElement("strong"), { textContent: phase.title }),
  );

  const frame = document.createElement("div");
  frame.className = "tactical-map-frame";
  const svg = svgElement("svg", {
    class: "operations-board",
    viewBox: "0 0 960 540",
    role: "img",
    "aria-labelledby": "tactical-map-name tactical-map-description",
    preserveAspectRatio: "xMidYMid meet",
  });
  const title = svgElement("title", { id: "tactical-map-name" });
  title.textContent = map.accessibleName;
  const description = svgElement("desc", { id: "tactical-map-description" });
  description.textContent = mapPhase.description;
  svg.append(title, description);

  appendMapDefinitions(svg);
  appendTerrain(svg);
  appendFriendlyMarker(svg, 116, 454, "HQ", "수송대 출발 지점", "◆");
  appendFriendlyMarker(svg, 714, 146, "INT", "정보 장교 정찰 지점", "△");
  appendFriendlyMarker(svg, 850, 210, "OBJ", "전방 초소 목표", "★");
  if (mapState !== "command") appendRoute(svg);
  if (mapState === "warning" || mapState === "stranded" || mapState === "failed") {
    appendFloodWarning(svg);
  }
  appendConvoy(svg, mapState);
  if (mapState === "failed") appendFailureStamp(svg);
  frame.append(svg);

  const legend = document.createElement("ul");
  legend.className = "tactical-legend";
  legend.setAttribute("aria-label", "전술 기호 설명");
  [
    ["legend-route", "점선 화살표: 선정 경로"],
    ["legend-warning", "삼각형 느낌표: 정찰 경고"],
    ["legend-failure", "빗금 구역: 침수 위험"],
  ].forEach(([className, text]) => {
    const item = document.createElement("li");
    const cue = document.createElement("span");
    cue.className = className;
    cue.setAttribute("aria-hidden", "true");
    item.append(cue, text);
    legend.append(item);
  });

  section.append(heading, phaseSummary, frame, legend);
  return section;
}
