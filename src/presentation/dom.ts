import type { GameCommand } from "../application/game-session";
import type { GameAudioCue } from "../ui/GameAudio";

export type CommandDispatcher = (
  command: GameCommand,
  cue?: GameAudioCue,
  focusKey?: string,
) => void;

export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

export function commandButton(
  label: string,
  action: string,
  command: GameCommand,
  dispatch: CommandDispatcher,
  options: Readonly<{
    disabled?: boolean;
    pressed?: boolean;
    focusKey?: string;
    cue?: GameAudioCue;
  }> = {},
): HTMLButtonElement {
  const result = node("button", "game-button", label);
  const focusKey = options.focusKey ?? action;
  result.type = "button";
  result.dataset.action = action;
  result.dataset.focusKey = focusKey;
  result.disabled = options.disabled ?? false;
  if (options.pressed !== undefined) result.setAttribute("aria-pressed", String(options.pressed));
  result.addEventListener("click", () => dispatch(command, options.cue, focusKey));
  return result;
}
