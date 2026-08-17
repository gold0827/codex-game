# 의존 방향과 회귀 기준선

이 문서는 현재 소스 배치를 목표 module 그래프에 대응시키고, 허용하지 않은
의존이 추가되는 일을 `npm run check`에서 막는 기준이다. 검사 module의 외부
interface는 다음 두 명령뿐이다.

```text
npm run check:dependencies
node scripts/check-dependencies.mjs --source-root <격리된-src-경로>
```

첫 명령은 저장소의 `src/`와 아래의 정확한 이전 예외를 함께 검사한다. 두 번째
명령은 fixture처럼 격리된 소스 트리를 목표 규칙만으로 검사한다. 구현은
TypeScript 구문 scanner로 정적 import, re-export, 동적 import와 `require`를 읽으므로
호출자가 파일별 규칙이나 정규식을 알 필요가 없다.

## 회귀 기준선

이 guardrail을 추가하기 전 `npm test` 기준선은 **13개 test file, 186개 test
통과**다. 이 186개 동작 test는 삭제하거나 제외하지 않는다. architecture test가
추가된 뒤에도 기존 186개가 모두 통과해야 하며, `npm run check`는 build, 전체
test, 의존 방향 검사를 차례로 실행한다.

## 목표 module 그래프

화살표의 왼쪽 module만 오른쪽 module을 알 수 있다. 같은 module 내부 의존은
항상 허용한다.

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

표에 없는 방향은 금지다. 특히 `domain`은 app, presentation, platform을 알 수
없고, `presentation`은 operation 내부를 직접 import할 수 없으며, `authoring`은
game session이나 operation을 import할 수 없다. `app`만 여러 module을 조립한다.

## 현재 경로 대응

| 현재 경로 | 목표 module | 앞으로 생길 경로 |
| --- | --- | --- |
| `src/main.ts`, `src/main.d.ts` | `app` | `src/app/` |
| `src/ui/`, `src/styles/` | `presentation` | `src/presentation/` |
| `src/game/` | `application` | `src/application/` |
| `src/simulation/` | `domain/operation` | `src/domain/operation/` |
| `src/campaign/` | `domain/campaign` | `src/domain/campaign/` |
| `src/authoring/` | `authoring` | `src/authoring/` |
| `src/scenarios/` | `content` | `src/content/` |
| 없음 | `platform` | `src/platform/` |

대응되지 않는 새 최상위 소스 경로도 검사 실패다. 새 module을 암묵적으로
허용하지 않고 이 문서와 검사 규칙을 함께 바꾸게 하기 위해서다.
