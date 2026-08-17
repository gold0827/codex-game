import { beforeEach, describe, expect, it } from "vitest";

import {
  createWorkbenchOverlays,
  type WorkbenchOverlayAdapter,
  type WorkbenchOverlayName,
} from "../../src/app/WorkbenchOverlays";

describe("workbench overlays module", () => {
  let shell: HTMLElement;
  let gameRoot: HTMLElement;
  let tools: HTMLElement;
  let state: { phase: string; paused: boolean };
  let commands: string[];
  let adapterEvents: string[];
  let triggers: Record<WorkbenchOverlayName, HTMLButtonElement>;

  const adapter = (name: WorkbenchOverlayName): WorkbenchOverlayAdapter => ({
    show: () => { adapterEvents.push(`show:${name}`); },
    hide: () => { adapterEvents.push(`hide:${name}`); },
    focusTrigger: () => {
      adapterEvents.push(`focus:${name}`);
      triggers[name].focus();
    },
  });

  const create = (includeEditor = true) => createWorkbenchOverlays({
    shell,
    gameRoot,
    tools,
    adapters: {
      manual: adapter("manual"),
      settings: adapter("settings"),
      ...(includeEditor ? { editor: adapter("editor") } : {}),
    },
    operation: {
      read: () => state,
      pause: () => {
        commands.push("pause");
        state.paused = true;
      },
      resume: () => {
        commands.push("resume");
        state.paused = false;
      },
    },
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <main class="game-workbench">
        <div class="workbench-game"></div>
        <div class="workbench-tools"></div>
        <button data-trigger="manual"></button>
        <button data-trigger="settings"></button>
        <button data-trigger="editor"></button>
      </main>
    `;
    shell = document.querySelector(".game-workbench")!;
    gameRoot = document.querySelector(".workbench-game")!;
    tools = document.querySelector(".workbench-tools")!;
    triggers = {
      manual: document.querySelector('[data-trigger="manual"]')!,
      settings: document.querySelector('[data-trigger="settings"]')!,
      editor: document.querySelector('[data-trigger="editor"]')!,
    };
    state = { phase: "operation", paused: false };
    commands = [];
    adapterEvents = [];
  });

  it("transfers one pause ownership across mutually exclusive overlays", () => {
    const overlays = create();

    overlays.open("manual");
    overlays.open("settings");
    overlays.open("editor");

    expect(commands).toEqual(["pause"]);
    expect(adapterEvents).toEqual([
      "show:manual",
      "hide:manual",
      "show:settings",
      "hide:settings",
      "show:editor",
    ]);
    expect(shell.classList.contains("manual-open")).toBe(false);
    expect(shell.classList.contains("settings-open")).toBe(false);
    expect(shell.classList.contains("editor-open")).toBe(true);
    expect(tools.hidden).toBe(true);
    expect(gameRoot.inert).toBe(true);

    overlays.closeActive();

    expect(commands).toEqual(["pause", "resume"]);
    expect(tools.hidden).toBe(false);
    expect(gameRoot.inert).not.toBe(true);
    expect(document.activeElement).toBe(triggers.editor);
  });

  it("does not resume an operation that was already paused", () => {
    state.paused = true;
    const overlays = create();

    overlays.open("settings");
    overlays.close("settings");

    expect(commands).toEqual([]);
    expect(state.paused).toBe(true);
  });

  it("forgets pause ownership when the game is reset", () => {
    const overlays = create();

    overlays.open("manual");
    overlays.resetPauseOwnership();
    overlays.close("manual");

    expect(commands).toEqual(["pause"]);
  });

  it("ignores unavailable and inactive overlays", () => {
    const overlays = create(false);

    overlays.open("editor");
    overlays.close("manual");
    overlays.closeActive();

    expect(commands).toEqual([]);
    expect(adapterEvents).toEqual([]);
    expect(tools.hidden).toBe(false);
    expect(gameRoot.inert).not.toBe(true);
  });
});
