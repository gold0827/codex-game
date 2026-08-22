import { commandButton, node, type CommandDispatcher } from "../dom";
import type { GameViewModel } from "../gameViewModel";

export function renderDebriefView(view: GameViewModel, dispatch: CommandDispatcher): HTMLElement {
  const debrief = view.debrief;
  const success = debrief?.success ?? false;
  const main = node("main", `debrief-screen debrief-${success ? "success" : "retry"}`);
  main.dataset.phase = "debrief";
  main.dataset.backdropId = view.backdrop.id;
  main.dataset.backdropStyle = view.backdrop.style;
  const card = node("section", "debrief-card panel-card");
  card.append(
    node("p", "eyebrow", success ? "작전 종료" : "재정비"),
    node("h2", undefined, success ? "작전 완료" : "작전 재정비"),
    node("p", "debrief-copy", debrief?.copy ?? ""),
    node("p", "lesson-copy", debrief?.lesson ?? ""),
  );
  const objectiveResults = node("section", "debrief-results");
  objectiveResults.dataset.region = "objective-results";
  objectiveResults.append(node("h3", undefined, "목표 판정"));
  const objectiveList = node("ul", "debrief-objective-list");
  debrief?.objectives.forEach((objective) => {
    const item = node(
      "li",
      `debrief-objective ${objective.passed ? "objective-passed" : "objective-failed"}`,
    );
    item.append(
      node("span", undefined, objective.label),
      node("strong", undefined, objective.passed ? "달성" : "미달성"),
    );
    objectiveList.append(item);
  });
  objectiveResults.append(objectiveList);
  card.append(objectiveResults);
  if (debrief?.failures.length) {
    const failureCauses = node("section", "debrief-failures");
    failureCauses.dataset.region = "failure-causes";
    failureCauses.append(node("h3", undefined, "재시도 초점"));
    debrief.failures.forEach((failure) => {
      const item = node("article", "debrief-failure");
      item.append(
        node("strong", undefined, failure.reason),
        node("p", undefined, `관련 목표 · ${failure.objective}`),
      );
      if (failure.role) item.append(node("p", undefined, `관련 역할 · ${failure.role}`));
      failureCauses.append(item);
    });
    card.append(failureCauses);
  }
  if (success) {
    const lessons = node("section", "debrief-lessons");
    lessons.dataset.region = "lesson-choices";
    lessons.append(node("h3", undefined, "남길 교훈 선택"));
    debrief?.lessonChoices.forEach((lesson, index) => {
      const choice = commandButton(
        `${lesson.role} · ${lesson.summary}`,
        "choose-lesson",
        { type: "choose-lesson", lessonId: lesson.id },
        dispatch,
        { cue: "success", focusKey: index === 0 ? "start-attempt" : undefined },
      );
      if (index === 0) choice.classList.add("primary-button");
      lessons.append(choice);
    });
    card.append(lessons);
  } else {
    const retry = commandButton(
      "다시 시도",
      "continue-campaign",
      { type: "continue-campaign" },
      dispatch,
      { cue: "failure", focusKey: "start-attempt" },
    );
    retry.classList.add("primary-button");
    card.append(retry);
  }
  main.append(card);
  return main;
}
