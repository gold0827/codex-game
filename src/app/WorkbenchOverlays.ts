export type WorkbenchOverlayName = "manual" | "settings" | "editor";

export type WorkbenchOverlayAdapter = Readonly<{
  show: () => void;
  hide: () => void;
  focusTrigger: () => void;
}>;

export type WorkbenchOperationControl = Readonly<{
  read: () => Readonly<{ phase: string; paused: boolean }>;
  pause: () => void;
  resume: () => void;
}>;

export type WorkbenchOverlays = Readonly<{
  open: (name: WorkbenchOverlayName) => void;
  close: (name: WorkbenchOverlayName) => void;
  closeActive: () => void;
  resetPauseOwnership: () => void;
}>;

type WorkbenchOverlaysOptions = Readonly<{
  shell: HTMLElement;
  gameRoot: HTMLElement;
  tools: HTMLElement;
  adapters: Partial<Record<WorkbenchOverlayName, WorkbenchOverlayAdapter>>;
  operation: WorkbenchOperationControl;
}>;

export function createWorkbenchOverlays(
  options: WorkbenchOverlaysOptions,
): WorkbenchOverlays {
  let active: WorkbenchOverlayName | null = null;
  let ownsPause = false;

  const hide = (name: WorkbenchOverlayName): void => {
    options.adapters[name]?.hide();
    options.shell.classList.remove(`${name}-open`);
  };

  const open = (name: WorkbenchOverlayName): void => {
    const adapter = options.adapters[name];
    if (!adapter || active === name) return;

    if (active) {
      hide(active);
    } else {
      const state = options.operation.read();
      if (state.phase === "operation" && !state.paused) {
        options.operation.pause();
        ownsPause = true;
      }
    }

    active = name;
    adapter.show();
    options.shell.classList.add(`${name}-open`);
    options.tools.hidden = true;
    options.gameRoot.inert = true;
  };

  const close = (name: WorkbenchOverlayName): void => {
    if (active !== name) return;

    hide(name);
    active = null;
    options.tools.hidden = false;
    options.gameRoot.inert = false;

    const shouldResume = ownsPause && options.operation.read().phase === "operation";
    ownsPause = false;
    if (shouldResume) options.operation.resume();
    options.adapters[name]?.focusTrigger();
  };

  return {
    open,
    close,
    closeActive: () => {
      if (active) close(active);
    },
    resetPauseOwnership: () => {
      ownsPause = false;
    },
  };
}
