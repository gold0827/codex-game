import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandRoomScenario } from "../../src/scenarios/commandRoomScenario";
import { renderCommandRoom } from "../../src/ui/CommandRoom";

describe("command-room round screen", () => {
  let root: HTMLElement;

  function primaryAction(): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(".primary-action")!;
  }

  function protocolInput(value: "independent" | "cross-check"): HTMLInputElement {
    return root.querySelector<HTMLInputElement>(
      `input[name="command-protocol"][value="${value}"]`,
    )!;
  }

  function selectProtocol(
    value: "independent" | "cross-check",
  ): HTMLInputElement {
    protocolInput(value).click();
    return protocolInput(value);
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

  it("gates the first action behind exactly two unselected Korean protocols", () => {
    const selector = root.querySelector<HTMLFieldSetElement>(".protocol-selector")!;
    const choices = [...selector.querySelectorAll<HTMLElement>(".protocol-choice")];
    const inputs = [...selector.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

    expect(choices).toHaveLength(2);
    expect(inputs).toHaveLength(2);
    expect(choices[0].textContent).toContain("각자 판단");
    expect(choices[0].textContent).toContain(
      "장교들이 임무를 받고 각자 판단해 독립적으로 행동합니다.",
    );
    expect(choices[1].textContent).toContain("교차 확인");
    expect(choices[1].textContent).toContain(
      "이동 전 정찰대와 수송대가 같은 경로 정보를 확인합니다.",
    );
    expect(inputs.every((input) => !input.checked)).toBe(true);
    expect(selector.disabled).toBe(false);
    expect(selector.dataset.locked).toBe("false");
    expect(selector.querySelector('[data-selected="true"]')).toBeNull();
    expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
      "선택되지 않음",
    );
    expect(primaryAction().disabled).toBe(true);
    expect(primaryAction().getAttribute("aria-disabled")).toBe("true");
  });

  it.each([
    [
      "independent",
      "각자 판단",
      "장교들이 임무를 받고 각자 판단해 독립적으로 행동합니다.",
    ],
    [
      "cross-check",
      "교차 확인",
      "이동 전 정찰대와 수송대가 같은 경로 정보를 확인합니다.",
    ],
  ] as const)(
    "selects %s visibly and accessibly and enables the first action",
    (value, label, description) => {
      const input = selectProtocol(value);
      const choice = input.closest<HTMLLabelElement>("label")!;
      const descriptionId = input.getAttribute("aria-describedby")!;

      expect(input.checked).toBe(true);
      expect(choice.htmlFor).toBe(input.id);
      expect(choice.dataset.selected).toBe("true");
      expect(choice.textContent).toContain(label);
      expect(root.querySelector(`#${descriptionId}`)?.textContent).toBe(description);
      expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
        `선택됨: ${label}`,
      );
      expect(primaryAction().disabled).toBe(false);
      expect(primaryAction().getAttribute("aria-disabled")).toBe("false");
      expect(document.activeElement).toBe(input);
    },
  );

  it("allows switching before start and locks the final selection on first action", () => {
    selectProtocol("independent");
    const selected = selectProtocol("cross-check");

    expect(selected.checked).toBe(true);
    expect(protocolInput("independent").checked).toBe(false);

    primaryAction().click();

    const selector = root.querySelector<HTMLFieldSetElement>(".protocol-selector")!;
    expect(selector.disabled).toBe(true);
    expect(selector.dataset.locked).toBe("true");
    expect(selector.getAttribute("aria-disabled")).toBe("true");
    expect(protocolInput("cross-check").checked).toBe(true);
    expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
      "고정됨: 교차 확인",
    );
    expect(root.querySelector(".current-phase-title")?.textContent).toBe(
      commandRoomScenario.timeline.phases[1].title,
    );

    protocolInput("independent").click();
    expect(protocolInput("cross-check").checked).toBe(true);
    expect(protocolInput("independent").checked).toBe(false);
  });

  it("keeps the locked protocol visible through every remaining phase and outcome", () => {
    selectProtocol("independent");
    primaryAction().click();

    for (let index = 1; index < commandRoomScenario.timeline.phases.length; index += 1) {
      const selector = root.querySelector<HTMLFieldSetElement>(".protocol-selector")!;
      const selectedChoice = protocolInput("independent").closest<HTMLElement>(
        ".protocol-choice",
      )!;

      expect(selector.disabled).toBe(true);
      expect(protocolInput("independent").checked).toBe(true);
      expect(selectedChoice.dataset.selected).toBe("true");
      expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
        "고정됨: 각자 판단",
      );
      expect(root.querySelector(".current-phase-title")?.textContent).toBe(
        commandRoomScenario.timeline.phases[index].title,
      );

      if (index === commandRoomScenario.timeline.phases.length - 1) {
        expect(root.querySelector('[data-region="outcome"]')?.textContent).toContain(
          commandRoomScenario.outcome.title,
        );
      } else {
        primaryAction().click();
      }
    }
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
    selectProtocol("independent");

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
    selectProtocol("independent");

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
    selectProtocol("cross-check");

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
      if (index < commandRoomScenario.timeline.phases.length - 1) {
        expect(document.activeElement).toBe(primaryAction());
      }
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
    expect(protocolInput("independent").checked).toBe(false);
    expect(protocolInput("cross-check").checked).toBe(false);
    expect(root.querySelector<HTMLFieldSetElement>(".protocol-selector")?.disabled).toBe(
      false,
    );
    expect(primaryAction().disabled).toBe(true);
  });

  it("exposes progress and the primary action to keyboard and screen-reader users", () => {
    const phaseCount = commandRoomScenario.timeline.phases.length;
    const progress = root.querySelector<HTMLProgressElement>("progress")!;
    const status = root.querySelector<HTMLElement>('.current-phase[role="status"]')!;
    let action = primaryAction();

    expect(progress.getAttribute("aria-label")).toBe(`${phaseCount}단계 중 1단계`);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(action.type).toBe("button");
    expect(action.disabled).toBe(true);
    expect(action.getAttribute("aria-disabled")).toBe("true");
    expect(action.getAttribute("aria-describedby")).toBe(
      "command-protocol-status round-progress current-phase-detail",
    );

    selectProtocol("independent");
    action = primaryAction();
    expect(action.disabled).toBe(false);
    expect(action.getAttribute("aria-disabled")).toBe("false");
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
