import type {
  CommandRoomScenario,
  TacticalMapState,
} from "../scenarios/commandRoomScenario";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
type ConvoyVehicleState = "moving" | "waiting" | "stranded" | "secured";

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
  state: ConvoyVehicleState,
  rotation = 0,
): void {
  const vehicle = svgElement("g", {
    class: `convoy-vehicle convoy-${state}`,
    transform: `translate(${x} ${y}) rotate(${rotation})`,
    "data-vehicle": label,
    role: "img",
    "aria-label": `${label} ${
      state === "stranded"
        ? "고립"
        : state === "moving"
          ? "이동 중"
          : state === "secured"
            ? "목표 도착"
            : "대기"
    }`,
  });
  const title = svgElement("title");
  title.textContent = `${label} 차량 실루엣`;
  vehicle.append(
    title,
    svgElement("rect", {
      x: "-24",
      y: "-12",
      width: "48",
      height: "24",
      class: "vehicle-shadow",
    }),
    svgElement("rect", { x: "-20", y: "-10", width: "28", height: "20" }),
    svgElement("path", { d: "M8 -8 H18 V-4 H24 V8 H8 Z" }),
    svgElement("rect", {
      x: "12",
      y: "-5",
      width: "8",
      height: "8",
      class: "vehicle-window",
    }),
    svgElement("rect", {
      x: "-16",
      y: "-14",
      width: "8",
      height: "4",
      class: "vehicle-wheel",
    }),
    svgElement("rect", {
      x: "12",
      y: "-14",
      width: "8",
      height: "4",
      class: "vehicle-wheel",
    }),
    svgElement("rect", {
      x: "-16",
      y: "10",
      width: "8",
      height: "4",
      class: "vehicle-wheel",
    }),
    svgElement("rect", {
      x: "12",
      y: "10",
      width: "8",
      height: "4",
      class: "vehicle-wheel",
    }),
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
  landmark: "headquarters" | "intelligence" | "objective",
): void {
  const marker = svgElement("g", {
    class: `friendly-marker landmark-${landmark}`,
    transform: `translate(${x} ${y})`,
    "data-landmark": landmark,
    role: "img",
    "aria-label": label,
  });
  marker.append(
    svgElement("rect", {
      x: "-28",
      y: "-20",
      width: "56",
      height: "40",
      class: "marker-shadow",
    }),
    svgElement("rect", { x: "-24", y: "-16", width: "48", height: "32" }),
    svgElement("path", {
      d: "M-16 -8 H-8 V-12 H8 V-8 H16 V8 H8 V12 H-8 V8 H-16 Z",
      class: "marker-core",
    }),
  );
  appendText(marker, symbol, 0, 5, "marker-symbol").setAttribute("text-anchor", "middle");
  appendText(marker, code, 0, 33, "marker-code").setAttribute("text-anchor", "middle");
  parent.append(marker);
}

function appendMapDefinitions(svg: SVGSVGElement): void {
  const definitions = svgElement("defs");

  const minorGrid = svgElement("pattern", {
    id: "minor-grid",
    width: "24",
    height: "24",
    patternUnits: "userSpaceOnUse",
  });
  minorGrid.append(svgElement("path", { d: "M24 0 H0 V24", class: "minor-grid-line" }));

  const majorGrid = svgElement("pattern", {
    id: "major-grid",
    width: "120",
    height: "120",
    patternUnits: "userSpaceOnUse",
  });
  majorGrid.append(
    svgElement("rect", { width: "120", height: "120", fill: "url(#minor-grid)" }),
    svgElement("path", { d: "M120 0 H0 V120", class: "major-grid-line" }),
  );

  const terrainDither = svgElement("pattern", {
    id: "terrain-dither",
    width: "24",
    height: "24",
    patternUnits: "userSpaceOnUse",
  });
  terrainDither.append(
    svgElement("rect", {
      x: "0",
      y: "0",
      width: "6",
      height: "6",
      class: "terrain-pixel",
    }),
    svgElement("rect", {
      x: "18",
      y: "12",
      width: "6",
      height: "6",
      class: "terrain-pixel",
    }),
  );

  const hatch = svgElement("pattern", {
    id: "flood-hatch",
    width: "12",
    height: "12",
    patternUnits: "userSpaceOnUse",
  });
  hatch.append(
    svgElement("rect", { width: "12", height: "12", class: "hatch-base" }),
    svgElement("path", { d: "M0 12 H3 V9 H6 V6 H9 V3 H12", class: "hatch-line" }),
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
  routeArrow.append(
    svgElement("path", {
      d: "M0 0 H4 V3 H10 V7 H4 V10 H0 Z",
      class: "route-arrow",
    }),
  );

  const safeRouteArrow = svgElement("marker", {
    id: "safe-route-arrow",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "8",
    markerHeight: "8",
    orient: "auto-start-reverse",
  });
  safeRouteArrow.append(
    svgElement("path", {
      d: "M0 0 H4 V3 H10 V7 H4 V10 H0 Z",
      class: "safe-route-arrow",
    }),
  );

  definitions.append(
    minorGrid,
    majorGrid,
    terrainDither,
    hatch,
    routeArrow,
    safeRouteArrow,
  );
  svg.append(definitions);
}

function appendTerrain(svg: SVGSVGElement): void {
  const terrain = svgElement("g", {
    class: "map-terrain",
    "data-map-layer": "terrain",
    "aria-hidden": "true",
  });
  terrain.append(
    svgElement("rect", { width: "960", height: "540", class: "terrain-base" }),
    svgElement("path", {
      d: "M0 0 H960 V72 H864 V48 H768 V72 H672 V96 H600 V120 H528 V144 H432 V120 H360 V96 H288 V72 H192 V48 H96 V72 H0 Z",
      class: "terrain-rise terrain-rise-north",
    }),
    svgElement("path", {
      d: "M0 396 H96 V372 H192 V396 H288 V420 H384 V396 H480 V372 H576 V360 H672 V384 H768 V408 H864 V396 H960 V540 H0 Z",
      class: "terrain-rise terrain-rise-south",
    }),
    svgElement("rect", {
      x: "0",
      y: "0",
      width: "960",
      height: "540",
      fill: "url(#terrain-dither)",
      class: "terrain-dither",
    }),
    svgElement("rect", { width: "960", height: "540", fill: "url(#major-grid)" }),
  );

  const contours = [
    "M0 132 H96 V108 H216 V120 H312 V144 H408 V168 H528 V156 H624 V120 H744 V96 H864 V108 H960",
    "M0 180 H120 V156 H240 V168 H336 V192 H432 V216 H552 V204 H648 V168 H768 V144 H864 V156 H960",
    "M0 228 H96 V204 H216 V216 H312 V240 H432 V264 H552 V252 H672 V216 H768 V192 H864 V204 H960",
    "M0 360 H96 V336 H216 V348 H312 V372 H432 V384 H552 V372 H672 V348 H768 V336 H864 V348 H960",
    "M0 408 H120 V384 H240 V396 H336 V420 H456 V432 H576 V420 H696 V396 H792 V384 H888 V396 H960",
    "M0 456 H96 V432 H216 V444 H336 V468 H456 V480 H576 V468 H696 V444 H816 V432 H912 V444 H960",
  ];
  contours.forEach((path) => {
    terrain.append(svgElement("path", { d: path, class: "map-contour" }));
  });

  terrain.append(
    svgElement("path", { d: "M48 432 L120 408 L192 360 L300 312", class: "map-road" }),
    svgElement("path", {
      d: "M300 312 L396 264 L456 216 L552 216 L648 240 L744 264 L852 216",
      class: "map-road map-road-north",
    }),
    svgElement("path", { d: "M300 312 L420 360 L588 432 L828 456", class: "map-road minor-road" }),
    svgElement("path", {
      d: "M576 0 H624 V72 H600 V144 H576 V216 H540 V288 H516 V360 H492 V432 H468 V540 H396 V468 H420 V408 H444 V336 H468 V264 H492 V192 H516 V120 H540 V48 H576 Z",
      class: "river-bank",
    }),
    svgElement("path", {
      d: "M588 0 H612 V72 H588 V144 H564 V216 H528 V288 H504 V360 H480 V432 H456 V540 H408 V468 H432 V408 H456 V336 H480 V264 H504 V192 H528 V120 H552 V48 H588 Z",
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
    svgElement("path", { d: "M468 288 L504 252 L516 264 L480 300 Z", class: "bridge-deck" }),
    svgElement("path", { d: "M528 240 L564 204 L576 216 L540 252 Z", class: "bridge-deck" }),
    svgElement("path", { d: "M504 252 L516 240 L528 252 L516 264 Z", class: "bridge-break" }),
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
      d: "M120 408 L192 360 L300 312 L396 264 L456 216 L552 216 L648 240 L744 264 L852 216",
      class: "convoy-route route-outline",
    }),
    svgElement("path", {
      d: "M120 408 L192 360 L300 312 L396 264 L456 216 L552 216 L648 240 L744 264 L852 216",
      class: "convoy-route",
      "marker-end": "url(#route-arrow)",
    }),
  );
  appendText(route, "선정 경로 · 북쪽 우회로", 650, 190, "map-label route-label");
  svg.append(route);
}

function appendSafeRoute(svg: SVGSVGElement): void {
  const path =
    "M120 408 L192 360 L300 312 L420 360 L588 432 L828 456 L888 408 L912 312 L852 216";
  const route = svgElement("g", {
    class: "safe-route-layer",
    "data-cue": "solid-safe-route",
    role: "img",
    "aria-label": "화살표와 실선, 마름모 경유점으로 표시한 안전 경로",
  });
  route.append(
    svgElement("path", {
      d: path,
      class: "safe-convoy-route safe-route-outline",
    }),
    svgElement("path", {
      d: path,
      class: "safe-convoy-route",
      "marker-end": "url(#safe-route-arrow)",
    }),
  );

  const waypoints = svgElement("g", {
    class: "safe-route-waypoints",
    "data-cue": "diamond-waypoints",
    "aria-hidden": "true",
  });
  [
    [302, 314],
    [590, 430],
    [828, 448],
  ].forEach(([x, y]) => {
    waypoints.append(
      svgElement("rect", {
        x: String(x - 7),
        y: String(y - 7),
        width: "14",
        height: "14",
        transform: `rotate(45 ${x} ${y})`,
      }),
    );
  });
  route.append(waypoints);
  appendText(route, "안전 경로 · 남쪽 임시 도로", 532, 472, "map-label safe-route-label");
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
      d: "M444 180 H540 V192 H588 V216 H624 V252 H636 V300 H612 V324 H564 V348 H492 V336 H444 V312 H420 V276 H408 V228 H420 V204 H444 Z",
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
    svgElement("path", { d: "M684 132 L648 156 H612 L576 192 L540 228", class: "warning-line" }),
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
    rerouted: { x: 554, y: 407, rotation: 13 },
    secured: { x: 837, y: 247, rotation: -58 },
  };
  const position = positions[mapState];
  const isStranded = mapState === "stranded" || mapState === "failed";
  const vehicleState: ConvoyVehicleState =
    mapState === "command" ? "waiting" : mapState === "secured" ? "secured" : "moving";

  if (!isStranded) {
    appendVehicle(
      convoy,
      position.x - 50,
      position.y + 26,
      "수송 3호차",
      vehicleState,
      position.rotation,
    );
    appendVehicle(
      convoy,
      position.x - 25,
      position.y + 13,
      "수송 2호차",
      vehicleState,
      position.rotation,
    );
    appendVehicle(
      convoy,
      position.x,
      position.y,
      "수송 1호차",
      vehicleState,
      position.rotation,
    );
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
        : mapState === "secured"
          ? "수송대 · 목표 도착"
          : "수송대 · 이동 중",
    isStranded ? 520 : Math.max(115, position.x - 20),
    isStranded ? 300 : position.y + 52,
    `map-label convoy-label${isStranded ? " convoy-label-critical" : ""}`,
  );
  svg.append(convoy);
}

function appendSuccessCue(svg: SVGSVGElement): void {
  const cue = svgElement("g", {
    class: "success-badge",
    "data-cue": "success-badge",
    role: "img",
    "aria-label": "원형 방패와 확인 표식으로 표시한 목표 확보",
    transform: "translate(694 352)",
  });
  cue.append(
    svgElement("path", {
      d: "M-36 -36 H36 V-24 H48 V24 H36 V36 H12 V48 H-12 V36 H-36 V24 H-48 V-24 H-36 Z",
      class: "success-shield",
    }),
    svgElement("path", {
      d: "M-24 0 L-12 12 H0 V0 H12 V-12 H24",
      class: "success-check",
    }),
  );
  appendText(cue, "목표 확보", 0, 75, "map-label success-label").setAttribute(
    "text-anchor",
    "middle",
  );
  svg.append(cue);
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
    svgElement("rect", { x: "-132", y: "-48", width: "264", height: "96" }),
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
    "data-visual-language": "pixel-battlefield",
    "data-grid-step": "12",
    "shape-rendering": "crispEdges",
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
  appendFriendlyMarker(
    svg,
    120,
    456,
    "HQ",
    "수송대 출발 지점",
    "◆",
    "headquarters",
  );
  appendFriendlyMarker(
    svg,
    708,
    144,
    "INT",
    "정보 장교 정찰 지점",
    "△",
    "intelligence",
  );
  appendFriendlyMarker(
    svg,
    852,
    216,
    "OBJ",
    "전방 초소 목표",
    "★",
    "objective",
  );
  if (
    mapState === "route" ||
    mapState === "warning" ||
    mapState === "stranded" ||
    mapState === "failed"
  ) {
    appendRoute(svg);
  }
  if (mapState === "rerouted" || mapState === "secured") appendSafeRoute(svg);
  if (
    mapState === "warning" ||
    mapState === "stranded" ||
    mapState === "failed" ||
    mapState === "rerouted" ||
    mapState === "secured"
  ) {
    appendFloodWarning(svg);
  }
  appendConvoy(svg, mapState);
  if (mapState === "failed") appendFailureStamp(svg);
  if (mapState === "secured") appendSuccessCue(svg);
  frame.append(svg);

  const legend = document.createElement("ul");
  legend.className = "tactical-legend";
  legend.setAttribute("aria-label", "전술 기호 설명");
  const legendEntries = [
    ["legend-route", "점선 화살표: 선정 경로"],
    ["legend-warning", "삼각형 느낌표: 정찰 경고"],
    ["legend-failure", "빗금 구역: 침수 위험"],
  ];
  if (mapState === "rerouted" || mapState === "secured") {
    legendEntries.push(["legend-safe-route", "실선과 마름모: 안전 경로"]);
  }
  if (mapState === "secured") {
    legendEntries.push(["legend-success", "원형 확인 표식: 목표 확보"]);
  }
  legendEntries.forEach(([className, text]) => {
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
