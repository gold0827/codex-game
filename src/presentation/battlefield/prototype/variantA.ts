/**
 * PROTOTYPE A — overhead regimental battlefield inspired by painted campaign maps.
 * This is intentionally read-only and disposable; it projects the canonical operation state.
 */
import type { AutonomousOperationViewModel } from "../../operation/autonomousOperationProjector";
import { planBattlefieldChoreography } from "../battlefieldChoreography";

type OperationFormation = AutonomousOperationViewModel["formations"][number];
type OperationActor = OperationFormation["actors"][number];
type FormationChoreography = ReturnType<typeof planBattlefieldChoreography>["formations"][number];
type ActorChoreography = FormationChoreography["actors"][number];

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function terrainLayer(): SVGSVGElement {
  const layer = svg("svg", {
    class: "prototype-a-terrain",
    viewBox: "0 0 1000 620",
    preserveAspectRatio: "none",
    role: "img",
    "aria-label": "소양강과 산림, 밭, 흙길로 이루어진 춘천 전장",
  });

  const base = svg("path", {
    class: "prototype-a-ground",
    d: "M0 0H1000V620H0Z",
  });
  const northField = svg("path", {
    class: "prototype-a-field prototype-a-field-wheat",
    d: "M38 28 C138 9 258 27 331 87 C361 113 346 170 294 190 C212 220 80 201 29 140 Z",
  });
  const eastField = svg("path", {
    class: "prototype-a-field prototype-a-field-fallow",
    d: "M707 30 C821 4 958 40 989 112 L976 268 C899 278 804 250 741 202 C690 164 665 78 707 30 Z",
  });
  const southField = svg("path", {
    class: "prototype-a-field prototype-a-field-wheat",
    d: "M472 425 C558 380 713 391 800 449 C848 481 841 558 777 603 L456 620 C418 570 416 469 472 425 Z",
  });
  const westRise = svg("path", {
    class: "prototype-a-rise",
    d: "M-20 287 C98 240 202 252 280 313 C320 344 303 406 248 441 C166 493 49 460 -18 414 Z",
  });
  const ridge = svg("path", {
    class: "prototype-a-ridge",
    d: "M612 0 C598 73 617 125 671 174 C729 226 740 298 704 359 C670 414 654 471 676 620",
  });
  const riverBank = svg("path", {
    class: "prototype-a-river-bank",
    d: "M-40 360 C126 301 244 322 352 369 C474 421 587 405 714 330 C825 265 918 277 1040 320",
  });
  const river = svg("path", {
    class: "prototype-a-river",
    d: "M-40 379 C127 320 237 339 345 386 C476 443 592 424 723 347 C833 282 923 296 1040 337",
  });
  const road = svg("path", {
    class: "prototype-a-road-shadow",
    d: "M92 -30 C180 88 294 131 423 157 C543 181 641 237 698 323 C756 410 841 485 1024 558",
  });
  const roadTop = svg("path", {
    class: "prototype-a-road",
    d: "M92 -30 C180 88 294 131 423 157 C543 181 641 237 698 323 C756 410 841 485 1024 558",
  });
  const forest = svg("g", { class: "prototype-a-forest", "aria-hidden": "true" });
  const trees = [
    [81, 224, 34], [124, 245, 27], [165, 221, 37], [211, 245, 31], [243, 210, 25],
    [378, 48, 31], [417, 63, 39], [459, 42, 29], [500, 68, 35], [541, 43, 28],
    [814, 343, 30], [856, 328, 38], [900, 354, 33], [941, 326, 27], [972, 369, 34],
    [287, 505, 32], [327, 480, 38], [366, 512, 28], [402, 489, 34],
  ] as const;
  trees.forEach(([cx, cy, radius], index) => {
    forest.append(svg("circle", {
      class: index % 3 === 0 ? "prototype-a-tree prototype-a-tree-light" : "prototype-a-tree",
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
    }));
  });
  const labels = svg("g", { class: "prototype-a-map-labels" });
  const riverLabel = svg("text", { x: "465", y: "402" });
  riverLabel.textContent = "소 양 강";
  const ridgeLabel = svg("text", { x: "678", y: "108" });
  ridgeLabel.textContent = "춘천 북방 능선";
  labels.append(riverLabel, ridgeLabel);

  layer.append(
    base,
    northField,
    eastField,
    southField,
    westRise,
    ridge,
    road,
    roadTop,
    forest,
    riverBank,
    river,
    labels,
  );
  return layer;
}

function actorToken(
  actor: OperationActor,
  choreography: ActorChoreography | undefined,
  elapsedMs: number,
  inspect: (actorId: string) => void,
): HTMLButtonElement {
  const token = document.createElement("button");
  token.type = "button";
  token.className = "prototype-a-soldier";
  token.dataset.actorId = actor.id;
  token.dataset.condition = actor.condition;
  token.dataset.selected = String(actor.selected);
  token.dataset.behavior = actor.behavior ?? "waiting";
  token.dataset.moving = String(choreography?.moving ?? false);
  token.dataset.action = choreography?.visualAction ?? "waiting";
  token.style.setProperty(
    "--prototype-a-step-delay",
    `${-((elapsedMs + stableHash(actor.id)) % 1_200)}ms`,
  );
  token.setAttribute("aria-pressed", String(actor.selected));
  token.setAttribute(
    "aria-label",
    `${actor.label} · ${actor.conditionLabel}${actor.confidence ? ` · 판단 신뢰 ${actor.confidence}` : ""}`,
  );
  token.title = `${actor.label} · ${actor.conditionLabel}`;
  token.addEventListener("click", () => inspect(actor.id));
  return token;
}

function formationLine(
  formation: OperationFormation,
  x: number,
  y: number,
  rotation: number,
  clusterIndex: number,
  choreography: FormationChoreography | undefined,
  elapsedMs: number,
  inspect: (actorId: string) => void,
): HTMLElement {
  const formationElement = document.createElement("article");
  formationElement.className = "prototype-a-formation";
  formationElement.dataset.formationId = formation.id;
  formationElement.dataset.side = formation.controllable ? "friendly" : "hostile";
  formationElement.dataset.active = String(formation.active);
  formationElement.dataset.marching = String(
    choreography?.actors.some(({ moving }) => moving) ?? false,
  );
  formationElement.style.left = `${x}%`;
  formationElement.style.top = `${y}%`;
  formationElement.style.setProperty("--prototype-a-rotation", `${rotation}deg`);
  formationElement.style.setProperty("--prototype-a-cluster-offset", `${clusterIndex * 18}px`);
  const marchDirection = formation.controllable ? -1 : 1;
  const hash = stableHash(formation.id);
  const marchX = ((hash % 7) - 3) * 2;
  const marchY = marchDirection * (16 + hash % 9);
  formationElement.style.setProperty("--prototype-a-march-from-x", `${marchX * -0.42}px`);
  formationElement.style.setProperty("--prototype-a-march-from-y", `${marchY * -0.42}px`);
  formationElement.style.setProperty("--prototype-a-march-x", `${marchX}px`);
  formationElement.style.setProperty("--prototype-a-march-y", `${marchY}px`);
  formationElement.style.setProperty(
    "--prototype-a-march-duration",
    `${5_400 + hash % 2_400}ms`,
  );
  formationElement.style.setProperty(
    "--prototype-a-march-delay",
    `${-((elapsedMs + hash) % 7_800)}ms`,
  );
  formationElement.setAttribute(
    "aria-label",
    `${formation.label} · ${formation.status} · 행동 주체 ${formation.actorCount}명`,
  );

  const standard = document.createElement("div");
  standard.className = "prototype-a-standard";
  const pole = document.createElement("span");
  pole.className = "prototype-a-standard-pole";
  const flag = document.createElement("span");
  flag.className = "prototype-a-standard-cloth";
  const label = document.createElement("strong");
  label.className = "prototype-a-formation-label";
  label.textContent = formation.label;
  const status = document.createElement("span");
  status.className = "prototype-a-formation-status";
  status.textContent = formation.status;
  standard.append(pole, flag, label, status);

  const regiment = document.createElement("div");
  regiment.className = "prototype-a-regiment-line";
  regiment.style.setProperty("--prototype-a-count", String(Math.max(1, formation.actors.length)));
  formation.actors.forEach((actor, index) => {
    const actorPlan = choreography?.actors.find(({ actorId }) => actorId === actor.id);
    const token = actorToken(actor, actorPlan, elapsedMs, inspect);
    const hash = stableHash(actor.id);
    const spread = formation.actors.length <= 1 ? 0 : index / (formation.actors.length - 1) - 0.5;
    token.style.setProperty("--prototype-a-position", String(index));
    token.style.left = `${50 + spread * Math.min(150, 28 + formation.actors.length * 13)}px`;
    token.style.top = `${Math.sin(spread * Math.PI) * 5 + (hash % 5) - 2}px`;
    token.style.transform = `rotate(${(hash % 9) - 4}deg)`;
    regiment.append(token);
  });

  formationElement.append(standard, regiment);
  return formationElement;
}

function contactEffects(
  operation: AutonomousOperationViewModel,
  positions: ReadonlyMap<string, Readonly<{ x: number; y: number }>>,
): SVGSVGElement {
  const layer = svg("svg", {
    class: "prototype-a-contact-layer",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  const choreography = planBattlefieldChoreography(operation, false);
  choreography.exchanges
    .filter(({ kind }) => kind === "contact-pressure")
    .forEach((exchange) => {
      const from = positions.get(exchange.fromFormationId);
      const to = positions.get(exchange.toFormationId);
      if (!from || !to) return;
      const pressure = svg("path", {
        class: "prototype-a-pressure-line",
        d: `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2 + 2} ${(from.y + to.y) / 2 - 3} ${to.x} ${to.y}`,
      });
      layer.append(pressure);
      for (let index = 0; index < 3; index += 1) {
        const smoke = svg("circle", {
          class: "prototype-a-smoke",
          cx: String((from.x + to.x) / 2 + index * 1.8 - 1.8),
          cy: String((from.y + to.y) / 2 + (index % 2) * 1.3),
          r: String(1.8 + index * 0.5),
        });
        smoke.style.setProperty("--prototype-a-smoke-delay", `${index * -0.8}s`);
        layer.append(smoke);
      }
    });
  return layer;
}

export function renderBattlefieldPrototypeVariantA(
  operation: AutonomousOperationViewModel,
  onInspectActor: (id: string) => void,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "battlefield-prototype battlefield-prototype-a";
  root.dataset.region = "battlefield-prototype";
  root.dataset.variant = "A";
  root.dataset.formationCount = String(operation.formations.length);
  root.dataset.actorCount = String(
    operation.formations.reduce((total, formation) => total + formation.actors.length, 0),
  );
  root.setAttribute(
    "aria-label",
    `전장 원형 A · ${operation.resolution.label} · ${operation.clock.elapsed}`,
  );

  const stage = document.createElement("div");
  stage.className = "prototype-a-stage";
  stage.append(terrainLayer());

  const choreography = planBattlefieldChoreography(operation, false);
  const planByFormation = new Map(
    choreography.formations.map((formation) => [formation.formationId, formation]),
  );
  const locationCounts = new Map<string, number>();
  const positions = new Map<string, Readonly<{ x: number; y: number }>>();
  const formations = operation.formations.map((formation) => {
    const plan = planByFormation.get(formation.id);
    const clusterIndex = locationCounts.get(formation.location) ?? 0;
    locationCounts.set(formation.location, clusterIndex + 1);
    const hash = stableHash(formation.id);
    const x = Math.max(9, Math.min(88, (plan?.anchor.x ?? 50) + clusterIndex * 3.6));
    const y = Math.max(12, Math.min(88, (plan?.anchor.y ?? 50) + clusterIndex * 3));
    positions.set(formation.id, { x, y });
    return formationLine(
      formation,
      x,
      y,
      (formation.controllable ? -7 : 7) + (hash % 9) - 4,
      clusterIndex,
      plan,
      operation.clock.elapsedMs,
      onInspectActor,
    );
  });
  stage.append(contactEffects(operation, positions), ...formations);

  const clock = document.createElement("div");
  clock.className = "prototype-a-clock";
  const phase = document.createElement("span");
  phase.className = "prototype-a-phase";
  phase.textContent = operation.resolution.label;
  const time = document.createElement("time");
  time.textContent = operation.clock.label;
  const progress = document.createElement("span");
  progress.className = "prototype-a-clock-progress";
  progress.style.setProperty(
    "--prototype-a-progress",
    `${Math.max(0, Math.min(100, operation.clock.progress * 100))}%`,
  );
  clock.append(phase, time, progress);

  const legend = document.createElement("div");
  legend.className = "prototype-a-legend";
  legend.textContent = "청군 아군 · 적군 적군 · 연기 교전 접촉";
  root.append(stage, clock, legend);
  return root;
}
