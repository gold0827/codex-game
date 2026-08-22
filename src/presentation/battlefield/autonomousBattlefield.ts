import type { AutonomousOperationViewModel } from "../operation/autonomousOperationProjector";
import {
  planBattlefieldChoreography,
  type BattlefieldChoreographyPlan,
} from "./battlefieldChoreography";

export type MountedAutonomousBattlefield = Readonly<{
  element: HTMLElement;
  update: (
    operation: AutonomousOperationViewModel | null,
    reducedMotion: boolean,
  ) => void;
  destroy: () => void;
}>;

export type AutonomousBattlefieldOptions = Readonly<{
  onInspectActor: (actorId: string) => void;
}>;

type BattlefieldFormationPlan = BattlefieldChoreographyPlan["formations"][number];
type BattlefieldActorPlan = BattlefieldFormationPlan["actors"][number];

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const TILE_WIDTH = 56;
const TILE_HEIGHT = 36;
const MAP_COLUMNS = 16;
const MAP_ROWS = 12;

function behaviorLabel(behaviorId: string | null): string | null {
  if (behaviorId === null) return null;
  if (behaviorId.startsWith("intent:")) return "지휘 의도 수행";
  if (behaviorId.startsWith("guidance:")) return "전달 지침 수행";
  return {
    "seek-information": "정보 탐색",
    verify: "보고 검증",
    "feedback-repeat": "이전 행동 유지",
    "feedback-revise": "행동 수정",
    "act-independently": "현장 자율 판단",
  }[behaviorId] ?? "현장 행동";
}

function visualState(
  operation: AutonomousOperationViewModel | null,
): "empty" | "running" | "success" | "failure" {
  if (operation === null) return "empty";
  return operation.resolution.state;
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  fill: string,
  stroke: string,
): void {
  context.beginPath();
  context.moveTo(centerX, centerY - TILE_HEIGHT / 2);
  context.lineTo(centerX + TILE_WIDTH / 2, centerY);
  context.lineTo(centerX, centerY + TILE_HEIGHT / 2);
  context.lineTo(centerX - TILE_WIDTH / 2, centerY);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  context.stroke();
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  operation: AutonomousOperationViewModel | null,
): void {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const background = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  background.addColorStop(0, "#172b28");
  background.addColorStop(0.58, "#13231c");
  background.addColorStop(1, "#07110e");
  context.fillStyle = background;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const originX = CANVAS_WIDTH / 2 - 55;
  const originY = 52;
  for (let row = 0; row < MAP_ROWS; row += 1) {
    for (let column = 0; column < MAP_COLUMNS; column += 1) {
      const centerX = originX + (column - row) * (TILE_WIDTH / 2);
      const centerY = originY + (column + row) * (TILE_HEIGHT / 2);
      const river = column + row >= 12 && column + row <= 14;
      const road = Math.abs(column - row - 1) <= 1;
      const variation = (column * 17 + row * 31) % 4;
      const fill = river
        ? variation % 2 === 0 ? "#244a50" : "#28545a"
        : road
          ? variation % 2 === 0 ? "#5b5945" : "#4e503f"
          : ["#294638", "#304b39", "#244033", "#354d37"][variation]!;
      drawDiamond(context, centerX, centerY, fill, "rgba(137, 166, 129, 0.18)");
    }
  }

  context.fillStyle = "rgba(232, 216, 148, 0.78)";
  context.font = "700 15px system-ui, sans-serif";
  context.fillText("춘천 북방", 424, 36);
  context.fillStyle = "rgba(160, 205, 213, 0.72)";
  context.fillText("소양강", 474, 311);
  context.fillStyle = "rgba(215, 225, 207, 0.64)";
  context.font = "12px system-ui, sans-serif";
  context.fillText(
    operation === null ? "전투 국면 대기" : operation.clock.label,
    18,
    CANVAS_HEIGHT - 18,
  );
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof globalThis.CanvasRenderingContext2D === "undefined") return null;
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function actorPip(
  actor: AutonomousOperationViewModel["formations"][number]["actors"][number],
  plan: BattlefieldActorPlan,
  inspect: (actorId: string) => void,
): HTMLButtonElement {
  const behavior = behaviorLabel(actor.behavior);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "battlefield-actor-pip";
  button.dataset.actorId = actor.id;
  button.dataset.focusKey = `battlefield-inspect-${actor.id}`;
  button.dataset.condition = actor.condition;
  button.dataset.selected = String(actor.selected);
  button.dataset.behavior = actor.behavior ?? "waiting";
  button.dataset.visualAction = plan.visualAction;
  button.dataset.moving = String(plan.moving);
  button.style.transform = plan.transform;
  button.setAttribute("aria-pressed", String(actor.selected));
  button.setAttribute(
    "aria-label",
    `${actor.label} · ${actor.conditionLabel}${behavior ? ` · ${behavior}` : ""}`,
  );
  button.title = actor.label;
  button.textContent = actor.condition === "lost"
    ? "×"
    : actor.condition === "withdrawn"
      ? "↙"
      : actor.condition === "suppressed"
        ? "!"
        : "●";
  button.addEventListener("click", () => inspect(actor.id));
  return button;
}

function formationMarker(
  formation: AutonomousOperationViewModel["formations"][number],
  plan: BattlefieldFormationPlan,
  inspect: (actorId: string) => void,
): HTMLElement {
  const { anchor } = plan;
  const marker = document.createElement("article");
  marker.className = "battlefield-formation-marker";
  marker.dataset.formationId = formation.id;
  marker.dataset.controllable = String(formation.controllable);
  marker.dataset.active = String(formation.active);
  marker.dataset.locationId = formation.location;
  marker.dataset.locationKnown = String(anchor.known);
  marker.style.transform = `translate3d(${plan.offset.x}px, ${plan.offset.y}px, 0)`;
  marker.setAttribute(
    "aria-label",
    `${formation.label} · ${anchor.label} · ${formation.status} · 행동 주체 ${formation.actorCount}명`,
  );

  const heading = document.createElement("strong");
  heading.className = "battlefield-formation-label";
  heading.textContent = formation.label;
  const location = document.createElement("span");
  location.className = "battlefield-location-label";
  location.textContent = anchor.label;
  const actors = document.createElement("div");
  actors.className = "battlefield-actor-pips";
  actors.style.height = `${plan.footprintHeight}px`;
  actors.setAttribute("aria-label", `${formation.label} 행동 주체`);
  const actorPlans = new Map(plan.actors.map((actor) => [actor.actorId, actor]));
  formation.actors.forEach((actor) => {
    const actorPlan = actorPlans.get(actor.id);
    if (actorPlan) actors.append(actorPip(actor, actorPlan, inspect));
  });
  marker.append(heading, location, actors);
  return marker;
}

function locationCluster(
  locationId: string,
  formations: readonly AutonomousOperationViewModel["formations"][number][],
  formationPlans: ReadonlyMap<string, BattlefieldFormationPlan>,
  inspect: (actorId: string) => void,
): HTMLElement {
  const anchor = formationPlans.get(formations[0]?.id ?? "")?.anchor;
  if (!anchor) throw new Error(`Missing battlefield choreography for location "${locationId}".`);
  const cluster = document.createElement("section");
  cluster.className = "battlefield-location-cluster";
  cluster.dataset.locationId = locationId;
  cluster.dataset.locationKnown = String(anchor.known);
  cluster.dataset.formationCount = String(formations.length);
  cluster.dataset.density = formations.some(({ actors }) => actors.length > 12)
    ? "dense"
    : "normal";
  cluster.style.left = `${Math.max(12, Math.min(88, anchor.x))}%`;
  cluster.style.top = `${Math.max(16, Math.min(84, anchor.y))}%`;
  cluster.setAttribute("aria-label", `${anchor.label} 전투 집단 ${formations.length}개`);
  formations.forEach((formation) => {
    const plan = formationPlans.get(formation.id);
    if (plan) cluster.append(formationMarker(formation, plan, inspect));
  });
  return cluster;
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function renderActionEffects(
  layer: SVGSVGElement,
  plan: BattlefieldChoreographyPlan,
): void {
  const formations = new Map(plan.formations.map((formation) => [
    formation.formationId,
    formation,
  ]));
  const effects: SVGElement[] = [];
  for (const exchange of plan.exchanges) {
    const from = formations.get(exchange.fromFormationId);
    const to = formations.get(exchange.toFormationId);
    if (!from || !to) continue;
    const line = svgNode("line");
    line.classList.add("battlefield-action-effect", "battlefield-contact-line");
    line.dataset.effectId = exchange.id;
    line.dataset.effectKind = exchange.kind;
    line.setAttribute("x1", String(from.anchor.x));
    line.setAttribute("y1", String(from.anchor.y));
    line.setAttribute("x2", String(to.anchor.x));
    line.setAttribute("y2", String(to.anchor.y));
    effects.push(line);
    if (exchange.kind === "pressure-flow") {
      for (const [index, progress] of [exchange.progress, 1 - exchange.progress].entries()) {
        const pulse = svgNode("circle");
        pulse.classList.add("battlefield-action-effect", "battlefield-pressure-pulse");
        pulse.dataset.effectId = `${exchange.id}:pulse-${index}`;
        pulse.dataset.effectKind = exchange.kind;
        pulse.setAttribute("cx", String(from.anchor.x + (to.anchor.x - from.anchor.x) * progress));
        pulse.setAttribute("cy", String(from.anchor.y + (to.anchor.y - from.anchor.y) * progress));
        pulse.setAttribute("r", "2.1");
        effects.push(pulse);
      }
    }
  }
  layer.replaceChildren(...effects);
  layer.dataset.effectCount = String(effects.length);
}

export function mountAutonomousBattlefield(
  options: AutonomousBattlefieldOptions,
): MountedAutonomousBattlefield {
  const element = document.createElement("section");
  element.className = "autonomous-battlefield";
  element.dataset.region = "battlefield";
  element.setAttribute("aria-label", "춘천지구 자율 난전 전장");

  const canvas = document.createElement("canvas");
  canvas.className = "battlefield-canvas";
  canvas.dataset.region = "battlefield-canvas";
  canvas.dataset.drawCount = "0";
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "춘천지구의 절차적 아이소메트릭 지형");
  canvas.textContent = "전장 Canvas를 표시할 수 없습니다.";

  const overlay = document.createElement("div");
  overlay.className = "battlefield-formation-overlay";
  overlay.dataset.region = "battlefield-overlay";
  const effects = svgNode("svg");
  effects.classList.add("battlefield-effect-layer");
  effects.dataset.region = "battlefield-effects";
  effects.setAttribute("viewBox", "0 0 100 100");
  effects.setAttribute("preserveAspectRatio", "none");
  effects.setAttribute("aria-hidden", "true");
  element.append(canvas, effects, overlay);

  let destroyed = false;
  let drawCount = 0;
  const context = canvasContext(canvas);
  let canvasReady = context !== null;

  const updateCounts = (operation: AutonomousOperationViewModel | null): void => {
    const formations = operation?.formations ?? [];
    const controlled = formations.filter(({ controllable }) => controllable).length;
    element.dataset.operationState = visualState(operation);
    element.dataset.formationCount = String(formations.length);
    element.dataset.actorCount = String(
      formations.reduce((total, formation) => total + formation.actors.length, 0),
    );
    element.dataset.controlledFormationCount = String(controlled);
    element.dataset.uncontrolledFormationCount = String(formations.length - controlled);
    element.dataset.activeFormationCount = String(
      formations.filter(({ active }) => active).length,
    );
  };

  element.dataset.visualState = canvasReady ? "ready" : "degraded";

  const update = (
    operation: AutonomousOperationViewModel | null,
    reducedMotion: boolean,
  ): void => {
    if (destroyed) return;
    element.dataset.reducedMotion = String(reducedMotion);
    element.dataset.motionState = reducedMotion ? "reduced" : operation === null ? "idle" : "active";
    updateCounts(operation);
    if (canvasReady && context !== null) {
      try {
        drawTerrain(context, operation);
        drawCount += 1;
        canvas.dataset.drawCount = String(drawCount);
      } catch {
        canvasReady = false;
        element.dataset.visualState = "degraded";
      }
    }

    const focusedActorId = document.activeElement instanceof HTMLElement &&
        document.activeElement.classList.contains("battlefield-actor-pip")
      ? document.activeElement.dataset.actorId ?? null
      : null;
    const choreography = operation === null
      ? null
      : planBattlefieldChoreography(operation, reducedMotion);
    if (choreography === null) {
      effects.replaceChildren();
      effects.dataset.effectCount = "0";
      element.dataset.exchangeCount = "0";
      element.dataset.contactCount = "0";
    } else {
      renderActionEffects(effects, choreography);
      element.dataset.exchangeCount = String(choreography.exchanges.length);
      element.dataset.contactCount = String(
        choreography.exchanges.filter(({ kind }) => kind === "contact-pressure").length,
      );
    }
    const clusterScrollPositions = new Map(
      [...overlay.querySelectorAll<HTMLElement>(".battlefield-location-cluster")]
        .map((cluster) => [cluster.dataset.locationId ?? "", cluster.scrollTop] as const),
    );
    const formationsByLocation = new Map<
      string,
      AutonomousOperationViewModel["formations"][number][]
    >();
    for (const formation of operation?.formations ?? []) {
      const formations = formationsByLocation.get(formation.location) ?? [];
      formations.push(formation);
      formationsByLocation.set(formation.location, formations);
    }
    const formationPlans = new Map(
      choreography?.formations.map((formation) => [formation.formationId, formation]) ?? [],
    );
    const clusters = [...formationsByLocation.entries()].map(([locationId, formations]) =>
      locationCluster(locationId, formations, formationPlans, options.onInspectActor));
    overlay.replaceChildren(...clusters);
    for (const cluster of clusters) {
      cluster.scrollTop = clusterScrollPositions.get(cluster.dataset.locationId ?? "") ?? 0;
    }
    if (focusedActorId !== null) {
      [...overlay.querySelectorAll<HTMLButtonElement>(".battlefield-actor-pip")]
        .find(({ dataset }) => dataset.actorId === focusedActorId)
        ?.focus({ preventScroll: true });
    }
    element.setAttribute(
      "aria-label",
      operation === null
        ? "춘천지구 자율 난전 전장 · 작전 대기"
        : `춘천지구 자율 난전 전장 · 전투 집단 ${operation.formations.length}개 · 행동 주체 ${operation.formations.reduce((total, formation) => total + formation.actors.length, 0)}명 · 교전 압박 ${element.dataset.contactCount}개`,
    );
  };

  update(null, false);

  return {
    element,
    update,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      overlay.replaceChildren();
      effects.replaceChildren();
      element.dataset.visualState = "destroyed";
      element.dataset.formationCount = "0";
      element.dataset.actorCount = "0";
      element.dataset.controlledFormationCount = "0";
      element.dataset.uncontrolledFormationCount = "0";
      element.dataset.exchangeCount = "0";
      element.dataset.contactCount = "0";
    },
  };
}
