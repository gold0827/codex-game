import { describe, expect, it, vi } from "vitest";

import { createWorkbenchManual } from "../../src/app/WorkbenchManual";

describe("workbench manual module", () => {
  it("keeps complete and bridge copy behind the same interface", () => {
    const complete = createWorkbenchManual({
      variant: "complete-campaign",
      onRequestClose: () => undefined,
    });
    const bridge = createWorkbenchManual({
      variant: "bridge-prototype",
      onRequestClose: () => undefined,
    });

    expect(complete.element.textContent).toContain("여섯 작전");
    expect(bridge.element.textContent).toContain("해인교");
    expect(bridge.element.textContent).toContain("공간 신호");
    expect(bridge.element.textContent).not.toContain("장면 편집");
  });

  it("owns audio credit DOM and show lifecycle", () => {
    const manual = createWorkbenchManual({
      variant: "complete-campaign",
      audioCredits: [{
        title: "행진곡",
        author: "작곡가",
        sourcePageUrl: "https://example.com/source",
        license: "CC0 1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      }],
      onRequestClose: () => undefined,
    });
    document.body.append(manual.element);
    const content = manual.element.querySelector<HTMLElement>(".field-manual-content")!;
    content.scrollTop = 120;

    manual.show();

    expect(manual.element.hidden).toBe(false);
    expect(content.scrollTop).toBe(0);
    expect(document.activeElement).toBe(
      manual.element.querySelector('[data-action="close-manual"]'),
    );
    expect(manual.element.querySelector(".audio-credits")?.textContent).toContain("행진곡");
  });

  it("routes close requests and removes its DOM on destroy", () => {
    const onRequestClose = vi.fn();
    const manual = createWorkbenchManual({
      variant: "complete-campaign",
      onRequestClose,
    });
    document.body.append(manual.element);

    manual.element.querySelector<HTMLButtonElement>('[data-action="close-manual"]')?.click();
    expect(onRequestClose).toHaveBeenCalledOnce();

    manual.destroy();
    expect(document.body.contains(manual.element)).toBe(false);
  });
});
