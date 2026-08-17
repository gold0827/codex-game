import type { BattlefieldFrame } from "./battlefieldFrame";
import {
  createCanvasBattlefieldViewport,
  type CanvasBattlefieldViewport,
} from "./internal/canvasViewport";

type FrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type MountedCanvasBattlefield = Readonly<{
  element: HTMLElement;
  viewport: CanvasBattlefieldViewport;
  update: (frame: BattlefieldFrame) => void;
  destroy: () => void;
}>;

export function mountCanvasBattlefield(
  scheduler: FrameScheduler,
): MountedCanvasBattlefield {
  const element = document.createElement("section");
  element.className = "battlefield battlefield-canvas-host";
  element.dataset.region = "battlefield";
  element.setAttribute("aria-label", "실시간 픽셀 전장");
  const viewport = createCanvasBattlefieldViewport(element, { scheduler });
  return {
    element,
    viewport,
    update: viewport.update,
    destroy: viewport.destroy,
  };
}
