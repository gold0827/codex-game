# 자율군단 지휘학교

해인교를 지키는 본대와 우회 지원대에 큰 방향만 명령하고, 36명 병사의
실시간 교전과 패주를 지켜보는 브라우저 부대 전투 게임입니다. 명령 전달 지연,
행군 경로, 피로, 사기와 교량을 건너는 수송대가 한 라운드의 승패를 바꿉니다.

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

로컬 크롬에서 기본 두 부대 난전, 기존 훈련 MVP의 전체 흐름, 개발용 오버레이와
Canvas 동작 정책을 검증하려면 다음 명령을 실행합니다. 모든 acceptance는 같은
서버·브라우저 실행 도우미를 재사용합니다.
크롬을 기본 위치가 아닌 곳에 설치했다면 `CHROME_PATH`를 지정합니다.

```sh
npm run test:browser
```

`npm run check`는 asset 산출물 일치, TypeScript build, 전체 test, module 의존
방향 검사를 실행합니다. 고비용 몬테카를로 검증은 로컬 전체 검사에 포함되며,
따로 반복하려면 다음 명령을 사용합니다.

```sh
npm run test:monte-carlo
```

GitHub CI는 제한된 runner에서 발생하는 몬테카를로 timeout을 피하기 위해
`npm run check:ci`로 build, asset, module 의존 방향과 나머지 test를 검사하고,
`npm run test:browser`로 실제 Chrome acceptance도 차단 조건으로 실행합니다.

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

## 두 부대 난전 라운드

기본 브라우저 게임은 본대와 우회 지원대, 적 선봉과 적 증원의 36명을
실시간으로 전투시킨다. 플레이어는 진군, 고수, 집중 공격, 후퇴/휴식과 증원
경로만 정하며, 명령 지연과 피로, 사기, 개별 병사의 제압과 패닉이 패주와 호송
결과를 바꾼다. 주소에 `?seed=원하는-seed`를 붙이면 같은 전투를 재현할 수 있다.
네 기준 전략을 화면 없이 같은 seed로 실행하려면:

```sh
npm run simulate:squad-battle
npm run simulate:squad-battle -- --strategy pincer --seed haein-bridge
```

`pincer`, `frontal`, `early-relief`, `counterattack` 중 하나를 고를 수 있다.
브라우저와 CLI는 같은 operation domain 규칙을 application session을 통해
실행한다. 현재 난전 라운드는 캠페인 저장에는 연결하지 않는다.

## 게임 루프

- 본대에 진군·고수·집중 공격·후퇴/휴식을 명령합니다.
- 북쪽 여울이나 남쪽 농로로 우회 지원대를 투입하고, 투입 뒤 별도로 명령합니다.
- 명령이 도착하는 동안 병사별 교전, 사기, 피로와 생존 인원을 관찰합니다.
- 해인교 내구도를 지키면서 제한 시간 안에 수송대를 통과시킵니다.
- 전투를 일시정지하거나 0.5배속, 1배속, 2배속으로 진행하고 같은 seed로 재시도합니다.

기존 브리핑·하네스 조정·에필로그 MVP는 `?legacy=1`에서 계속 실행됩니다.
개발용 캠페인 편집은 `?legacy=1&editor=1`로 엽니다.

## 코드 구조

- `src/domain/operation`, `src/simulation`: seed 재현 가능한 몬테카를로 작전과 두 부대 난전 규칙, 평가
- `src/campaign`, `src/scenarios`: 캠페인 모델, 검증, 해인교 시제품과 확장용 콘텐츠
- `src/application`: 명령 처리와 campaign/operation 진행 상태
- `src/presentation`, `src/ui`, `src/styles`: view model과 브라우저 표현
- `src/app`, `src/platform`, `src/authoring`: 조립, browser adapter, campaign 편집

남은 작업과 개발 이력은 GitHub Issues·Pull Requests에서만 관리합니다.
