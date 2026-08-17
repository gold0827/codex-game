# 자율군단 지휘학교

자율 장교들에게 반복해서 명령하는 대신, 정보·권한·검증·피드백 조건을
설계해 조직이 스스로 위기를 해결하게 만드는 브라우저 오토배틀러입니다.

[배포 게임 실행](https://gold0827.github.io/codex-game/)

[모듈 배선](docs/architecture/dependency-directions.md)

## 실행

```sh
npm ci
npm run dev
```

```sh
npm run check
```

`npm run check`는 asset 산출물 일치, TypeScript build, 전체 test, module 의존
방향 검사를 실행합니다.

## 전장 asset 생성

장교 sprite와 아이소메트릭 map atlas는 외부 계정이나 유료 도구 없이 recipe에서
결정론적으로 생성됩니다.

```sh
npm run assets:sprites
npm run assets:maps
npm run check:assets
```

장교 색상, frame 수와 재생 시간은 `scripts/assets/officer-sprites.recipe.json`,
맵 색상은 `scripts/assets/battlefield-map.recipe.json`에서 바꿉니다. 해인교의 강,
교량과 landmark 배치는 scenario의 `bridgeDefenseMapSkin`이 원본입니다. runtime은
`public/assets/visual/` 아래에 생성된 manifest만 읽으며, asset을 불러오지 못하면
식별 가능한 Canvas 표식으로 폴백합니다.

## 몬테카를로 작전 엔진

작전은 seed 기반 몬테카를로 시뮬레이션이다. 같은 장면·하네스·seed는 같은
사건을 재현하지만, 여러 seed에서는 위협 발견, 장교의 판단, 교전 명중, 피해와
최종 결과가 분포를 이룬다. `move`, `defend`, `verify`, `broadcast`, `support`,
`retreat` 선택은 이동·정보·교전 상태에 직접 반영된다.

플레이어의 하네스와 공간 신호는 결과를 확정하지 않고 성공률, 피해, 위협 차단
분포를 이동시킨다. 무개입과 강한 공간 통제를 같은 seed 집합에서 비교하려면:

```sh
npm run evaluate:operations -- --scene flooded-convoy --start 0 --count 500 --mode paired
```

평가 결과는 실제 행동 분포, 성공/재시도 분포, 피해, 차단 수, 서로 다른 최종
세계 상태 수와 정책 간 delta를 JSON으로 출력한다.

## 게임 루프

- 브리핑 예산 안에서 정보 공유, 권한 명료도, 교차 검증, 피드백 압축을 조정합니다.
- 실시간 전장과 장교의 의도, 위협, 보고를 함께 관찰합니다.
- 장면별 CC0 배경음악을 들으며 `작전 교범`에서 원작자와 출처를 확인합니다.
- `설정`에서 마스터·음악·효과음 볼륨, 훈련 안내, 화면 움직임과 UI 크기를 조정합니다.
- 작전을 일시정지하거나 0.5배속, 1배속, 2배속으로 진행합니다.
- 제한된 직접 개입을 보고 전달, 예외 권한, 검증 우선에 사용합니다.

캠페인은 브리핑, 실시간 작전, 디브리핑, 재시도, 졸업 순으로 진행됩니다.
장면 진행과 장교 교훈은 자동 저장되며, 작전 중 새로고침하면 현재 장면의
브리핑에서 결정론적으로 이어집니다.
`작전 교범`은 도움말을 담당합니다. 프로덕션 화면은 플레이어 도구만 표시하며,
`?editor=1`로 연 개발 화면에서만 campaign 장면 편집을 노출합니다.

## 코드 구조

- `src/domain/operation`, `src/simulation`: seed 재현 가능한 몬테카를로 작전 규칙과 평가
- `src/campaign`, `src/scenarios`: campaign model, 검증, 콘텐츠
- `src/application`: 명령 처리와 campaign/operation 진행 상태
- `src/presentation`, `src/ui`, `src/styles`: view model과 브라우저 표현
- `src/app`, `src/platform`, `src/authoring`: 조립, browser adapter, campaign 편집

남은 작업과 개발 이력은 GitHub Issues·Pull Requests에서만 관리합니다.
