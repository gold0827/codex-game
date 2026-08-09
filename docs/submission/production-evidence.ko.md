# 자율군단 지휘학교 제작·심사 증거

- 플레이: [브라우저에서 바로 실행](https://gold0827.github.io/codex-game/)
- 제출 썸네일: [공개 이미지](https://github.com/gold0827/codex-game/blob/main/docs/submission/thumbnail.png)
- 심사 기준: [OpenAI Game Builders Seoul 참가·심사 안내](https://openaigame2026.com/#apply) ([OpenAI Game Builders Seoul, 2026](https://openaigame2026.com/#apply))

## 다섯 심사 기준 대응

- **Playability** — 설치·승인·로그인 없이 공개 URL에서 실행된다. `정보 공유`, `권한 명료도`, `교차 검증`, `피드백 압축`을 예산 안에서 조정하고 실시간 전장을 관찰·개입해 여섯 작전을 완료하는 플레이 흐름이 구현되어 있다.
- **Originality** — 유닛에 명령을 반복 입력하는 대신 자율 장교가 판단할 정보·권한·검증·피드백 조건을 설계한다. 같은 전장을 조건 설계와 제한된 직접 개입으로 풀어내는 지휘 체계가 핵심 플레이 방식이다.
- **Codex Collaboration** — 아래 공개 이력은 목적 설정부터 역할 분해, 구현, 검증, 독립 감사, 병합까지 Codex 역할별 작업을 exact commit 단위로 연결한다.
- **Release Potential** — 브라우저 배포가 완료되었고, 모든 캠페인 장면의 문구·표현·조우 수치·플레이 조정값·진행 구조를 한 화면에서 검증하며 편집하고 저장·가져오기·내보내기할 수 있어 후속 콘텐츠 제작 기반이 있다.
- **Presentation** — 한국어 브리핑, 작전 교범, 실시간 전술 화면, 장교 의도·보고, 결과와 졸업까지 한 흐름으로 제시한다. 공개 썸네일은 출시된 전장에서 파생한 제출용 구성으로, 게임과 같은 시각 언어를 전달한다.

공식 기준은 각각 실제 작동, 독창적인 아이디어와 플레이, 효과적인 Codex 활용, Hive를 통한 서비스 확장 가능성, 게임과 개발 과정의 명확한 발표·시연을 묻는다. 위 대응은 현재 공개 빌드와 저장소 증거의 범위만 기술하며 Hive 연동 완료를 주장하지 않는다.

## 사람과 Codex의 역할

사용자는 게임의 설계 권한과 최종 제품 의도를 제공했다. Codex 역할들은 작업을 독립적으로 검증 가능한 단위로 분해하고, 구현·검증·독립 감사·제출 자료 패키징을 맡았다. 제품 결정은 사람에게, 그 결정을 재현 가능한 변경과 공개 증거로 만드는 실행은 Codex 역할들에 귀속된다.

## 통합 장면 편집기 추적

1. **목적과 위임** — [issue #59](https://github.com/gold0827/codex-game/issues/59)가 모든 캠페인 장면을 편집하는 제작 도구의 목적, 범위, acceptance를 정했고, 구현은 별도 Codex 구현 역할에 위임됐다 ([gold0827/codex-game, 2026](https://github.com/gold0827/codex-game/issues/59)).
2. **구현과 수정** — [PR #60](https://github.com/gold0827/codex-game/pull/60)이 편집기 구현과 검토 중 수정을 한곳에 기록했다. 감사 대상 editor head는 [`94c3e91b2247e0504be126e4671befa1155e0435`](https://github.com/gold0827/codex-game/commit/94c3e91b2247e0504be126e4671befa1155e0435)이다 ([gold0827/codex-game, 2026](https://github.com/gold0827/codex-game/pull/60)).
3. **검증** — PR #60은 production build 완료, `13 files / 182 tests` 통과, `git diff --check` exit `0`을 기록한다.
4. **독립 감사** — 구현·liaison 역할을 맡지 않은 fresh Codex session이 exact commit을 감사했다. 같은 core suite를 다시 실행하고 전체 diff와 편집 필드 coverage를 확인한 뒤 `PASS`를 반환했다.
5. **감사 대응과 병합** — 감사 후 수정은 없었다. secretary가 PR head가 감사한 commit과 동일함을 확인해 병합을 승인했고, GitHub는 PR #60을 [`18e2fbd793c4f472108e675dea812ba0a99abd53`](https://github.com/gold0827/codex-game/commit/18e2fbd793c4f472108e675dea812ba0a99abd53)으로 병합했다.

## Exact commit 코드와 테스트

- UI: [`src/ui/CampaignEditor.ts`](https://github.com/gold0827/codex-game/blob/94c3e91b2247e0504be126e4671befa1155e0435/src/ui/CampaignEditor.ts)
- 통합 화면: [`src/ui/GameWorkbench.ts`](https://github.com/gold0827/codex-game/blob/94c3e91b2247e0504be126e4671befa1155e0435/src/ui/GameWorkbench.ts)
- UI 테스트: [`tests/ui/campaign-editor.test.ts`](https://github.com/gold0827/codex-game/blob/94c3e91b2247e0504be126e4671befa1155e0435/tests/ui/campaign-editor.test.ts)
- 통합 테스트: [`tests/ui/game-workbench.test.ts`](https://github.com/gold0827/codex-game/blob/94c3e91b2247e0504be126e4671befa1155e0435/tests/ui/game-workbench.test.ts)
