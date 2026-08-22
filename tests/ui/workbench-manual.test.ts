import { describe, expect, it, vi } from "vitest";

import { createWorkbenchManual } from "../../src/app/WorkbenchManual";

describe("workbench manual module", () => {
  it("explains the canonical autonomous command loop", () => {
    const manual = createWorkbenchManual({
      onRequestClose: () => undefined,
    });

    expect(manual.element.textContent).toContain("정보 수신, 검증, 권한 판단, 행동, 피드백");
    expect(manual.element.textContent).toContain("전투 집단의 의도");
    expect(manual.element.textContent).not.toContain("직접 명령");
  });

  it("owns audio credit DOM and show lifecycle", () => {
    const manual = createWorkbenchManual({
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
      onRequestClose,
    });
    document.body.append(manual.element);

    manual.element.querySelector<HTMLButtonElement>('[data-action="close-manual"]')?.click();
    expect(onRequestClose).toHaveBeenCalledOnce();

    manual.destroy();
    expect(document.body.contains(manual.element)).toBe(false);
  });
});
