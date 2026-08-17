type OverlayName = "manual" | "settings" | "editor";

type OverlayTransition = Readonly<{
  from: OverlayName;
  to: OverlayName;
  fromHidden: boolean;
  toVisible: boolean;
  paused: boolean;
  stayedInert: boolean;
}>;

declare global {
  var __overlayFixtureResult: Readonly<{
    passed: boolean;
    editorEnabled: boolean;
    openedManual: boolean;
    transitions: readonly OverlayTransition[];
    closed: boolean;
    resumed: boolean;
    focusRestored: boolean;
  }> | undefined;
}

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("Production app root is missing for the overlay fixture.");
const root: HTMLElement = appRoot;

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 20);
  });
}

const action = (name: string): HTMLButtonElement => {
  const button = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  if (!button) throw new Error(`Missing overlay fixture action ${name}.`);
  return button;
};

const overlay = (name: OverlayName): HTMLElement => {
  const selectors = {
    manual: ".workbench-manual",
    settings: ".workbench-settings",
    editor: ".workbench-editor",
  } as const;
  const element = root.querySelector<HTMLElement>(selectors[name]);
  if (!element) throw new Error(`Missing ${name} overlay.`);
  return element;
};

action("start-attempt").click();
await nextFrame();

const workbenchShell = root.querySelector<HTMLElement>(".game-workbench");
const mountedGameRoot = root.querySelector<HTMLElement>(".workbench-game");
if (!workbenchShell || !mountedGameRoot) throw new Error("Workbench shell is missing.");
const shell: HTMLElement = workbenchShell;
const gameRoot: HTMLElement = mountedGameRoot;
const editorEnabled = root.querySelector('[data-action="open-editor"]') !== null;

action("open-manual").click();
await nextFrame();
const openedManual = !overlay("manual").hidden &&
  shell.classList.contains("manual-open") &&
  gameRoot.inert &&
  action("resume").textContent === "재개";

async function transition(from: OverlayName, to: OverlayName): Promise<OverlayTransition> {
  action(`open-${to}`).click();
  await nextFrame();
  return {
    from,
    to,
    fromHidden: overlay(from).hidden !== false,
    toVisible: !overlay(to).hidden && shell.classList.contains(`${to}-open`),
    paused: action("resume").textContent === "재개",
    stayedInert: gameRoot.inert,
  };
}

const transitions = [
  await transition("manual", "settings"),
  await transition("settings", "editor"),
];

const editorTrigger = action("open-editor");
action("close-editor").click();
await nextFrame();
const closed = overlay("editor").hidden !== false &&
  !shell.classList.contains("editor-open") &&
  !gameRoot.inert;
const resumed = action("pause").textContent === "일시정지";
const focusRestored = document.activeElement === editorTrigger;
const passed = editorEnabled &&
  openedManual &&
  transitions.every((step) => step.fromHidden && step.toVisible && step.paused && step.stayedInert) &&
  closed &&
  resumed &&
  focusRestored;

globalThis.__overlayFixtureResult = {
  passed,
  editorEnabled,
  openedManual,
  transitions,
  closed,
  resumed,
  focusRestored,
};
