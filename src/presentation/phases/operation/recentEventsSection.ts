import { node } from "../../dom";
import type { GameViewModel } from "../../gameViewModel";

type RecentEventsViewModel = NonNullable<GameViewModel["operation"]>["recentEvents"];

export function renderRecentEventsSection(recentEvents: RecentEventsViewModel): HTMLElement {
  const events = node("section", "operation-event-flow panel-card");
  events.append(node("p", "eyebrow", "최근 사건"), node("h2", undefined, "작전 흐름"));
  const eventList = node("ol", "event-flow-list");
  recentEvents.forEach((event) => {
    const item = node("li", `event-flow-item event-${event.kind}`);
    item.dataset.eventSequence = String(event.sequence);
    item.append(node("time", undefined, event.time), node("strong", undefined, event.summary));
    eventList.append(item);
  });
  if (recentEvents.length === 0) {
    eventList.append(node("li", "event-flow-empty", "작전 사건을 기다리는 중"));
  }
  events.append(eventList);
  return events;
}
