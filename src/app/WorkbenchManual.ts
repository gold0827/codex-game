export type GameAudioCredit = Readonly<{
  title: string;
  author: string;
  sourcePageUrl: string;
  license: string;
  licenseUrl: string;
}>;

export type WorkbenchManualVariant = "chuncheon-prototype";

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

const sections = [
  ["1. 지휘 조건 설정", "정보 공유, 권한 명료도, 교차 검증, 피드백 압축을 예산 안에서 조정한다."],
  ["2. 자율 판단 관찰", "각 행동 주체의 정보 수신, 검증, 권한 판단, 행동, 피드백 다섯 단계를 확인한다."],
  ["3. 시간 통제", "일시정지와 0.5배속, 1배속, 2배속으로 난전의 흐름을 관찰한다."],
  ["4. 제한된 편성 개입", "개별 행동 주체를 조작하지 않고 전투 집단의 의도나 하네스 지침만 제한적으로 바꾼다."],
  ["5. 목표 근거 확인", "지연 시간, 후속 방어 준비, 전투력 보존을 근거와 함께 확인한다."],
] as const;

function appendAudioCredits(
  content: HTMLElement,
  audioCredits: readonly GameAudioCredit[],
): void {
  if (audioCredits.length === 0) return;
  const section = document.createElement("section");
  section.className = "audio-credits";
  const heading = document.createElement("h2");
  heading.textContent = "배경음악 출처";
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
  section.append(heading, list);
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
        <div><p class="field-manual-eyebrow">춘천지구 / 1950</p><h1 id="field-manual-title">작전 교범</h1></div>
        <button type="button" class="editor-button" data-action="close-manual">교범 닫기</button>
      </header>
      <div class="field-manual-content">
        <p class="field-manual-lead">춘천지구에서 적의 남하를 늦추고 전투력을 보존하도록 자율지휘 하네스를 설계한다.</p>
        ${sections.map(([title, body]) => `<section><h2>${title}</h2><p>${body}</p></section>`).join("")}
      </div>
    </article>`;
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
