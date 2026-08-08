import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandRoomScenario } from "../../src/scenarios/commandRoomScenario";
import { renderCommandRoom } from "../../src/ui/CommandRoom";

describe("command-room round screen", () => {
  let root: HTMLElement;

  function primaryAction(): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(".primary-action")!;
  }

  function expectHarnessToRemainInert(): void {
    const harness = root.querySelector<HTMLElement>('[data-region="harness"]')!;
    const fieldset = harness.querySelector<HTMLFieldSetElement>("fieldset")!;
    const buttons = [...harness.querySelectorAll<HTMLButtonElement>("button")];
    const onClick = vi.fn();

    expect(harness.textContent).toContain(commandRoomScenario.harness.unavailableLabel);
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.getAttribute("aria-disabled")).toBe("true");
    expect(buttons).toHaveLength(commandRoomScenario.harness.controls.length);
    buttons.forEach((button) => {
      button.addEventListener("click", onClick);
      button.click();
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });
    expect(onClick).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector<HTMLElement>("#app")!;
    renderCommandRoom(root, commandRoomScenario);
  });

  it("renders every required round region", () => {
    const requiredRegions = ["mission", "officers", "timeline", "harness", "outcome"];

    requiredRegions.forEach((region) => {
      const node = root.querySelector(`[data-region="${region}"]`);
      expect(node, `missing ${region} region`).not.toBeNull();
      expect(node?.getAttribute("aria-labelledby")).toBe(`${region}-title`);
    });
  });

  it("identifies the first phase and its scripted information on initial render", () => {
    const firstPhase = commandRoomScenario.timeline.phases[0];
    const displayedText = root.textContent;

    expect(displayedText).toContain("지휘 체계 조정");
    expect(displayedText).not.toContain("하네스 제어");
    expect(displayedText).not.toContain("스크립트");
    expect(displayedText).toContain(commandRoomScenario.identity.round);
    expect(displayedText).toContain(commandRoomScenario.mission.title);
    expect(displayedText).toContain(commandRoomScenario.mission.command);
    expect(displayedText).toContain(firstPhase.officerUpdates[2].report);
    expect(displayedText).toContain(firstPhase.title);
    expect(displayedText).toContain(firstPhase.detail);
    expect(displayedText).toContain("진행 단계 1 / 5");
    expect(displayedText).toContain(commandRoomScenario.harness.controls[2].setting);
    expect(displayedText).toContain(commandRoomScenario.outcome.pendingTitle);
    expect(displayedText).not.toContain(commandRoomScenario.outcome.title);
  });

  it("advances through the complete ordered sequence and resets exactly", () => {
    const initialMarkup = root.innerHTML;

    commandRoomScenario.timeline.phases.forEach((phase, index) => {
      const progress = root.querySelector<HTMLProgressElement>("progress")!;
      const currentStep = root.querySelector<HTMLElement>('[aria-current="step"]')!;
      const action = primaryAction();

      expect(root.querySelector(".current-phase-title")?.textContent).toBe(phase.title);
      expect(root.querySelector(".current-phase-detail")?.textContent).toBe(phase.detail);
      expect(root.querySelector('[data-region="officers"]')?.textContent).toContain(
        phase.officerSummary,
      );
      expect(root.querySelector('[data-region="officers"]')?.textContent).toContain(
        phase.officerUpdates[2].report,
      );
      expect(currentStep.textContent).toContain(phase.title);
      expect(progress.value).toBe(index + 1);
      expect(progress.max).toBe(commandRoomScenario.timeline.phases.length);
      expect(action.textContent).toBe(phase.actionLabel);
      expectHarnessToRemainInert();

      if (index === commandRoomScenario.timeline.phases.length - 1) {
        expect(root.querySelector('[data-region="outcome"]')?.textContent).toContain(
          commandRoomScenario.outcome.title,
        );
        expect(root.querySelector('[data-region="outcome"]')?.textContent).toContain(
          commandRoomScenario.outcome.metric,
        );
      }

      action.click();
      expect(document.activeElement).toBe(primaryAction());
    });

    expect(root.innerHTML).toBe(initialMarkup);
    expect(root.querySelector(".current-phase-title")?.textContent).toBe(
      commandRoomScenario.timeline.phases[0].title,
    );
    expect(root.querySelector('[data-region="outcome"]')?.textContent).not.toContain(
      commandRoomScenario.outcome.title,
    );
  });

  it("exposes progress and the primary action to keyboard and screen-reader users", () => {
    const phaseCount = commandRoomScenario.timeline.phases.length;
    const progress = root.querySelector<HTMLProgressElement>("progress")!;
    const status = root.querySelector<HTMLElement>('[role="status"]')!;
    const action = primaryAction();

    expect(progress.getAttribute("aria-label")).toBe(`${phaseCount}단계 중 1단계`);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(action.type).toBe("button");
    expect(action.disabled).toBe(false);
    expect(action.getAttribute("aria-describedby")).toBe(
      "round-progress current-phase-detail",
    );
    expect(root.querySelectorAll("button:not([disabled])")).toHaveLength(1);

    action.focus();
    expect(document.activeElement).toBe(action);

    action.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(root.querySelector(".current-phase-title")?.textContent).toBe(
      commandRoomScenario.timeline.phases[1].title,
    );
    expect(document.activeElement).toBe(primaryAction());
  });
});
