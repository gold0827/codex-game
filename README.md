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

## 전장 sprite 생성

장교 atlas는 외부 계정이나 유료 도구 없이 recipe에서 결정론적으로 생성됩니다.

```sh
npm run assets:sprites
npm run check:assets
```

색상, frame 수와 재생 시간은
`scripts/assets/officer-sprites.recipe.json`에서 바꿉니다. runtime은 생성된
`public/assets/visual/sprites/officers/manifest.json`만 읽습니다.

## 게임 루프

- 브리핑 예산 안에서 정보 공유, 권한 명료도, 교차 검증, 피드백 압축을 조정합니다.
- 실시간 전장과 장교의 의도, 위협, 보고를 함께 관찰합니다.
- 작전을 일시정지하거나 0.5배속, 1배속, 2배속으로 진행합니다.
- 제한된 직접 개입을 보고 전달, 예외 권한, 검증 우선에 사용합니다.

캠페인은 브리핑, 실시간 작전, 디브리핑, 재시도, 졸업 순으로 진행됩니다.
`작전 교범`은 도움말을, `장면 편집`은 campaign 문구와 수치 편집을
담당합니다.

## 코드 구조

- `src/domain/operation`, `src/simulation`: 결정론적 작전 규칙과 simulation
- `src/campaign`, `src/scenarios`: campaign model, 검증, 콘텐츠
- `src/application`: 명령 처리와 campaign/operation 진행 상태
- `src/presentation`, `src/ui`, `src/styles`: view model과 브라우저 표현
- `src/app`, `src/platform`, `src/authoring`: 조립, browser adapter, campaign 편집

남은 작업과 개발 이력은 GitHub Issues·Pull Requests에서만 관리합니다.
