# canonical 자율지휘 모듈 배선

이 문서는 현재 production 경로의 module 책임과 허용 의존을 설명한다. 작전 상태는
`AutonomousBattleSnapshot` 하나이며 장기 compatibility union이나 이중 engine을
두지 않는다.

## 실행 배선

```text
main
└─ mountProductionGame
   ├─ chuncheonCampaign                        content
   ├─ chuncheonAutonomousBattle                content
   ├─ browser frame/audio/storage adapters     platform
   └─ mountGameWorkbench                       app composition
      ├─ CampaignDocument + checkpoint         campaign persistence
      ├─ CampaignOperationFactory              application port
      │  └─ createAutonomousBattleSimulation   domain/operation runtime
      ├─ GameSession                           briefing→operation→debrief
      └─ GameApp                               presentation mount adapter
         ├─ projectGameViewModel
         │  └─ projectAutonomousOperation
         └─ phase DOM views + GameEffects
```

`GameSession`은 runtime 내부나 과거 snapshot 필드를 모른다. 주입된
`CampaignOperation`의 `read`, `advance`, `intervene`, `result`만 사용한다.
application adapter는 캠페인의 launch/harness/budget을 canonical runtime에
복제해 전달하고 terminal facts를 campaign result로 매핑한다.

projector 입력은 `NonNullable<GameSnapshot["operation"]>`으로 고정된다. 따라서
presentation은 domain을 직접 import하지 않고 arbitrary formations, actors,
objective evidence, recent events와 선택한 actor의 정보→검증→권한→행동→피드백
trace를 읽기 전용 view model로 바꾼다. actor 선택은 UI-local 상태다. session
명령은 예산을 쓰는 편성 의도·지침 개입만 제공한다.

Monte Carlo evaluator도 projector와 같은 terminal snapshot/result facts를 집계해
UI 결과와 평가 결과의 의미가 갈라지지 않는다.

## 의존 방향

dependency checker는 실제 `src` 경로를 아래 logical module로 분류한다.

| `src` 경로 | logical module |
| --- | --- |
| `main.ts`, `app/**` | `app` |
| `ui/**`, `styles/**`, `presentation/**` | `presentation` |
| `application/**` | `application` |
| `platform/**` | `platform` |
| `authoring/**` | `authoring` |
| `scenarios/**`, `content/**` | `content` |
| `campaign/**`, `domain/campaign/**` | `domain/campaign` |
| `simulation/**`, `domain/operation/**` | `domain/operation` |

따라서 `domain/operation`이 `simulation/seededRandom.ts`를 사용하는 것은 같은 logical
module 내부 의존이다. 아래 화살표는 이 분류 이후 허용되는 logical module 방향이다.

```text
app ────────────────→ application, presentation, platform, authoring, content
presentation ───────→ application
application ────────→ domain/operation, domain/campaign
platform ───────────→ domain/operation, domain/campaign
authoring/content ──→ domain/campaign
domain/operation ───→ domain/campaign
domain/campaign ────→ (내부만)
```

`npm run check:dependencies`가 이 규칙을 검사하며 예외 목록은 비어 있다.
campaign 저작 Interface는 장면 copy/presentation, 목표, 전환, 실행 시간과 지휘 예산만
노출한다. 전투 중 정보·판단·사건은 canonical operation definition과 snapshot이 소유한다.

## 상태 불변식

- `operation === null`은 briefing/debrief/epilogue에서만 허용한다.
- operation은 한 번 시작한 canonical simulation의 isolated snapshot이다.
- 종료된 operation의 result는 한 번만 campaign progress에 반영된다.
- intervention receipt는 accepted/rejected를 항상 기록하고 거부는 예산을 쓰지 않는다.
- formation/actor 개수는 콘텐츠 정의에 따르며 고정 슬롯을 가정하지 않는다.
- feedback은 opaque ID 대신 `none | prior-action` 의미만 노출한다.
- pause와 화면 배속은 simulation 입력 시간을 조절할 뿐 domain 결과 계약을 바꾸지 않는다.

## 검증

```sh
npm run build
npm test
npm run test:monte-carlo
npm run test:browser
npm run check:dependencies
```

focused tests는 세션 phase 전이, accepted/rejected 편성 개입, 임의 편성·행동 주체
projection, workbench factory 주입 seam을 고정한다.
