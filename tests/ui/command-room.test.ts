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

  function tacticalMap(): HTMLElement {
    return root.querySelector<HTMLElement>('[data-region="tactical-map"]')!;
  }

  function mapGraphic(): SVGSVGElement {
    return tacticalMap().querySelector<SVGSVGElement>("svg")!;
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector<HTMLElement>("#app")!;
    renderCommandRoom(root, commandRoomScenario);
  });

  it("renders every required round region", () => {
    const requiredRegions = [
      "tactical-map",
      "mission",
      "officers",
      "timeline",
      "harness",
      "outcome",
    ];

    requiredRegions.forEach((region) => {
      const node = root.querySelector(`[data-region="${region}"]`);
      expect(node, `missing ${region} region`).not.toBeNull();
      expect(node?.getAttribute("aria-labelledby")).toBe(`${region}-title`);
    });
  });

  it("renders a substantial initial tactical graphic in command state", () => {
    const map = tacticalMap();
    const graphic = mapGraphic();

    expect(map.dataset.phaseIndex).toBe("0");
    expect(map.dataset.mapState).toBe("command");
    expect(graphic.getAttribute("viewBox")).toBe("0 0 960 540");
    expect(graphic.querySelectorAll(".map-contour").length).toBeGreaterThanOrEqual(6);
    expect(graphic.querySelector('[data-cue="broken-bridge"]')).not.toBeNull();
    expect(graphic.querySelectorAll(".friendly-marker")).toHaveLength(3);
    expect(graphic.querySelectorAll(".convoy-vehicle")).toHaveLength(3);
    expect(graphic.querySelector('[data-cue="dashed-route"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="triangle-warning"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="hatched-zone"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="failure-stamp"]')).toBeNull();
    expect(map.textContent).toContain("명령 하달");
    expect(graphic.textContent).toContain("수송대 · 출발 대기");
  });

  it("exposes a Korean accessible name and scenario-owned phase description", () => {
    commandRoomScenario.timeline.phases.forEach((phase, index) => {
      const graphic = mapGraphic();
      const title = graphic.querySelector("title");
      const description = graphic.querySelector("desc");

      expect(graphic.getAttribute("role")).toBe("img");
      expect(graphic.getAttribute("aria-labelledby")).toBe(
        "tactical-map-name tactical-map-description",
      );
      expect(title?.textContent).toBe(commandRoomScenario.tacticalMap.accessibleName);
      expect(description?.textContent).toBe(
        commandRoomScenario.tacticalMap.phaseDescriptions[index],
      );
      expect(description?.textContent?.startsWith(`${phase.title}.`)).toBe(true);
      expect(tacticalMap().textContent).toContain(phase.title);

      primaryAction().click();
    });
  });

  it("distinguishes every map phase with shapes, labels, and line styles", () => {
    const expectedStates = ["command", "route", "warning", "stranded", "failed"];

    expectedStates.forEach((state, index) => {
      const graphic = mapGraphic();

      expect(tacticalMap().dataset.mapState).toBe(state);
      expect(tacticalMap().dataset.phaseIndex).toBe(String(index));
      expect(graphic.querySelectorAll(".convoy-vehicle")).toHaveLength(3);

      if (index >= 1) {
        const route = graphic.querySelector('[data-cue="dashed-route"]');
        expect(route).not.toBeNull();
        expect(route?.textContent).toContain("선정 경로 · 북쪽 우회로");
        expect(route?.getAttribute("aria-label")).toContain("점선");
      }
      if (index >= 2) {
        const warning = graphic.querySelector('[data-cue="triangle-warning"]');
        const flood = graphic.querySelector('[data-cue="hatched-zone"]');
        expect(warning?.textContent).toContain("!");
        expect(warning?.getAttribute("aria-label")).toContain("삼각형 느낌표");
        expect(flood?.textContent).toContain("침수 위험 구역");
        expect(flood?.getAttribute("aria-label")).toContain("빗금");
      }
      if (index >= 3) {
        const stranded = graphic.querySelector('[data-cue="stranded-cross"]');
        expect(stranded).not.toBeNull();
        expect(graphic.textContent).toContain("수송 2호차 · 고립");
      }
      if (index === 4) {
        const failure = graphic.querySelector('[data-cue="failure-stamp"]');
        expect(failure?.textContent).toContain("작전 실패");
        expect(failure?.getAttribute("aria-label")).toContain("엑스 표식");
      }

      expectHarnessToRemainInert();
      primaryAction().click();
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
    expect(tacticalMap().dataset.mapState).toBe("command");
    expect(mapGraphic().querySelector('[data-cue="dashed-route"]')).toBeNull();
    expect(mapGraphic().querySelector('[data-cue="triangle-warning"]')).toBeNull();
    expect(mapGraphic().querySelector('[data-cue="hatched-zone"]')).toBeNull();
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
