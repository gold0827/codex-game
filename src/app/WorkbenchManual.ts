export type GameAudioCredit = Readonly<{
  title: string;
  author: string;
  sourcePageUrl: string;
  license: string;
  licenseUrl: string;
}>;

export type WorkbenchManualVariant = "complete-campaign" | "bridge-prototype";

export type WorkbenchManual = Readonly<{
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}>;

type WorkbenchManualOptions = Readonly<{
  variant: WorkbenchManualVariant;
  audioCredits?: readonly GameAudioCredit[];
  onRequestClose: () => void;
}>;

const manualCopy = {
  "bridge-prototype": {
    lead: "해인교에서 한 번의 공간 신호가 자율 장교의 판단과 결과를 어떻게 바꾸는지 확인한다.",
    sections: [
      ["1. 브리핑에서 지휘 조건 설정", "정보 공유, 권한 명료도, 교차 검증, 피드백 압축을 예산 안에서 조정하고 작전을 시작한다."],
      ["2. 시간을 멈추고 판단 근거 확인", "안내에 따라 작전을 일시정지하고 한확인 대위를 선택해 실제 포격과 오보를 구분하는 근거를 살핀다."],
      ["3. 해인교에 공간 신호 발행", "전장에서 목표 타일을 선택한 뒤 조사·방어·회피 종류와 강도를 정한다. 강도만큼 남은 개입 자원을 사용한다."],
      ["4. 재개 후 자율 작전 관찰", "0.5배속, 1배속, 2배속으로 시간을 조절하며 장교의 판단, 위협 차단, 교량과 민간인 목표를 함께 확인한다."],
      ["5. 결과와 재정비", "성공하면 교훈을 선택해 검증을 마친다. 실패하면 한국어 실패 원인을 확인하고 같은 해인교 작전을 다시 시도한다."],
    ],
  },
  "complete-campaign": {
    lead: "명령을 반복하는 대신 자율 장교가 판단할 조건을 설계한다.",
    sections: [
      ["1. 브리핑에서 지휘 조건 설정", "정보 도달, 권한 명료성, 검증 깊이, 피드백 압축을 조정한다. 배정 자원 안에서 설정을 마치고 작전을 시작한다."],
      ["2. 자율 작전 관찰", "장교들은 설정된 조건에 따라 스스로 이동하고 보고한다. 전장, 장교의 의도, 위험 신호, 수신 보고를 함께 살핀다."],
      ["3. 시간 통제", "일시정지로 판단할 시간을 확보하고 0.5배속, 1배속, 2배속으로 흐름을 조절한다. 교범을 열면 진행 중인 작전도 멈춘다."],
      ["4. 제한된 직접 개입", "보고 전달, 권한 승인, 검증 우선은 직접 개입 횟수를 사용한다. 남은 횟수를 확인하고 자율성을 보완할 때만 개입한다."],
      ["5. 여섯 작전과 졸업", "통신학교 튜토리얼부터 최종작전까지 여섯 작전을 순서대로 완료한다. 실패하면 같은 작전을 재정비하고, 모두 통과하면 졸업 장면에 도착한다."],
      ["별도 도구 · 장면 편집", "게임 밖의 장면 편집에서 모든 장면의 문구, 연출, 수치와 사건 데이터를 확인하고 바꿀 수 있다. 변경 사항은 캠페인을 재시작할 때 적용된다."],
    ],
  },
} as const satisfies Record<WorkbenchManualVariant, Readonly<{
  lead: string;
  sections: readonly (readonly [title: string, body: string])[];
}>>;

function manualContent(variant: WorkbenchManualVariant): string {
  const copy = manualCopy[variant];
  const sections = copy.sections.map(([title, body]) => `
    <section>
      <h2>${title}</h2>
      <p>${body}</p>
    </section>
  `).join("");
  return `<p class="field-manual-lead">${copy.lead}</p>${sections}`;
}

function appendAudioCredits(
  content: HTMLElement,
  audioCredits: readonly GameAudioCredit[],
): void {
  if (audioCredits.length === 0) return;
  const section = document.createElement("section");
  section.className = "audio-credits";
  const heading = document.createElement("h2");
  heading.textContent = "배경음악 출처";
  const summary = document.createElement("p");
  summary.textContent = "아래 음원은 원작자가 CC0 1.0으로 공개했습니다.";
  const list = document.createElement("ul");
  list.className = "audio-credit-list";
  audioCredits.forEach((credit) => {
    const item = document.createElement("li");
    const source = document.createElement("a");
    source.href = credit.sourcePageUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = `${credit.title} — ${credit.author}`;
    const license = document.createElement("a");
    license.href = credit.licenseUrl;
    license.target = "_blank";
    license.rel = "noreferrer";
    license.textContent = credit.license;
    item.append(source, document.createTextNode(" · "), license);
    list.append(item);
  });
  section.append(heading, summary, list);
  content.append(section);
}

export function createWorkbenchManual(
  options: WorkbenchManualOptions,
): WorkbenchManual {
  const element = document.createElement("div");
  element.id = "field-manual";
  element.className = "workbench-manual";
  element.hidden = true;
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-modal", "true");
  element.setAttribute("aria-labelledby", "field-manual-title");
  element.innerHTML = `
    <article class="field-manual">
      <header class="field-manual-header">
        <div>
          <p class="field-manual-eyebrow">현장 작전 / 01</p>
          <h1 id="field-manual-title">작전 교범</h1>
        </div>
        <button type="button" class="editor-button" data-action="close-manual">교범 닫기</button>
      </header>
      <div class="field-manual-content">${manualContent(options.variant)}</div>
    </article>
  `;
  const content = element.querySelector<HTMLElement>(".field-manual-content");
  const close = element.querySelector<HTMLButtonElement>('[data-action="close-manual"]');
  if (!content || !close) throw new Error("Workbench manual DOM is incomplete.");
  appendAudioCredits(content, options.audioCredits ?? []);
  close.addEventListener("click", options.onRequestClose);

  return {
    element,
    show: () => {
      element.hidden = false;
      content.scrollTop = 0;
      close.focus();
    },
    hide: () => { element.hidden = true; },
    destroy: () => {
      close.removeEventListener("click", options.onRequestClose);
      element.remove();
    },
  };
}
