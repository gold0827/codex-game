# 현재 화면과 모듈 배선

이 문서는 현재 구현의 화면, 명령 흐름, module 책임과 허용 의존을 설명하는
단일 기준이다. 과거 구조나 이동 이력은 기록하지 않는다. 구현과 설명이
어긋나면 `npm run check`와 아래 public interface를 기준으로 함께 수정한다.

## 화면 와이어프레임

기본 두 부대 난전 화면은 다음 순서로 조립된다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 해인교 두 부대 난전                              │ 작전 시간·전투 상태        │
├──────────────────────────────────────────────────────────────────────────────┤
│ 일시정지·재개 │ 0.5배·1배·2배 │ 같은 seed로 재시작                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ 해인교 내구도                         │ 수송대 통과                         │
├────────────────────────────────────────────────┬─────────────────────────────┤
│                                                │ 본대·지원대                │
│             36명 실시간 Canvas 전장            │ 적 선봉·적 증원            │
│                                                │ 생존·사기·피로·현재 명령   │
├────────────────────────────────────────────────┴─────────────────────────────┤
│ 본대 명령 │ 지원대 투입 경로 │ 지원대 명령                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ 최근 전황                                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

기존 브리핑, 디브리핑, 졸업 화면은 `?legacy=1`에서 같은 header와 shell 안의
각 phase view를 교체한다.
`작전 교범`, `설정`, 개발용 `장면 편집`은 workbench shell에 놓이며
`WorkbenchOverlays`가 활성 overlay와 pause ownership을 단독 소유한다. 세 화면은
동시에 열리지 않고, 진행 중인 작전에서 하나를 열면 작전을 멈추며 닫으면 필요한
경우 재개한다. 프로덕션 기본 화면에서는 교범과 설정만 표시한다.

## 실행 배선

```text
src/main.ts
├─ mountProductionSquadBattle                  기본 app composition
│  ├─ bridgeDefenseMap                         content
│  ├─ browser frame scheduler                  platform
│  ├─ SquadBattleSession                       application interface
│  │  └─ operationEngine.createSquadBattle     domain/operation interface
│  │     └─ squadBattleRuntime → encounters    부대 규칙 → 병사 교전
│  └─ SquadBattleApp                           presentation mount adapter
│     ├─ projectSquadBattleFrame               snapshot → BattlefieldFrame
│     └─ Canvas battlefield + DOM controls
└─ ?legacy=1 → mountProductionGame             기존 app composition
   ├─ CC0 music catalog                        app asset composition
   ├─ browser frame/audio/localStorage adapter platform
   └─ mountGameWorkbench                       app
      ├─ WorkbenchOverlays                     overlay 상호 배제 + pause ownership
      │  └─ manual/settings/editor adapter     show/hide/focus
      ├─ WorkbenchManual                       교범 문구 + DOM + 음원 출처
      ├─ PlayerSettingsPanel                   app settings interface
      │  ├─ PlayerSettingsStore                browser/in-memory adapter seam
      │  └─ GameAudio                          volume + mute interface
      ├─ CampaignCheckpoint                    app persistence interface
      │  └─ CampaignCheckpointStore            browser/in-memory adapter seam
      ├─ CampaignDocument + CampaignWorkshop   authoring
      │  └─ CampaignRepository                 domain/campaign seam
      ├─ GameSession                           application interface
      │  ├─ CampaignRun                        campaign progress + lesson memory
      │  └─ CampaignOperation                  launch/result adapter
      │     └─ operationEngine                 domain/operation interface
      │        ├─ timeline
      │        ├─ signals + limited beliefs
      │        ├─ decisions
      │        ├─ threats + movement
      │        └─ outcome + operation events
      └─ GameApp                               presentation mount adapter
         ├─ GameEffects                        frame/focus/audio owner
         ├─ projectGameViewModel               snapshot projector
         └─ phase views → DOM
```

설정 동작은 workbench에 흩어지지 않고 다음 작은 interface 뒤에 있다.

```text
설정 button
  ─→ GameWorkbench: settings adapter 조립
  ─→ WorkbenchOverlays: 상호 배제 + 작전 pause/resume
  ─→ PlayerSettingsPanel: 실제 panel show/hide/focus
       ├─ read/open/close/connectAudio/setMuted/destroy
       ├─ 값 정규화 + control/focus/fullscreen + shell 적용
       └─ PlayerSettingsStore ─→ browser localStorage
```

`GameWorkbench`는 설정 필드, JSON 형식, audio volume 계산을 알지 않는다.
테스트도 같은 `PlayerSettingsPanel` interface에서 저장·DOM·audio 결과를 확인한다.

교범도 `WorkbenchManual`의 `element/show/hide/destroy` 인터페이스 뒤에 있다. 교범
variant 문구, DOM 조립, audio credit 링크와 열 때의 scroll/focus 초기화는 이
module이 숨기고, `GameWorkbench`는 element를 shell에 놓아 overlay adapter로
연결하기만 한다.

진행 저장도 JSON과 localStorage를 workbench 밖에 숨긴다.

```text
GameApp render ─→ CampaignCheckpoint.capture(GameSnapshot)
                       │  progress + officerMemory만 추출·중복 제거
새 방문 ─────────→ CampaignCheckpoint.restore()
                       │  구조 오류 격리
                       └─→ GameSessionResume ─→ GameSession ─→ 안전한 briefing
새 게임 확인 ────→ CampaignCheckpoint.clear()
```

`GameWorkbench`는 checkpoint의 `restore/capture/clear` interface만 사용한다.
campaign module은 장면 진행의 의미를, application module은 briefing 복원을
검증하며 app module은 저장 매체 오류가 플레이를 막지 않도록 격리한다.

입력과 출력은 서로 반대 방향으로 흐른다.

```text
DOM input ─→ typed GameCommand ─→ GameSession.dispatch ─→ operation state
RAF delta ──────────────────────→ GameSession.advance  ─→ operation state

operation state ─→ GameSnapshot ─→ GameViewModel ─→ phase view ─→ DOM
```

presentation은 simulation 내부를 직접 알지 않는다. 모든 player action은 typed
`GameCommand`로 application에 들어가고, 모든 화면 데이터는 `GameSnapshot`을
project한 `GameViewModel`로 나온다. 브라우저 전역은 app/workbench,
CampaignWorkshop, presentation과 platform adapter에만 있고 application과
domain에는 없다.

실시간 전장의 map은 같은 snapshot 흐름을 벗어나지 않는다.

```text
GameSnapshot.scene.mapTopology + presentation.mapId
  ─→ BattlefieldFrame.map
  ─→ Canvas battlefield map renderer
  ─→ generated map atlas manifest
```

`mapTopology`은 이동 규칙의 원본이고 `mapId`는 외형만 선택한다. presentation의
map atlas module이 SVG 경로, atlas 좌표와 skin 배치를 숨기므로 campaign과
operation domain은 asset 파일을 알지 않는다. Canvas 카메라 범위는 각
`BattlefieldFrame.map`의 실제 width와 height를 따른다.

`CampaignRun`은 현재 장면, 시도 번호, 안정적인 작전 seed와 장교별 최근 교훈을
단독 소유한다. `GameSession`은 run이 내놓은 launch를 `CampaignOperation`에
전달하고, 실패 결과는 같은 launch로 재시도하며 성공 결과는 플레이어가 교훈을
선택한 뒤에만 다음 장면으로 진행한다.

operation 구현의 조립은 `CampaignOperationFactory` 하나로 좁혀져 있다.

```text
mountProductionGame
  ─→ GameWorkbenchOptions.operationFactory (optional)
      ─→ GameSessionOptions.operationFactory (optional)
          ─→ CampaignOperationFactory(launch, harness)
              └─→ CampaignOperation { simulation, result }
```

factory를 주입하지 않으면 기존 `createCampaignOperation` adapter가 사용되므로 현재
배포 동작은 바뀌지 않는다. 다른 operation 구현은 `GameWorkbench`나 `GameSession`
내부를 수정하지 않고 app composition에서 factory만 교체한다. launch와 harness는
factory 경계에서 복제되며 새 시도와 새 게임마다 새 operation을 조립한다.

시나리오가 작성하는 `AutonomousBattleDefinition`은 `domain/campaign`이 소유하고,
가변 자율 난전 구현 경계인 `AutonomousBattleSimulationFactory`는
`domain/operation`이 소유한다. `AutonomousBattleDefinition.formations[].actors`가
편성의 유일한 크기 원본이므로 이
계약에는 36명, 4개 부대, 9인 분대 같은 고정 개수가 없다. 각 행동 주체는 고유
profile과 판단·실행 변동성을 가진다. factory options는 seed, 네 하네스 정책과
예외 개입 예산을 한 번에 받으며 seed 값 자체는 snapshot에 노출하지 않는다.

canonical snapshot은 running/resolved resolution, 하네스 정책과 현재 consequence,
임의 편성 안의 행동 주체, 목표별 상태와 player-facing scalar evidence, 개입 예산과
bounded recent event window를 함께 소유한다. 행동 주체는 최신 판단 하나에서
information → verification → authority → action → feedback의 명명된 trace만
보여준다. random roll, 내부 queue, 행동 점수, 과거 전체 trace는 runtime
implementation에 남는다.

runtime 입력은 전투 집단 의도와 하네스 지침을 표현하는 제한적 `intervene`뿐이고
개별 행동 주체 직접 조작은 public interface 밖에 있다. `intervene`는 변경 snapshot과
accepted receipt를 원자적으로 반환한다. 예산 부족이나 종료 후 요청은 state를 바꾸지
않고 rejected receipt를 반환하며, 잘못된 형식이나 존재하지 않는 편성 참조만 예외다.

이 domain 계약은 아직 production composition에 연결되지 않았다. 테스트 전용 mock이
재사용 가능한 contract suite를 실행해 비대칭 편성, trace 순서·참조, ratio와 evidence,
resolution, event window, atomic receipt, 입력·출력 격리, 같은 seed 재현과 다른 seed의
확률 궤적을 검증한다. 실제 난전 runtime은 같은 suite를 통과한 뒤 별도 application
adapter에서 `CampaignOperationFactory`로 번역한다.

## Public interface

기존 campaign application의 깊은 interface는 세 동작뿐이다.

```ts
type GameSession = Readonly<{
  read: () => GameSnapshot;
  dispatch: (command: GameCommand) => GameSnapshot;
  advance: (realElapsedMs: number) => GameSnapshot;
}>;
```

operation 교체 지점은 다음 두 factory interface다.

```ts
type CampaignOperationFactory = (
  launch: OperationLaunch,
  harness: HarnessConfiguration,
) => CampaignOperation;

type AutonomousBattleSimulationFactory = (
  definition: AutonomousBattleDefinition,
  options: {
    seed: RandomSeed;
    harness: AutonomousBattleHarnessPolicies;
    interventionBudget: number;
  },
) => AutonomousBattleSimulation;
```

첫 interface는 campaign application이 소비하는 조립 seam이고, 두 번째 interface는
전투 domain Adapter가 구현하는 in-process seam이다. `AutonomousBattleSimulation`은
`snapshot`, `advance`, `intervene` 세 동작만 공개하며 두 factory 사이의
snapshot·result 변환은 이후의 application Adapter 한 곳이 소유한다.

두 부대 난전은 브라우저 session과 headless CLI가 같은 domain facade를 실행한다.

```text
SquadBattleApp ─→ SquadBattleSession ─┐
                                     ├─→ operationEngine
scripts/simulate-squad-battle.ts ─────┘      └─ squadBattleRuntime
                                                  └─ encounters
```

기존 `encounters`가 현재 독립 난전의 36명 개별 병사 명중, 체력, 제압과 패닉을 소유하고,
`squadBattleRuntime`은 명령 지연, 지정 행군 경로, 증원, 피로, 사기, 패주와
교량 호송 판정만 조율한다.

이 36명 고정값은 현재 `SquadBattleSimulation` 구현의 내부 전제일 뿐이며 새
`AutonomousBattleSimulation` 계약이나 campaign 콘텐츠의 제약이 아니다.

```ts
type SquadBattleSimulation = Readonly<{
  snapshot: () => SquadBattleSnapshot;
  advance: (elapsedMs: number) => SquadBattleSnapshot;
  command: (command: SquadBattleCommand) => SquadBattleSnapshot;
}>;
```

브라우저는 pause, speed, reset을 감싼 application interface만 사용한다.

```ts
type SquadBattleSession = Readonly<{
  read: () => SquadBattleSessionSnapshot;
  dispatch: (command: SquadBattleGameCommand) => SquadBattleSessionSnapshot;
  advance: (realElapsedMs: number) => SquadBattleSessionSnapshot;
}>;
```

`npm run simulate:squad-battle`은 domain interface를 직접 사용하는 headless adapter다.

authoring은 저장 방식 대신 repository seam만 안다.

```ts
interface CampaignRepository {
  load(): CampaignDefinition;
  save(campaign: CampaignDefinition): void;
  restore(): CampaignDefinition;
}
```

현재 adapter는 읽기 전용 built-in, test/격리용 memory, browser localStorage 세
종류다. `CampaignWorkshop`은 `CampaignDocument`를 통해서만 장면을 읽고 바꾸며,
game session이나 operation을 import하지 않는다.

## Module 책임과 현재 경로

| module | 책임 | 현재 경로 |
| --- | --- | --- |
| `app` | 배포 조립, workbench 수명주기 | `src/main.ts`, `src/app/` |
| `presentation` | DOM, view model, phase view, effect, style | `src/presentation/`, `src/ui/`, `src/styles/` |
| `application` | command 처리와 campaign/operation 진행 | `src/application/` |
| `platform` | browser frame, audio, localStorage adapter | `src/platform/` |
| `authoring` | campaign document와 workshop | `src/authoring/` |
| `content` | 배포용 해인교 시제품과 확장용 장면 콘텐츠 | `src/scenarios/` |
| `domain/operation` | clock, deterministic random, 전장 계약과 작전 규칙 | `src/domain/operation/`, `src/simulation/` |
| `domain/campaign` | campaign과 전투 정의 type, parse, validate, progress, repository seam | `src/campaign/` |

현재 경로명이 module명과 다른 경우에도 표의 책임이 기준이다. 예를 들어
`src/ui/GameApp.ts`는 presentation mount adapter이고,
`src/domain/operation/operationEngine.ts`는 operation domain의 단일 public entrypoint다.

## 변경 경로

변경 의도에 맞는 행에서 시작한다. 책임과 불변식은 링크된 기존 section을 읽고,
첫 소유 심볼에서 구현을 좁힌 뒤 focused test와 최소 검증을 실행한다.

| 변경 의도 | canonical section | 첫 소유 entrypoint · public symbol | focused test | 최소 validation |
| --- | --- | --- | --- | --- |
| campaign 콘텐츠·parse·validation | [Module 책임과 현재 경로](#module-책임과-현재-경로) | `src/campaign/index.ts` · `parseCampaignJson`, `validateCampaignDefinition`; `src/scenarios/` | `npx vitest run tests/campaign/campaign-parsing.test.ts tests/campaign/campaign.test.ts` | `npm run build && npm run check:dependencies` |
| operation 규칙·장교 판단·두 부대 난전·결과 | [실행 배선](#실행-배선) | `src/domain/operation/operationEngine.ts` · `createOperationSimulation`, `createSquadBattle` | `npx vitest run tests/simulation/operation-simulation.test.ts tests/domain/operation/squad-battle.test.ts` | `npm run test:monte-carlo && npm run simulate:squad-battle` |
| 새 가변 자율 난전 definition·adapter | [Public interface](#public-interface) | `src/campaign/autonomousBattleDefinition.ts` · `AutonomousBattleDefinition`; `src/domain/operation/autonomousBattle.ts` · `AutonomousBattleSimulationFactory`; `tests/contracts/autonomous-battle.contract.ts` | `npx vitest run tests/domain/operation/autonomous-battle-contract.test.ts` | `npm run build && npm run check:dependencies` |
| game session·campaign 진행 | [Public interface](#public-interface) | `src/application/game-session/index.ts` · `createGameSession`, `GameSession`; `src/application/squad-battle-session.ts` · `createSquadBattleSession` | `npx vitest run tests/game/game-session.test.ts tests/game/game-session-flow.test.ts tests/application/squad-battle-session.test.ts` | `npm run build && npm run check:dependencies` |
| presentation·battlefield projection/rendering | [실행 배선](#실행-배선) | `src/presentation/operation/squadBattleProjector.ts` · `projectSquadBattleFrame`; `src/presentation/battlefield/canvasBattlefield.ts` · `mountCanvasBattlefield` | `npx vitest run tests/ui/squad-battle-projector.test.ts tests/ui/squad-battle-app.test.ts tests/ui/canvas-viewport.test.ts` | `npm run build && node tests/fixtures/run-squad-battle-chrome.mjs` |
| authoring·`CampaignRepository` | [Public interface](#public-interface) | `src/authoring/campaign-workshop/index.ts` · `createCampaignDocument`, `mountCampaignWorkshop`; `src/campaign/repository.ts` · `CampaignRepository` | `npx vitest run tests/campaign/campaign-repository.test.ts tests/ui/campaign-editor.test.ts` | `npm run build && npm run check:dependencies` |
| browser platform adapter | [Module 책임과 현재 경로](#module-책임과-현재-경로) | `src/platform/browser/adapters.ts` · `createBrowserFrameScheduler`, `createBrowserStorage`, `createBrowserCampaignRepository`, `createBrowserAudio` | `npx vitest run tests/ui/browser-audio.test.ts tests/ui/campaign-checkpoint.test.ts tests/ui/player-settings.test.ts` | `npm run build && node tests/fixtures/run-squad-battle-chrome.mjs` |

## 후속 이슈의 독립 작업면

후속 구현은 아래 행마다 별도 이슈와 touch surface를 사용한다. public contract 변경이
필요하지 않은 한 다른 행의 소유 파일을 함께 고치지 않는다.

| 작업 | 소유하는 면 | 소비하는 계약 | 함께 고치지 않는 면 |
| --- | --- | --- | --- |
| 역사 시나리오 | `src/scenarios/`의 scenario definition과 campaign copy | `AutonomousBattleDefinition` | simulation runtime, GameSession, UI |
| 행동 AI·난전 규칙 | `domain/operation`의 새 internal adapter | `AutonomousBattleSimulationFactory`와 공통 contract suite | campaign 진행, production composition, UI |
| campaign-operation 변환 | `src/application/`의 단일 adapter | `AutonomousBattleSimulation` → `CampaignOperationFactory` | domain 내부 규칙, presentation |
| 화면 투영·조작 | presentation projector와 view | `GameSnapshot`, typed `GameCommand` | scenario parser, simulation 내부 |
| 배포 연결 | `src/app/createGameWorkbench.ts`의 composition | 완성된 `CampaignOperationFactory` | GameWorkbench, GameSession, domain runtime |
| Monte Carlo 평가 | evaluation script와 전용 tests | headless factory와 seed | browser UI, production composition |

## 허용 의존

화살표 왼쪽 module만 오른쪽 module을 알 수 있다. 같은 module 내부 의존은
허용한다.

```text
app → presentation → application → domain/operation → domain/campaign
  ├→ application
  ├→ platform ────────────────────────────────┘
  ├→ authoring → domain/campaign
  └→ content ─→ domain/campaign
```

| importer module | 허용하는 imported module |
| --- | --- |
| `app` | `app`, `presentation`, `application`, `platform`, `authoring`, `content` |
| `presentation` | `presentation`, `application` |
| `application` | `application`, `domain/operation`, `domain/campaign` |
| `platform` | `platform`, `domain/operation`, `domain/campaign` |
| `authoring` | `authoring`, `domain/campaign` |
| `content` | `content`, `domain/campaign` |
| `domain/operation` | `domain/operation`, `domain/campaign` |
| `domain/campaign` | `domain/campaign` |

표에 없는 방향과 분류되지 않은 새 최상위 소스 경로는 검사 실패다. 현재
migration exception은 `0`이다.

## 검증 interface

```text
npm run check
npm run check:assets
npm run check:dependencies
node scripts/check-dependencies.mjs --source-root <격리된-src-경로>
```

`npm run check`는 asset 산출물 일치, build, 전체 test, module 의존 검사를 차례로
실행한다. 의존 검사는 TypeScript scanner로 정적 import, re-export, 동적 import와
`require`를 읽는다. 특정 test 개수나 과거 기준선은 문서에 고정하지 않고 현재
명령 결과를 판정 기준으로 사용한다.
