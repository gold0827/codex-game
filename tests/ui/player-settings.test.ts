import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlayerSettingsStore,
  mountPlayerSettingsPanel,
  normalizePlayerSettings,
  type PlayerSettings,
} from "../../src/app/PlayerSettings";
import type { GameAudio } from "../../src/ui/GameAudio";

describe("player settings module", () => {
  let host: HTMLElement;
  let shell: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<main id="shell"><div id="host"></div></main>';
    shell = document.querySelector("#shell")!;
    host = document.querySelector("#host")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes untrusted settings without exposing invalid values", () => {
    expect(normalizePlayerSettings({
      muted: true,
      masterVolume: 7,
      musicVolume: -2,
      effectsVolume: Number.NaN,
      reducedMotion: true,
      showTutorial: false,
      uiScale: "unknown",
    })).toEqual({
      muted: true,
      masterVolume: 1,
      musicVolume: 0,
      effectsVolume: 0.8,
      reducedMotion: true,
      showTutorial: false,
      uiScale: "standard",
    });
  });

  it("persists through the storage adapter and restores JSON", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const store = createPlayerSettingsStore(storage, "settings:v1");
    const settings: PlayerSettings = {
      muted: false,
      masterVolume: 0.5,
      musicVolume: 0.6,
      effectsVolume: 0.7,
      reducedMotion: true,
      showTutorial: false,
      uiScale: "large",
    };

    store.save(settings);
    expect(store.load()).toEqual(settings);
  });

  it("owns controls, persistence, audio application, and dialog focus", () => {
    let saved: PlayerSettings | null = null;
    const volumes: number[] = [];
    const audio: GameAudio = {
      cue: () => undefined,
      setSoundtrack: () => undefined,
      muted: () => false,
      setMuted: () => undefined,
      setMasterVolume: (volume) => { volumes.push(volume); },
      setMusicVolume: () => undefined,
      setEffectsVolume: () => undefined,
      dispose: () => undefined,
    };
    const close = vi.fn();
    const changed = vi.fn();
    const panel = mountPlayerSettingsPanel(host, shell, {
      store: {
        load: () => ({ masterVolume: 0.9, uiScale: "standard" }),
        save: (settings) => { saved = structuredClone(settings); },
      },
      onRequestClose: close,
      onChange: changed,
    });

    panel.connectAudio(audio);
    panel.open();
    expect(host.textContent).toContain("작전 안내 표시");
    expect(host.textContent).not.toMatch(/학교|훈련|가상 교전/);
    const master = host.querySelector<HTMLInputElement>('[data-setting="masterVolume"]')!;
    master.value = "0.45";
    master.dispatchEvent(new Event("input", { bubbles: true }));
    const scale = host.querySelector<HTMLSelectElement>('[data-setting="uiScale"]')!;
    scale.value = "large";
    scale.dispatchEvent(new Event("change", { bubbles: true }));

    expect(saved).toMatchObject({ masterVolume: 0.45, uiScale: "large" });
    expect(volumes.at(-1)).toBe(0.45);
    expect(shell.dataset.uiScale).toBe("large");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(
      host.querySelector('[data-action="close-settings"]'),
    );
    host.querySelector<HTMLButtonElement>('[data-action="close-settings"]')?.click();
    expect(close).toHaveBeenCalledOnce();
    panel.destroy();
  });
});
