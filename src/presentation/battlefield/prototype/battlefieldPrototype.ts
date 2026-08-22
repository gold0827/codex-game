import type { AutonomousOperationViewModel } from "../../operation/autonomousOperationProjector";
import { renderBattlefieldPrototypeVariantA } from "./variantA";
import { renderBattlefieldPrototypeVariantB } from "./variantB";
import { renderBattlefieldPrototypeVariantC } from "./variantC";

export type BattlefieldPrototypeVariant = "A" | "B" | "C";

export const battlefieldPrototypeNames: Readonly<Record<BattlefieldPrototypeVariant, string>> = {
  A: "평면 전술도",
  B: "원근 전장",
  C: "참모지도",
};

export function currentBattlefieldPrototypeVariant(): BattlefieldPrototypeVariant | null {
  if (!import.meta.env.DEV) return null;
  const variant = new URLSearchParams(globalThis.location?.search ?? "").get("variant");
  return variant === "A" || variant === "B" || variant === "C" ? variant : null;
}

export function renderBattlefieldPrototype(
  variant: BattlefieldPrototypeVariant,
  operation: AutonomousOperationViewModel,
  onInspectActor: (actorId: string) => void,
): HTMLElement {
  if (variant === "B") return renderBattlefieldPrototypeVariantB(operation, onInspectActor);
  if (variant === "C") return renderBattlefieldPrototypeVariantC(operation, onInspectActor);
  return renderBattlefieldPrototypeVariantA(operation, onInspectActor);
}

function prototypeUrl(variant: BattlefieldPrototypeVariant): string {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("variant", variant);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function renderBattlefieldPrototypeSwitcher(
  variant: BattlefieldPrototypeVariant,
): HTMLElement {
  const variants: readonly BattlefieldPrototypeVariant[] = ["A", "B", "C"];
  const currentIndex = variants.indexOf(variant);
  const bar = document.createElement("nav");
  bar.className = "battlefield-prototype-switcher";
  bar.setAttribute("aria-label", "전장 UI 프로토타입 전환");
  const previous = document.createElement("a");
  previous.href = prototypeUrl(variants[(currentIndex + variants.length - 1) % variants.length]!);
  previous.textContent = "←";
  previous.setAttribute("aria-label", "이전 시안");
  const label = document.createElement("strong");
  label.textContent = `${variant} — ${battlefieldPrototypeNames[variant]}`;
  const next = document.createElement("a");
  next.href = prototypeUrl(variants[(currentIndex + 1) % variants.length]!);
  next.textContent = "→";
  next.setAttribute("aria-label", "다음 시안");
  bar.append(previous, label, next);
  return bar;
}

export function installBattlefieldPrototypeKeyboard(
  variant: BattlefieldPrototypeVariant | null,
): () => void {
  if (variant === null) return () => undefined;
  const variants: readonly BattlefieldPrototypeVariant[] = ["A", "B", "C"];
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLElement && target.isContentEditable) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    const index = (variants.indexOf(variant) + variants.length + offset) % variants.length;
    globalThis.location.assign(prototypeUrl(variants[index]!));
  };
  globalThis.addEventListener("keydown", onKeyDown);
  return () => globalThis.removeEventListener("keydown", onKeyDown);
}
