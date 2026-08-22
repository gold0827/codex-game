import {
  type SquadBattleGameCommand,
  type SquadBattleSession,
  type SquadBattleSessionSnapshot,
} from "../application/squad-battle-session";
import type { BattlefieldMapFrame } from "../presentation/battlefield/battlefieldFrame";
import {
  mountCanvasBattlefield,
  type MountedCanvasBattlefield,
} from "../presentation/battlefield/canvasBattlefield";
import type { GameFrameScheduler } from "../presentation/gameEffects";
import { projectSquadBattleFrame } from "../presentation/operation/squadBattleProjector";

export type SquadBattleAppOptions = Readonly<{
  frameScheduler?: GameFrameScheduler;
  reducedMotion?: boolean | (() => boolean);
}>;

export type SquadBattleApp = Readonly<{
  session: SquadBattleSession;
  render: () => void;
  destroy: () => void;
}>;

const ORDER_LABEL = Object.freeze({
  advance: "진군",
  hold: "고수",
  focus: "집중 공격",
  withdraw: "후퇴/휴식",
} as const);

const ZONE_LABEL = Object.freeze({
  "allied-camp": "서쪽 지휘소",
  "west-bank": "서쪽 제방",
  bridge: "해인교",
  "east-bank": "동쪽 제방",
  "enemy-camp": "적 집결지",
  "north-ford": "북쪽 여울",
  "south-road": "남쪽 농로",
} as const);

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function metric(label: string, value: number): HTMLElement {
  const wrapper = element("div", "squad-battle-metric");
  const heading = element("div", "squad-battle-metric-heading");
  heading.append(element("span", undefined, label), element("strong", undefined, `${Math.round(value)}%`));
  const meter = element("div", "squad-battle-meter");
  const fill = element("span", "squad-battle-meter-fill");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  meter.append(fill);
  wrapper.append(heading, meter);
  return wrapper;
}

function statusLabel(status: SquadBattleSessionSnapshot["battle"]["status"]): string {
  if (status === "victory") return "작전 성공";
  if (status === "defeat") return "작전 실패";
  return "교전 중";
}

export function mountSquadBattleApp(
  root: HTMLElement,
  session: SquadBattleSession,
  map: BattlefieldMapFrame,
  options: SquadBattleAppOptions = {},
): SquadBattleApp {
  const scheduler = options.frameScheduler ?? {
    request: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
    cancel: (handle: number) => window.cancelAnimationFrame(handle),
  };
  const battlefield: MountedCanvasBattlefield = mountCanvasBattlefield(scheduler);
  let destroyed = false;
  let frameHandle: number | null = null;
  let previousTimestamp: number | null = null;
  let renderedElapsedMs = -1;

  const prefersReducedMotion = (): boolean => {
    if (typeof options.reducedMotion === "function") return options.reducedMotion();
    return options.reducedMotion
      ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ?? false;
  };

  const button = (
    label: string,
    action: string,
    command: SquadBattleGameCommand,
    disabled = false,
  ): HTMLButtonElement => {
    const value = element("button", "squad-battle-button", label);
    value.type = "button";
    value.dataset.action = action;
    value.disabled = disabled;
    value.addEventListener("click", () => dispatch(command));
    return value;
  };

  const renderSquad = (
    squad: SquadBattleSessionSnapshot["battle"]["squads"][number],
  ): HTMLElement => {
    const card = element("article", `squad-battle-squad squad-${squad.side}`);
    card.dataset.squadId = squad.id;
    const heading = element("header", "squad-battle-squad-heading");
    heading.append(
      element("strong", undefined, squad.name),
      element("span", `squad-battle-side side-${squad.side}`, squad.side === "ally" ? "아군" : "적군"),
    );
    const survivors = squad.soldiers.filter(({ health }) => health > 0).length;
    const pending = squad.pendingOrder
      ? ` · 전달 중 ${ORDER_LABEL[squad.pendingOrder.order]} (${Math.max(0, (squad.pendingOrder.arrivesAtMs - session.read().battle.elapsedMs) / 1_000)}초)`
      : "";
    const state = !squad.active
      ? "미투입"
      : squad.routed ? "패주" : `${ORDER_LABEL[squad.order]}${pending}`;
    card.append(
      heading,
      element("p", "squad-battle-squad-state", `${ZONE_LABEL[squad.position]} · ${state}`),
      element("p", "squad-battle-survivors", `생존 ${survivors}/${squad.soldiers.length}`),
      metric("사기", squad.morale),
      metric("피로", squad.fatigue),
    );
    return card;
  };

  const renderOrders = (
    snapshot: SquadBattleSessionSnapshot,
    squadId: "main" | "relief",
    label: string,
  ): HTMLElement => {
    const squad = snapshot.battle.squads.find(({ id }) => id === squadId)!;
    const disabled = snapshot.battle.status !== "running" || !squad.active || squad.routed;
    const group = element("section", "squad-battle-order-group");
    group.append(element("h3", undefined, label));
    group.append(
      button("진군", `${squadId}-advance`, {
        type: "battle-command", command: { kind: "order", squadId, order: "advance" },
      }, disabled),
      button("고수", `${squadId}-hold`, {
        type: "battle-command", command: { kind: "order", squadId, order: "hold" },
      }, disabled),
      button("적 선봉 집중", `${squadId}-focus-assault`, {
        type: "battle-command",
        command: { kind: "order", squadId, order: "focus", targetId: "enemy-assault" },
      }, disabled),
      button("적 증원 집중", `${squadId}-focus-reserve`, {
        type: "battle-command",
        command: { kind: "order", squadId, order: "focus", targetId: "enemy-reserve" },
      }, disabled),
      button("후퇴/휴식", `${squadId}-withdraw`, {
        type: "battle-command", command: { kind: "order", squadId, order: "withdraw" },
      }, disabled),
    );
    return group;
  };

  function render(): void {
    if (destroyed) return;
    const snapshot = session.read();
    renderedElapsedMs = snapshot.battle.elapsedMs;
    battlefield.update(projectSquadBattleFrame(snapshot, map, prefersReducedMotion()));
    const shell = element("main", "squad-battle-game");
    shell.dataset.status = snapshot.battle.status;

    const header = element("header", "squad-battle-header");
    const title = element("div");
    title.append(
      element("p", "squad-battle-eyebrow", "자율군단 지휘학교 · 실전 재설계"),
      element("h1", undefined, "해인교 두 부대 난전"),
      element("p", "squad-battle-subtitle", "병사들은 스스로 싸운다. 당신은 어디서 버티고 언제 증원할지만 정한다."),
    );
    const clock = element("div", "squad-battle-clock");
    clock.append(
      element("span", undefined, `${Math.floor(snapshot.battle.elapsedMs / 1_000)} / ${snapshot.battle.durationMs / 1_000}초`),
      element("strong", `squad-battle-status status-${snapshot.battle.status}`, statusLabel(snapshot.battle.status)),
    );
    header.append(title, clock);

    const timeline = element("section", "squad-battle-time-controls");
    timeline.setAttribute("aria-label", "전투 시간 제어");
    timeline.append(
      snapshot.paused
        ? button("재개", "resume", { type: "resume" }, snapshot.battle.status !== "running")
        : button("일시정지", "pause", { type: "pause" }),
      ...([0.5, 1, 2] as const).map((speed) => {
        const control = button(`${speed}배`, `speed-${speed}`, { type: "set-speed", speed });
        control.setAttribute("aria-pressed", String(snapshot.speed === speed));
        return control;
      }),
      button("같은 전투 다시 시작", "reset-battle", { type: "reset" }),
    );

    const mission = element("section", "squad-battle-mission");
    mission.append(metric("해인교 내구도", snapshot.battle.bridgeIntegrity), metric("수송대 통과", snapshot.battle.convoyProgress));
    if (snapshot.battle.status !== "running") {
      mission.append(element(
        "p",
        `squad-battle-outcome outcome-${snapshot.battle.status}`,
        snapshot.battle.events.at(-1)?.description ?? statusLabel(snapshot.battle.status),
      ));
    }

    const battlefieldColumn = element("section", "squad-battle-field-column");
    battlefieldColumn.append(element("h2", undefined, "실시간 전장"), battlefield.element);

    const roster = element("section", "squad-battle-roster");
    roster.append(element("h2", undefined, "부대 상태"));
    snapshot.battle.squads.forEach((squad) => roster.append(renderSquad(squad)));

    const layout = element("div", "squad-battle-layout");

    const commands = element("section", "squad-battle-commands");
    commands.append(element("h2", undefined, "부대 명령"), renderOrders(snapshot, "main", "해인교 본대"));
    const relief = snapshot.battle.squads.find(({ id }) => id === "relief")!;
    const deployGroup = element("section", "squad-battle-order-group");
    deployGroup.append(
      element("h3", undefined, "지원대 투입"),
      button("북쪽 여울", "deploy-north", {
        type: "battle-command", command: { kind: "deploy-relief", route: "north" },
      }, relief.active || snapshot.battle.status !== "running"),
      button("남쪽 농로", "deploy-south", {
        type: "battle-command", command: { kind: "deploy-relief", route: "south" },
      }, relief.active || snapshot.battle.status !== "running"),
    );
    commands.append(deployGroup, renderOrders(snapshot, "relief", "우회 지원대"));

    const tacticalSidebar = element("aside", "squad-battle-tactical-sidebar");
    tacticalSidebar.append(commands, roster);
    layout.append(battlefieldColumn, tacticalSidebar);

    const log = element("section", "squad-battle-log");
    log.append(element("h2", undefined, "최근 전황"));
    const list = element("ol");
    snapshot.battle.events.slice(-12).reverse().forEach((event) => {
      const item = element("li");
      item.append(
        element("time", undefined, `${Math.floor(event.timeMs / 1_000)}초`),
        element("span", undefined, event.description),
      );
      list.append(item);
    });
    log.append(list);

    shell.append(header, timeline, mission, layout, log);
    root.replaceChildren(shell);
  }

  const syncFrameLoop = (): void => {
    const snapshot = session.read();
    const shouldRun = !destroyed && !snapshot.paused && snapshot.battle.status === "running";
    if (shouldRun && frameHandle === null) frameHandle = scheduler.request(tick);
    if (!shouldRun && frameHandle !== null) {
      scheduler.cancel(frameHandle);
      frameHandle = null;
      previousTimestamp = null;
    }
  };

  const dispatch = (command: SquadBattleGameCommand): void => {
    session.dispatch(command);
    previousTimestamp = null;
    render();
    syncFrameLoop();
  };

  function tick(timestamp: number): void {
    frameHandle = null;
    if (destroyed) return;
    if (previousTimestamp === null) previousTimestamp = timestamp;
    else {
      const elapsed = Math.max(0, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      const snapshot = session.advance(elapsed);
      if (snapshot.battle.elapsedMs !== renderedElapsedMs || snapshot.paused) render();
    }
    syncFrameLoop();
  }

  render();
  syncFrameLoop();
  return {
    session,
    render,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (frameHandle !== null) scheduler.cancel(frameHandle);
      frameHandle = null;
      battlefield.destroy();
      root.replaceChildren();
    },
  };
}
