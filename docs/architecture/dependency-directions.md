# 현재 화면과 모듈 배선

이 문서는 현재 구현의 화면, 명령 흐름, module 책임과 허용 의존을 설명하는
단일 기준이다. 과거 구조나 이동 이력은 기록하지 않는다. 구현과 설명이
어긋나면 `npm run check`와 아래 public interface를 기준으로 함께 수정한다.

## 화면 와이어프레임

작전 단계의 1440×900 고정 데스크톱 화면은 다음 순서로 조립된다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 게임 제목 │ 장면/시도 │ 작전 시간·배속·상태 │ 음소거                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ 튜토리얼 안내 · 현재 행동 · 대상                              (선택 영역) │
├──────────────────────────────────────────────────────────────────────────────┤
│ 작전 시계 │ 일시정지·재개 │ 0.5배·1배·2배 │ 남은 직접 개입              │
├──────────────────┬────────────────────────────────┬──────────────────────────┤
│ 작전 상태        │                                │ 선택 장교                │
│ 지표·목표        │                                │ 역할·의도·상태           │
│                  │        실시간 전장             ├──────────────────────────┤
│ 하네스 조정      │ unit · threat · objective      │ 보고 기록                │
│ 정보·권한        │ movement · impact              │ 전달 대상·검증 행동      │
│ 검증·피드백      │                                │                          │
├──────────────────┴────────────────────────────────┴──────────────────────────┤
│ 사건 흐름 · 최근 operation event 여섯 건                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 직접 개입 트레이 · 예외 권한 · 최신 보고 전달 · 최신 보고 검증 우선         │
└──────────────────────────────────────────────────────────────────────────────┘
```

브리핑, 디브리핑, 졸업은 같은 header와 shell 안에서 각 phase view만 교체한다.
`작전 교범`과 `장면 편집`은 workbench가 소유하며 동시에 열리지 않는다. 진행 중인
작전에서 둘 중 하나를 열면 작전을 멈추고, 닫으면 필요한 경우 재개한다.

## 실행 배선

```text
src/main.ts
└─ mountProductionGame                         app composition
   ├─ CC0 music catalog                        app asset composition
   ├─ browser frame/audio/localStorage adapter platform
   └─ mountGameWorkbench                       app
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

`CampaignRun`은 현재 장면, 시도 번호, 안정적인 작전 seed와 장교별 최근 교훈을
단독 소유한다. `GameSession`은 run이 내놓은 launch를 `CampaignOperation`에
전달하고, 실패 결과는 같은 launch로 재시도하며 성공 결과는 플레이어가 교훈을
선택한 뒤에만 다음 장면으로 진행한다.

## Public interface

application의 깊은 interface는 세 동작뿐이다.

```ts
type GameSession = Readonly<{
  read: () => GameSnapshot;
  dispatch: (command: GameCommand) => GameSnapshot;
  advance: (realElapsedMs: number) => GameSnapshot;
}>;
```

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
| `app` | production 조립, workbench 수명주기 | `src/main.ts`, `src/app/` |
| `presentation` | DOM, view model, phase view, effect, style | `src/presentation/`, `src/ui/`, `src/styles/` |
| `application` | command 처리와 campaign/operation 진행 | `src/application/` |
| `platform` | browser frame, audio, localStorage adapter | `src/platform/` |
| `authoring` | campaign document와 workshop | `src/authoring/` |
| `content` | 실제 여섯 장면 | `src/scenarios/` |
| `domain/operation` | clock, deterministic random, 전장과 작전 규칙 | `src/domain/operation/`, `src/simulation/` |
| `domain/campaign` | campaign type, parse, validate, progress, repository seam | `src/campaign/` |

현재 경로명이 module명과 다른 경우에도 표의 책임이 기준이다. 예를 들어
`src/ui/GameApp.ts`는 presentation mount adapter이고,
`src/domain/operation/operationEngine.ts`는 operation domain의 단일 public entrypoint다.

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
