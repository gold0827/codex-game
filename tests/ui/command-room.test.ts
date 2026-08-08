import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandRoomScenario } from "../../src/scenarios/commandRoomScenario";
import { renderCommandRoom } from "../../src/ui/CommandRoom";
import { renderTacticalMap } from "../../src/ui/TacticalMap";

const crossCheckSimulation =
  commandRoomScenario.protocolSimulations["cross-check"];

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

  function outcomePanel(): HTMLElement {
    return root.querySelector<HTMLElement>('[data-region="outcome"]')!;
  }

  function advanceToFinalOutcome(
    protocol: "independent" | "cross-check" = "independent",
  ): void {
    const simulation = commandRoomScenario.protocolSimulations[protocol];
    selectProtocol(protocol);
    for (
      let index = 1;
      index < simulation.timeline.phases.length;
      index += 1
    ) {
      primaryAction().click();
    }
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

  it("keeps the pending outcome presentation and live region unchanged", () => {
    const outcome = outcomePanel();

    expect(outcome.dataset.outcomeState).toBe("pending");
    expect(outcome.dataset.outcomeTone).toBeUndefined();
    expect(outcome.classList.contains("outcome-pending")).toBe(true);
    expect(outcome.getAttribute("aria-live")).toBe("polite");
    expect(outcome.querySelector(".outcome-verdict")?.textContent).toBe(
      commandRoomScenario.outcome.pendingVerdict,
    );
    expect(outcome.querySelector(".outcome-title")?.textContent).toBe(
      commandRoomScenario.outcome.pendingTitle,
    );
    expect(outcome.querySelector(".outcome-description")?.textContent).toBe(
      commandRoomScenario.outcome.pendingDescription,
    );
    expect(outcome.querySelector(".outcome-metric")).toBeNull();
  });

  it("renders the scenario-owned failure tone without changing its outcome copy", () => {
    advanceToFinalOutcome();
    const outcome = outcomePanel();

    expect(commandRoomScenario.outcome.tone).toBe("failure");
    expect(outcome.dataset.outcomeState).toBe("final");
    expect(outcome.dataset.outcomeTone).toBe("failure");
    expect(outcome.classList.contains("outcome-failure")).toBe(true);
    expect(outcome.getAttribute("aria-live")).toBe("polite");
    expect(outcome.querySelector(".outcome-verdict")?.textContent).toBe(
      commandRoomScenario.outcome.verdict,
    );
    expect(outcome.querySelector(".outcome-title")?.textContent).toBe(
      commandRoomScenario.outcome.title,
    );
    expect(outcome.querySelector(".outcome-description")?.textContent).toBe(
      commandRoomScenario.outcome.description,
    );
    expect(outcome.querySelector(".metric-value")?.textContent).toBe(
      commandRoomScenario.outcome.metric,
    );
  });

  it("renders the cross-check branch's Korean success outcome and success tone", () => {
    advanceToFinalOutcome("cross-check");
    const outcome = outcomePanel();

    expect(crossCheckSimulation.outcome.tone).toBe("success");
    expect(outcome.dataset.outcomeState).toBe("final");
    expect(outcome.dataset.outcomeTone).toBe("success");
    expect(outcome.classList.contains("outcome-success")).toBe(true);
    expect(outcome.getAttribute("aria-live")).toBe("polite");
    expect(outcome.querySelector(".outcome-verdict")?.textContent).toBe("작전 성공");
    expect(outcome.querySelector(".outcome-title")?.textContent).toBe(
      crossCheckSimulation.outcome.title,
    );
    expect(outcome.querySelector(".outcome-description")?.textContent).toBe(
      crossCheckSimulation.outcome.description,
    );
    expect(outcome.querySelector(".outcome-metric .field-label")?.textContent).toBe(
      crossCheckSimulation.outcome.metricLabel,
    );
    expect(outcome.querySelector(".metric-value")?.textContent).toBe(
      crossCheckSimulation.outcome.metric,
    );
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
      crossCheckSimulation.timeline.phases[1].title,
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

  it("keeps the independent simulation identical to the existing failure scenario", () => {
    const independent = commandRoomScenario.protocolSimulations.independent;

    expect(independent.timeline).toBe(commandRoomScenario.timeline);
    expect(independent.tacticalMap).toBe(commandRoomScenario.tacticalMap);
    expect(independent.outcome).toBe(commandRoomScenario.outcome);
    expect(independent.tacticalMap.phases.map(({ state }) => state)).toEqual([
      "command",
      "route",
      "warning",
      "stranded",
      "failed",
    ]);
    expect(independent.outcome.tone).toBe("failure");
    expect(independent.outcome.metric).toBe("38 / 100");
  });

  it("runs the five ordered cross-check phases with the selected protocol locked", () => {
    expect(crossCheckSimulation.timeline.phases).toHaveLength(5);
    expect(crossCheckSimulation.tacticalMap.phases.map(({ state }) => state)).toEqual([
      "command",
      "command",
      "command",
      "rerouted",
      "secured",
    ]);
    expect(crossCheckSimulation.timeline.phases[0]).toBe(
      commandRoomScenario.timeline.phases[0],
    );
    expect(crossCheckSimulation.tacticalMap.phases[0]).toBe(
      commandRoomScenario.tacticalMap.phases[0],
    );
    expect(crossCheckSimulation.timeline.phases[1].detail).toContain("출발 전");
    expect(crossCheckSimulation.timeline.phases[1].detail).toContain("충돌");
    expect(crossCheckSimulation.timeline.phases[2].detail).toContain("경고");
    expect(crossCheckSimulation.timeline.phases[2].detail).toContain("출발이 보류");
    expect(crossCheckSimulation.timeline.phases[3].title).toContain(
      "남쪽 임시 도로",
    );
    expect(crossCheckSimulation.timeline.phases[4].detail).toContain(
      "수송 차량 세 대",
    );

    selectProtocol("cross-check");
    crossCheckSimulation.timeline.phases.forEach((phase, index) => {
      expect(root.querySelector(".current-phase-title")?.textContent).toBe(phase.title);
      expect(root.querySelector(".current-phase-detail")?.textContent).toBe(
        phase.detail,
      );
      expect(tacticalMap().dataset.mapState).toBe(
        crossCheckSimulation.tacticalMap.phases[index].state,
      );
      expect(mapGraphic().querySelector("desc")?.textContent).toBe(
        crossCheckSimulation.tacticalMap.phases[index].description,
      );
      phase.officerUpdates.forEach(({ report }) => {
        expect(root.querySelector('[data-region="officers"]')?.textContent).toContain(
          report,
        );
      });

      if (index > 0) {
        expect(
          root.querySelector<HTMLFieldSetElement>(".protocol-selector")?.disabled,
        ).toBe(true);
        expect(protocolInput("cross-check").checked).toBe(true);
        expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
          "고정됨: 교차 확인",
        );
      }

      if (index < crossCheckSimulation.timeline.phases.length - 1) {
        primaryAction().click();
      }
    });

    expect(outcomePanel().dataset.outcomeTone).toBe("success");
    expect(outcomePanel().textContent).toContain(crossCheckSimulation.outcome.metric);
    expect(Number.parseInt(crossCheckSimulation.outcome.metric, 10)).toBeGreaterThan(
      Number.parseInt(commandRoomScenario.outcome.metric, 10),
    );
  });

  it("supports independent failure, exact reset, then cross-check success in one session", () => {
    const initialMarkup = root.innerHTML;

    advanceToFinalOutcome("independent");
    expect(tacticalMap().dataset.mapState).toBe("failed");
    expect(outcomePanel().dataset.outcomeTone).toBe("failure");
    expect(outcomePanel().textContent).toContain(commandRoomScenario.outcome.metric);

    primaryAction().click();
    expect(root.innerHTML).toBe(initialMarkup);
    expect(protocolInput("independent").checked).toBe(false);
    expect(protocolInput("cross-check").checked).toBe(false);
    expect(primaryAction().disabled).toBe(true);

    advanceToFinalOutcome("cross-check");
    expect(tacticalMap().dataset.mapState).toBe("secured");
    expect(outcomePanel().dataset.outcomeTone).toBe("success");
    expect(outcomePanel().textContent).toContain(crossCheckSimulation.outcome.metric);
    expect(protocolInput("cross-check").checked).toBe(true);
    expect(root.querySelector("#command-protocol-status")?.textContent).toBe(
      "고정됨: 교차 확인",
    );
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

  it("renders a code-native pixel battlefield as the first command-grid surface", () => {
    const grid = root.querySelector<HTMLElement>(".command-grid")!;
    const map = tacticalMap();
    const graphic = mapGraphic();
    const landmarks = [
      ...graphic.querySelectorAll<SVGGElement>("[data-landmark]"),
    ];
    const vehicles = [...graphic.querySelectorAll<SVGGElement>(".convoy-vehicle")];

    expect(grid.firstElementChild).toBe(map);
    expect(graphic.dataset.visualLanguage).toBe("pixel-battlefield");
    expect(graphic.dataset.gridStep).toBe("12");
    expect(graphic.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(graphic.querySelector('[data-map-layer="terrain"]')).not.toBeNull();
    expect(graphic.querySelector("#minor-grid")).not.toBeNull();
    expect(graphic.querySelector("#terrain-dither")).not.toBeNull();
    expect(graphic.querySelector(".terrain-base")).not.toBeNull();
    expect(graphic.querySelector(".river-water")).not.toBeNull();
    expect(graphic.querySelector('[data-cue="broken-bridge"]')).not.toBeNull();
    expect(landmarks.map(({ dataset }) => dataset.landmark)).toEqual([
      "headquarters",
      "intelligence",
      "objective",
    ]);
    expect(graphic.querySelectorAll("circle, ellipse")).toHaveLength(0);
    expect(vehicles).toHaveLength(3);
    vehicles.forEach((vehicle) => {
      expect(vehicle.querySelectorAll(".vehicle-wheel")).toHaveLength(4);
      expect(vehicle.querySelector(".vehicle-window")).not.toBeNull();
    });
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
        commandRoomScenario.tacticalMap.phases[index].description,
      );
      expect(description?.textContent?.startsWith(`${phase.title}.`)).toBe(true);
      expect(tacticalMap().textContent).toContain(phase.title);

      primaryAction().click();
    });
  });

  it("distinguishes every map phase with shapes, labels, and line styles", () => {
    const expectedStates = ["command", "route", "warning", "stranded", "failed"] as const;
    selectProtocol("independent");

    expect(commandRoomScenario.tacticalMap.phases.map(({ state }) => state)).toEqual(
      expectedStates,
    );
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

  it("renders the scenario-owned state instead of deriving it from phase position", () => {
    const scenario = structuredClone(commandRoomScenario);
    scenario.tacticalMap.phases[0].state = "failed";
    root.replaceChildren(renderTacticalMap(scenario, 0));

    const map = tacticalMap();
    const graphic = mapGraphic();

    expect(map.dataset.phaseIndex).toBe("0");
    expect(map.dataset.mapState).toBe("failed");
    expect(graphic.querySelector('[data-cue="dashed-route"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="triangle-warning"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="hatched-zone"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="stranded-cross"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="failure-stamp"]')).not.toBeNull();
  });

  it("renders the cross-check rerouted phase with an intact convoy on a distinct safe route", () => {
    const scenario = structuredClone(commandRoomScenario);
    const reroutedPhase = crossCheckSimulation.tacticalMap.phases[3];
    scenario.tacticalMap.phases[0] = reroutedPhase;
    root.replaceChildren(renderTacticalMap(scenario, 0));

    const map = tacticalMap();
    const graphic = mapGraphic();
    const safeRoute = graphic.querySelector('[data-cue="solid-safe-route"]');
    const warning = graphic.querySelector('[data-cue="triangle-warning"]');
    const flood = graphic.querySelector('[data-cue="hatched-zone"]');
    const vehicles = [...graphic.querySelectorAll<SVGGElement>(".convoy-moving")];

    expect(map.dataset.mapState).toBe("rerouted");
    expect(graphic.querySelector("desc")?.textContent).toBe(
      reroutedPhase.description,
    );
    expect(safeRoute?.textContent).toContain("안전 경로 · 남쪽 임시 도로");
    expect(safeRoute?.getAttribute("aria-label")).toContain("실선");
    expect(safeRoute?.getAttribute("aria-label")).toContain("마름모 경유점");
    expect(safeRoute?.querySelectorAll('[data-cue="diamond-waypoints"] rect')).toHaveLength(
      3,
    );
    expect(graphic.querySelector('[data-cue="dashed-route"]')).toBeNull();
    expect(warning?.getAttribute("aria-label")).toContain("삼각형 느낌표");
    expect(flood?.getAttribute("aria-label")).toContain("빗금과 경계선");
    expect(vehicles).toHaveLength(3);
    expect(
      vehicles.every((vehicle) => vehicle.getAttribute("aria-label")?.includes("이동 중")),
    ).toBe(true);
    expect(graphic.textContent).toContain("수송대 · 이동 중");
    expect(graphic.querySelector('[data-cue="stranded-cross"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="failure-stamp"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="success-badge"]')).toBeNull();
    expect(map.textContent).toContain("실선과 마름모: 안전 경로");
  });

  it("renders the cross-check secured phase with the intact convoy and Korean success cue", () => {
    const scenario = structuredClone(commandRoomScenario);
    const securedPhase = crossCheckSimulation.tacticalMap.phases[4];
    scenario.tacticalMap.phases[0] = securedPhase;
    root.replaceChildren(renderTacticalMap(scenario, 0));

    const map = tacticalMap();
    const graphic = mapGraphic();
    const success = graphic.querySelector('[data-cue="success-badge"]');
    const vehicles = [...graphic.querySelectorAll<SVGGElement>(".convoy-secured")];

    expect(map.dataset.mapState).toBe("secured");
    expect(graphic.querySelector("desc")?.textContent).toBe(
      securedPhase.description,
    );
    expect(graphic.querySelector('[data-cue="solid-safe-route"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="triangle-warning"]')).not.toBeNull();
    expect(graphic.querySelector('[data-cue="hatched-zone"]')).not.toBeNull();
    expect(vehicles).toHaveLength(3);
    expect(
      vehicles.every((vehicle) => vehicle.getAttribute("aria-label")?.includes("목표 도착")),
    ).toBe(true);
    expect(graphic.textContent).toContain("수송대 · 목표 도착");
    expect(success?.textContent).toContain("목표 확보");
    expect(success?.getAttribute("aria-label")).toContain("원형 방패");
    expect(success?.getAttribute("aria-label")).toContain("확인 표식");
    expect(graphic.querySelector('[data-cue="stranded-cross"]')).toBeNull();
    expect(graphic.querySelector('[data-cue="failure-stamp"]')).toBeNull();
    expect(graphic.querySelector(".convoy-label-critical")).toBeNull();
    expect(map.textContent).toContain("원형 확인 표식: 목표 확보");
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

    crossCheckSimulation.timeline.phases.forEach((phase, index) => {
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
      expect(progress.max).toBe(crossCheckSimulation.timeline.phases.length);
      expect(action.textContent).toBe(phase.actionLabel);
      expectHarnessToRemainInert();

      if (index === crossCheckSimulation.timeline.phases.length - 1) {
        expect(root.querySelector('[data-region="outcome"]')?.textContent).toContain(
          crossCheckSimulation.outcome.title,
        );
        expect(root.querySelector('[data-region="outcome"]')?.textContent).toContain(
          crossCheckSimulation.outcome.metric,
        );
      }

      action.click();
      if (index < crossCheckSimulation.timeline.phases.length - 1) {
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
