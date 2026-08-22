import { node } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type HarnessViewModel = NonNullable<GameViewModel["operation"]>["harness"];

export function renderHarnessSection(harness: HarnessViewModel): HTMLElement {
  const status = node("section", "operation-status panel-card");
  status.append(
    node("p", "eyebrow", "하네스 상태"),
    node("h2", undefined, harness.consequenceSummary),
  );
  const policies = node("dl", "canonical-policy-list");
  harness.policies.forEach((policy) => {
    policies.append(node("dt", undefined, policy.label), node("dd", undefined, policy.valueLabel));
  });
  status.append(policies);
  const consequences = node("ul", "canonical-consequence-list");
  harness.consequences.forEach((consequence) => {
    consequences.append(node(
      "li",
      undefined,
      `${consequence.label} · ${consequence.axisLabel} · 심각도 ${consequence.severityLabel}`,
    ));
  });
  if (harness.consequences.length === 0) {
    consequences.append(node("li", "empty-copy", "현재 감지된 부작용이 없습니다."));
  }
  status.append(consequences);
  return status;
}
