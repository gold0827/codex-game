# 춘천지구 자율지휘 프로토타입

1950년 6월 춘천지구 방어전을 배경으로, 개별 전투원을 직접 조작하지 않고
지휘 하네스와 제한된 편성 단위 개입으로 전황을 이끄는 브라우저 게임
프로토타입입니다. 행동 주체마다 고유 특성과 seed 기반 변동성이 있으며,
정보 수신 → 검증 → 권한 판단 → 행동 → 피드백의 전 과정을 관찰할 수 있습니다.

[배포 게임 실행](https://gold0827.github.io/codex-game/)

[모듈 배선](docs/architecture/dependency-directions.md)

## 실행과 검증

```sh
npm ci
npm run dev
npm run check
```

실제 Chrome의 UI와 RAF 경로에서 브리핑을 시작하고, 제한 개입을 접수한 뒤
2배속으로 작전 종료 디브리핑까지 진행하려면 다음을 실행합니다. 이 검사는
춘천지구의 7개 편성·21개 행동 주체, 목표 근거, 5단계 trace, 하네스,
최근 사건, 개입 영수증·예산과 legacy 명령 부재도 함께 확인합니다.

```sh
npm run test:browser
```

seed 집합에서 같은 canonical 결과 facts를 집계하는 몬테카를로 검증은 다음과
같이 따로 실행할 수 있습니다.

```sh
npm run test:monte-carlo
```

## 게임 루프

- 브리핑에서 작전 목표와 지휘 예산을 확인합니다.
- 정보 공유, 교차 검증, 권한 명료도, 피드백 압축을 조정합니다.
- 임의 개수의 편성과 행동 주체가 자율적으로 판단하고 움직이는 전황을 봅니다.
- 제한된 예산으로 편성 의도 또는 지침만 개입합니다.
- 목표별 근거와 다섯 단계 trace를 확인하고 디브리핑으로 넘어갑니다.

같은 정의·하네스·seed는 같은 결과를 재현합니다. 여러 seed에서는 행동 주체의
특성과 무작위성이 합쳐져 판단, 피해, 목표 달성 결과가 분포를 이룹니다.

## 코드 구조

- `src/domain/operation`: canonical 자율전투 계약·runtime·Monte Carlo facts
- `src/application`: campaign operation 포트와 게임 세션
- `src/presentation`, `src/ui`: canonical snapshot projector와 브라우저 표현
- `src/campaign`, `src/scenarios`: 캠페인 진행 모델과 춘천지구 콘텐츠
- `src/app`, `src/platform`: production 조립과 브라우저 adapter

남은 작업과 개발 이력은 GitHub Issues·Pull Requests에서 관리합니다.
