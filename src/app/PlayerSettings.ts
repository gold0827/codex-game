import type { GameAudio } from "../ui/GameAudio";

export type PlayerUiScale = "compact" | "standard" | "large";

export type PlayerSettings = Readonly<{
  muted: boolean;
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  reducedMotion: boolean;
  showTutorial: boolean;
  uiScale: PlayerUiScale;
}>;

export type PlayerSettingsStore = Readonly<{
  load: () => unknown;
  save: (settings: PlayerSettings) => void;
}>;

export type PlayerSettingsStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}>;

export type PlayerSettingsPanel = Readonly<{
  read: () => PlayerSettings;
  open: () => void;
  close: () => void;
  connectAudio: (audio: GameAudio | null) => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
}>;

type PlayerSettingsPanelOptions = Readonly<{
  store?: PlayerSettingsStore;
  onRequestClose: () => void;
  onChange: () => void;
  onLoadFailure?: () => void;
}>;

const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  muted: false,
  masterVolume: 1,
  musicVolume: 0.7,
  effectsVolume: 0.8,
  reducedMotion: false,
  showTutorial: true,
  uiScale: "standard",
};

const volume = (candidate: unknown, fallback: number): number =>
  typeof candidate === "number" && Number.isFinite(candidate)
    ? Math.max(0, Math.min(1, candidate))
    : fallback;

export function normalizePlayerSettings(value: unknown): PlayerSettings {
  if (!value || typeof value !== "object") return DEFAULT_PLAYER_SETTINGS;
  const supplied = value as Partial<PlayerSettings>;
  const uiScale = supplied.uiScale === "compact" || supplied.uiScale === "large"
    ? supplied.uiScale
    : "standard";
  return {
    muted: typeof supplied.muted === "boolean" ? supplied.muted : false,
    masterVolume: volume(supplied.masterVolume, 1),
    musicVolume: volume(supplied.musicVolume, 0.7),
    effectsVolume: volume(supplied.effectsVolume, 0.8),
    reducedMotion: typeof supplied.reducedMotion === "boolean"
      ? supplied.reducedMotion
      : false,
    showTutorial: typeof supplied.showTutorial === "boolean"
      ? supplied.showTutorial
      : true,
    uiScale,
  };
}

export function createPlayerSettingsStore(
  storage: PlayerSettingsStorage,
  key: string,
): PlayerSettingsStore {
  return {
    load: () => {
      const source = storage.getItem(key);
      return source === null ? null : JSON.parse(source) as unknown;
    },
    save: (settings) => storage.setItem(key, JSON.stringify(settings)),
  };
}

export function mountPlayerSettingsPanel(
  host: HTMLElement,
  shell: HTMLElement,
  options: PlayerSettingsPanelOptions,
): PlayerSettingsPanel {
  let settings = DEFAULT_PLAYER_SETTINGS;
  let audio: GameAudio | null = null;
  let open = false;
  let destroyed = false;

  try {
    settings = normalizePlayerSettings(options.store?.load());
  } catch {
    options.onLoadFailure?.();
  }

  const root = document.createElement("div");
  root.id = "player-settings";
  root.className = "workbench-settings";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "player-settings-title");
  root.innerHTML = `
    <article class="settings-dialog">
      <header class="settings-header">
        <div>
          <p class="settings-eyebrow">SYSTEM / PLAYER</p>
          <h1 id="player-settings-title">설정</h1>
        </div>
        <button type="button" class="editor-button" data-action="close-settings">설정 닫기</button>
      </header>
      <div class="settings-content">
        <section class="settings-section" aria-labelledby="audio-settings-title">
          <h2 id="audio-settings-title">오디오</h2>
          <label class="settings-toggle-row">
            <span>전체 음소거</span>
            <input type="checkbox" data-setting="muted" />
          </label>
          <label class="settings-range">
            <span>마스터 볼륨 <output data-setting-output="masterVolume"></output></span>
            <input type="range" min="0" max="1" step="0.05" data-setting="masterVolume" />
          </label>
          <label class="settings-range">
            <span>음악 볼륨 <output data-setting-output="musicVolume"></output></span>
            <input type="range" min="0" max="1" step="0.05" data-setting="musicVolume" />
          </label>
          <label class="settings-range">
            <span>효과음 볼륨 <output data-setting-output="effectsVolume"></output></span>
            <input type="range" min="0" max="1" step="0.05" data-setting="effectsVolume" />
          </label>
        </section>
        <section class="settings-section" aria-labelledby="display-settings-title">
          <h2 id="display-settings-title">화면과 접근성</h2>
          <label class="settings-field">
            <span>인터페이스 크기</span>
            <select data-setting="uiScale">
              <option value="compact">작게</option>
              <option value="standard">보통</option>
              <option value="large">크게</option>
            </select>
          </label>
          <label class="settings-toggle-row">
            <span>화면 움직임 줄이기</span>
            <input type="checkbox" data-setting="reducedMotion" />
          </label>
          <label class="settings-toggle-row">
            <span>훈련 안내 표시</span>
            <input type="checkbox" data-setting="showTutorial" />
          </label>
          <button type="button" class="editor-button" data-action="toggle-fullscreen">전체 화면</button>
          <p class="settings-help">점멸과 반복 애니메이션을 줄이고 전장 효과를 정적으로 표시합니다.</p>
        </section>
      </div>
    </article>
  `;
  host.append(root);

  const syncControls = (): void => {
    const muted = root.querySelector<HTMLInputElement>('[data-setting="muted"]');
    const reducedMotion = root.querySelector<HTMLInputElement>('[data-setting="reducedMotion"]');
    const showTutorial = root.querySelector<HTMLInputElement>('[data-setting="showTutorial"]');
    const uiScale = root.querySelector<HTMLSelectElement>('[data-setting="uiScale"]');
    if (muted) muted.checked = settings.muted;
    if (reducedMotion) reducedMotion.checked = settings.reducedMotion;
    if (showTutorial) showTutorial.checked = settings.showTutorial;
    if (uiScale) uiScale.value = settings.uiScale;
    (["masterVolume", "musicVolume", "effectsVolume"] as const).forEach((key) => {
      const input = root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`);
      const output = root.querySelector<HTMLOutputElement>(`[data-setting-output="${key}"]`);
      if (input) input.value = String(settings[key]);
      if (output) output.value = `${Math.round(settings[key] * 100)}%`;
    });
  };

  const apply = (save: boolean, notify: boolean): void => {
    shell.dataset.uiScale = settings.uiScale;
    shell.dataset.reducedMotion = String(settings.reducedMotion);
    shell.dataset.showTutorial = String(settings.showTutorial);
    audio?.setMuted(settings.muted);
    audio?.setMasterVolume?.(settings.masterVolume);
    audio?.setMusicVolume?.(settings.musicVolume);
    audio?.setEffectsVolume?.(settings.effectsVolume);
    syncControls();
    if (save) {
      try {
        options.store?.save(settings);
      } catch {
        // Optional settings persistence cannot interrupt play.
      }
    }
    if (notify) options.onChange();
  };

  const update = (change: Partial<PlayerSettings>): void => {
    settings = normalizePlayerSettings({ ...settings, ...change });
    apply(true, true);
  };

  root.querySelector<HTMLButtonElement>('[data-action="close-settings"]')
    ?.addEventListener("click", options.onRequestClose);
  root.querySelector<HTMLInputElement>('[data-setting="muted"]')
    ?.addEventListener("change", (event) => {
      update({ muted: (event.currentTarget as HTMLInputElement).checked });
    });
  root.querySelector<HTMLInputElement>('[data-setting="reducedMotion"]')
    ?.addEventListener("change", (event) => {
      update({ reducedMotion: (event.currentTarget as HTMLInputElement).checked });
    });
  root.querySelector<HTMLInputElement>('[data-setting="showTutorial"]')
    ?.addEventListener("change", (event) => {
      update({ showTutorial: (event.currentTarget as HTMLInputElement).checked });
    });
  root.querySelector<HTMLSelectElement>('[data-setting="uiScale"]')
    ?.addEventListener("change", (event) => {
      update({ uiScale: (event.currentTarget as HTMLSelectElement).value as PlayerUiScale });
    });
  (["masterVolume", "musicVolume", "effectsVolume"] as const).forEach((key) => {
    root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)
      ?.addEventListener("input", (event) => {
        update({ [key]: Number((event.currentTarget as HTMLInputElement).value) });
      });
  });

  const fullscreenToggle = root.querySelector<HTMLButtonElement>(
    '[data-action="toggle-fullscreen"]',
  )!;
  const syncFullscreen = (): void => {
    const fullscreen = Boolean(document.fullscreenElement);
    fullscreenToggle.textContent = fullscreen ? "전체 화면 종료" : "전체 화면";
    fullscreenToggle.setAttribute("aria-pressed", String(fullscreen));
    fullscreenToggle.disabled = typeof shell.requestFullscreen !== "function";
  };
  fullscreenToggle.addEventListener("click", () => {
    const change = document.fullscreenElement && typeof document.exitFullscreen === "function"
      ? document.exitFullscreen()
      : shell.requestFullscreen?.();
    if (change) void change.catch(() => undefined);
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key === "Escape") {
      options.onRequestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("fullscreenchange", syncFullscreen);
  syncFullscreen();
  apply(false, false);

  return {
    read: () => structuredClone(settings),
    open: () => {
      if (destroyed || open) return;
      open = true;
      root.hidden = false;
      syncControls();
      root.querySelector<HTMLButtonElement>('[data-action="close-settings"]')?.focus();
    },
    close: () => {
      if (destroyed || !open) return;
      open = false;
      root.hidden = true;
    },
    connectAudio: (nextAudio) => {
      audio = nextAudio;
      apply(false, false);
    },
    setMuted: (muted) => {
      if (settings.muted === muted) return;
      settings = { ...settings, muted };
      apply(true, false);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", syncFullscreen);
      root.remove();
    },
  };
}
