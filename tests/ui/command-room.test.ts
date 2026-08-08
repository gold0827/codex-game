import { beforeEach, describe, expect, it, vi } from "vitest";

import { commandRoomScenario } from "../../src/scenarios/commandRoomScenario";
import { renderCommandRoom } from "../../src/ui/CommandRoom";

describe("command-room round screen", () => {
  let root: HTMLElement;

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

  it("renders representative content from the single scripted scenario", () => {
    const displayedText = root.textContent;

    expect(displayedText).toContain(commandRoomScenario.identity.round);
    expect(displayedText).toContain(commandRoomScenario.mission.title);
    expect(displayedText).toContain(commandRoomScenario.mission.command);
    expect(displayedText).toContain(commandRoomScenario.officers.entries[2].report);
    expect(displayedText).toContain(commandRoomScenario.timeline.entries[3].title);
    expect(displayedText).toContain(commandRoomScenario.harness.controls[2].setting);
    expect(displayedText).toContain(commandRoomScenario.outcome.title);
    expect(displayedText).toContain(commandRoomScenario.outcome.metric);
  });

  it("keeps every harness control visibly unavailable and inert", () => {
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
  });
});
