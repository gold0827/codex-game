/**
 * PROTOTYPE — Total War-style oblique battlefield, selected with `?variant=B`.
 */
import type { AutonomousOperationViewModel } from "../../operation/autonomousOperationProjector";

type Formation = AutonomousOperationViewModel["formations"][number];
type Actor = Formation["actors"][number];

const locationLabels: Readonly<Record<string, string>> = {
  "north-reinforcement-route": "북방 증원로",
  "north-chuncheon-axis": "춘천 북방",
  "east-chuncheon-route": "동부 우회로",
  "oksanpo-approach": "옥산포",
  "soyang-crossing-approach": "소양강 도하로",
  "soyang-north-bank": "소양강 북안",
  "wonchang-pass": "원창고개",
};

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function locationLabel(locationId: string): string {
  return locationLabels[locationId] ?? `작전 지점 ${String(stableHash(locationId) % 97 + 1).padStart(2, "0")}`;
}

function behaviorLabel(behavior: string | null): string {
  if (behavior === null) return "명령 대기";
  if (behavior.startsWith("intent:")) return "지휘 의도 수행";
  if (behavior.startsWith("guidance:")) return "전달 지침 수행";
  return {
    "seek-information": "정찰",
    verify: "정보 검증",
    "feedback-repeat": "전열 유지",
    "feedback-revise": "기동 수정",
    "act-independently": "자율 기동",
  }[behavior] ?? "현장 행동";
}

function terrainPath(className: string, pathData: string): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add(className);
  path.setAttribute("d", pathData);
  return path;
}

function renderTerrain(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("battlefield-prototype-b__terrain-lines");
  svg.setAttribute("viewBox", "0 0 1000 600");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.append(
    terrainPath("battlefield-prototype-b__river-shadow", "M1050 238 C780 270 840 390 610 415 C390 440 440 515 -30 585"),
    terrainPath("battlefield-prototype-b__river", "M1050 238 C780 270 840 390 610 415 C390 440 440 515 -30 585"),
    terrainPath("battlefield-prototype-b__road", "M650 205 C610 292 720 330 642 406 C570 476 540 522 528 620"),
  );
  return svg;
}

function actorSoldier(actor: Actor, onInspectActor: (id: string) => void): HTMLButtonElement {
  const soldier = document.createElement("button");
  soldier.type = "button";
  soldier.className = "battlefield-prototype-b__soldier";
  soldier.dataset.actorId = actor.id;
  soldier.dataset.condition = actor.condition;
  soldier.dataset.behavior = actor.behavior ?? "waiting";
  soldier.dataset.selected = String(actor.selected);
  soldier.setAttribute("aria-pressed", String(actor.selected));
  soldier.setAttribute(
    "aria-label",
    `${actor.label} · ${actor.conditionLabel} · ${behaviorLabel(actor.behavior)}`,
  );
  soldier.title = `${actor.label} — ${behaviorLabel(actor.behavior)}`;
  soldier.addEventListener("click", () => onInspectActor(actor.id));
  return soldier;
}

function sideIndex(formations: readonly Formation[], formation: Formation): number {
  return formations.filter(({ controllable }) => controllable === formation.controllable)
    .findIndex(({ id }) => id === formation.id);
}

function sideCount(formations: readonly Formation[], formation: Formation): number {
  return formations.filter(({ controllable }) => controllable === formation.controllable).length;
}

function formationPosition(formations: readonly Formation[], formation: Formation) {
  const index = sideIndex(formations, formation);
  const count = Math.max(1, sideCount(formations, formation));
  const column = index % 6;
  const row = Math.floor(index / 6);
  const columns = Math.min(6, count);
  const hash = stableHash(formation.id);
  const x = 9 + (column + 0.5) * (82 / columns) + (hash % 5 - 2);
  const baseY = formation.controllable ? 62 : 34;
  const y = baseY + row * (formation.controllable ? 8 : -7) + (Math.floor(hash / 11) % 5 - 2);
  return {
    x: Math.max(7, Math.min(93, x)),
    y: Math.max(23, Math.min(76, y)),
    scale: 0.58 + y / 165,
    angle: hash % 11 - 5,
  };
}

function formationRegiment(
  operation: AutonomousOperationViewModel,
  formation: Formation,
  onInspectActor: (id: string) => void,
): HTMLElement {
  const position = formationPosition(operation.formations, formation);
  const regiment = document.createElement("section");
  regiment.className = "battlefield-prototype-b__regiment";
  regiment.dataset.formationId = formation.id;
  regiment.dataset.controllable = String(formation.controllable);
  regiment.dataset.active = String(formation.active);
  regiment.dataset.location = formation.location;
  regiment.style.setProperty("--regiment-x", `${position.x}%`);
  regiment.style.setProperty("--regiment-y", `${position.y}%`);
  regiment.style.setProperty("--regiment-scale", String(position.scale));
  regiment.style.setProperty("--regiment-angle", `${position.angle}deg`);
  regiment.style.setProperty("--regiment-z", String(Math.round(position.y)));
  regiment.style.setProperty("--regiment-delay", `${-(operation.clock.elapsedMs % 4_000)}ms`);
  regiment.setAttribute(
    "aria-label",
    `${formation.label} · ${locationLabel(formation.location)} · ${formation.status} · ${formation.actorCount}명`,
  );

  const standard = document.createElement("div");
  standard.className = "battlefield-prototype-b__standard";
  standard.setAttribute("aria-hidden", "true");
  const standardCloth = document.createElement("span");
  standardCloth.textContent = formation.label.slice(0, 5);
  standard.append(standardCloth);

  const soldiers = document.createElement("div");
  soldiers.className = "battlefield-prototype-b__ranks";
  soldiers.style.setProperty("--rank-columns", String(Math.max(3, Math.min(9, Math.ceil(Math.sqrt(formation.actors.length * 1.7))))));
  for (const actor of formation.actors) soldiers.append(actorSoldier(actor, onInspectActor));

  const groundLabel = document.createElement("div");
  groundLabel.className = "battlefield-prototype-b__ground-label";
  const label = document.createElement("strong");
  label.textContent = formation.label;
  const status = document.createElement("span");
  status.textContent = `${formation.status} · ${formation.actors.filter(({ condition }) => condition === "effective").length}/${formation.actorCount}`;
  groundLabel.append(label, status);

  regiment.append(standard, soldiers, groundLabel);
  if (formation.active) {
    const dust = document.createElement("i");
    dust.className = "battlefield-prototype-b__dust";
    dust.setAttribute("aria-hidden", "true");
    regiment.append(dust);
  }
  return regiment;
}

function smokeColumn(index: number, severity: number): HTMLElement {
  const smoke = document.createElement("i");
  smoke.className = "battlefield-prototype-b__smoke";
  smoke.style.setProperty("--smoke-x", `${35 + index * 17 + severity * 5}%`);
  smoke.style.setProperty("--smoke-y", `${38 + index % 2 * 9}%`);
  smoke.style.setProperty("--smoke-scale", String(0.75 + severity * 0.7));
  smoke.style.setProperty("--smoke-delay", `${index * -1.7}s`);
  smoke.setAttribute("aria-hidden", "true");
  return smoke;
}

function formationRosterItem(
  formation: Formation,
  onInspectActor: (id: string) => void,
): HTMLButtonElement {
  const effective = formation.actors.filter(({ condition }) => condition === "effective").length;
  const item = document.createElement("button");
  item.type = "button";
  item.className = "battlefield-prototype-b__roster-unit";
  item.dataset.controllable = String(formation.controllable);
  item.dataset.active = String(formation.active);
  item.disabled = formation.actors.length === 0;
  item.setAttribute("aria-label", `${formation.label} 편성의 첫 행동 주체 살펴보기`);
  item.addEventListener("click", () => {
    const firstActor = formation.actors[0];
    if (firstActor) onInspectActor(firstActor.id);
  });
  const insignia = document.createElement("span");
  insignia.className = "battlefield-prototype-b__roster-insignia";
  insignia.textContent = formation.controllable ? "◆" : "◇";
  const name = document.createElement("strong");
  name.textContent = formation.label;
  const strength = document.createElement("small");
  strength.textContent = `${effective} / ${formation.actorCount}`;
  item.append(insignia, name, strength);
  return item;
}

export function renderBattlefieldPrototypeVariantB(
  operation: AutonomousOperationViewModel,
  onInspectActor: (id: string) => void,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "battlefield-prototype battlefield-prototype-b";
  root.dataset.variant = "B";
  root.dataset.operationState = operation.resolution.state;
  root.setAttribute("aria-label", "원근 전장 UI 프로토타입");

  const landscape = document.createElement("div");
  landscape.className = "battlefield-prototype-b__landscape";
  const sky = document.createElement("div");
  sky.className = "battlefield-prototype-b__sky";
  const mountains = document.createElement("div");
  mountains.className = "battlefield-prototype-b__mountains";
  const farRidge = document.createElement("div");
  farRidge.className = "battlefield-prototype-b__far-ridge";
  const nearRidge = document.createElement("div");
  nearRidge.className = "battlefield-prototype-b__near-ridge";
  const field = document.createElement("div");
  field.className = "battlefield-prototype-b__field";
  landscape.append(sky, mountains, farRidge, nearRidge, field, renderTerrain());

  const hud = document.createElement("header");
  hud.className = "battlefield-prototype-b__hud";
  const theatre = document.createElement("div");
  theatre.className = "battlefield-prototype-b__theatre";
  const theatreName = document.createElement("strong");
  theatreName.textContent = "춘천 전선";
  const theatreState = document.createElement("span");
  theatreState.textContent = operation.resolution.label;
  theatre.append(theatreName, theatreState);
  const clock = document.createElement("time");
  clock.className = "battlefield-prototype-b__clock";
  clock.textContent = operation.clock.label;
  const pressure = document.createElement("div");
  pressure.className = "battlefield-prototype-b__pressure";
  pressure.textContent = operation.harness.consequenceSummary;
  hud.append(theatre, clock, pressure);

  const regiments = document.createElement("div");
  regiments.className = "battlefield-prototype-b__regiments";
  for (const formation of operation.formations) {
    regiments.append(formationRegiment(operation, formation, onInspectActor));
  }

  const atmosphere = document.createElement("div");
  atmosphere.className = "battlefield-prototype-b__atmosphere";
  const smokeCount = Math.max(
    2,
    Math.min(5, operation.harness.consequences.length + operation.formations.filter(({ actors }) =>
      actors.some(({ condition }) => condition === "suppressed")).length),
  );
  for (let index = 0; index < smokeCount; index += 1) {
    atmosphere.append(smokeColumn(index, operation.harness.consequences[index]?.severity ?? 0.35));
  }

  const roster = document.createElement("nav");
  roster.className = "battlefield-prototype-b__roster";
  roster.setAttribute("aria-label", "전장 편성 명부");
  for (const formation of operation.formations) {
    roster.append(formationRosterItem(formation, onInspectActor));
  }

  const objective = operation.objectives.find(({ required }) => required) ?? operation.objectives[0];
  if (objective) {
    const objectiveStatus = document.createElement("aside");
    objectiveStatus.className = "battlefield-prototype-b__objective";
    objectiveStatus.textContent = `${objective.label} · ${objective.progressLabel}`;
    objectiveStatus.style.setProperty("--objective-progress", `${objective.progress * 100}%`);
    root.append(landscape, atmosphere, regiments, hud, objectiveStatus, roster);
  } else {
    root.append(landscape, atmosphere, regiments, hud, roster);
  }
  return root;
}
