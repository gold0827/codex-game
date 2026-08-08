export type OfficerTone = "nominal" | "warning" | "critical";
export type TimelineTone = "complete" | "active" | "pending" | "failed";

export interface CommandRoomScenario {
  identity: {
    eyebrow: string;
    title: string;
    round: string;
    clock: string;
    signal: string;
  };
  mission: {
    regionLabel: string;
    title: string;
    briefingLabel: string;
    briefing: string;
    commandLabel: string;
    command: string;
    objectiveLabel: string;
    objectives: string[];
  };
  officers: {
    regionLabel: string;
    summary: string;
    entries: Array<{
      name: string;
      assignment: string;
      callSign: string;
      status: string;
      tone: OfficerTone;
      readinessLabel: string;
      readiness: string;
      reportLabel: string;
      report: string;
    }>;
  };
  timeline: {
    regionLabel: string;
    progressLabel: string;
    progress: string;
    entries: Array<{
      time: string;
      title: string;
      detail: string;
      status: string;
      tone: TimelineTone;
    }>;
  };
  harness: {
    regionLabel: string;
    unavailableLabel: string;
    explanation: string;
    controls: Array<{
      name: string;
      setting: string;
      description: string;
    }>;
  };
  outcome: {
    regionLabel: string;
    verdict: string;
    title: string;
    description: string;
    metricLabel: string;
    metric: string;
  };
  footer: string;
}

export const commandRoomScenario: CommandRoomScenario = {
  identity: {
    eyebrow: "자율 작전 통제망 / 알파 구역",
    title: "야전 자동화 사령부",
    round: "제1라운드 · 새벽의 보급선",
    clock: "작전 시각 05:47",
    signal: "통신망 불안정",
  },
  mission: {
    regionLabel: "임무 및 명령",
    title: "협곡 7번 보급로를 확보하라",
    briefingLabel: "상황",
    briefing:
      "폭우로 주 교량이 끊겼다. 전투 식량과 의약품을 실은 수송대가 일출 전까지 전방 초소에 도착해야 한다.",
    commandLabel: "지휘 명령",
    command:
      "가용한 경로를 재검토하고 수송대를 호위하라. 민간 시설 피해는 허용하지 않는다.",
    objectiveLabel: "작전 목표",
    objectives: ["수송대 생존", "06:30 이전 도착", "민간 시설 피해 없음"],
  },
  officers: {
    regionLabel: "장교 상태 및 보고",
    summary: "3명 접속 · 1명 판단 충돌",
    entries: [
      {
        name: "한서진 대위",
        assignment: "작전 장교",
        callSign: "검독수리",
        status: "명령 해석 중",
        tone: "nominal",
        readinessLabel: "준비도",
        readiness: "82%",
        reportLabel: "최근 보고",
        report:
          "우회로가 가장 빠릅니다. 정찰대의 침수 경고는 오래된 정보로 판단했습니다.",
      },
      {
        name: "박철민 중위",
        assignment: "보급 장교",
        callSign: "두돈반",
        status: "출발 강행",
        tone: "warning",
        readinessLabel: "준비도",
        readiness: "64%",
        reportLabel: "최근 보고",
        report:
          "의약품 상자는 방수포 아래 있습니다. 차량 한 대쯤 빠져도 일정은 지킬 수 있습니다.",
      },
      {
        name: "오미래 소위",
        assignment: "정보 장교",
        callSign: "부엉이",
        status: "이의 제기",
        tone: "critical",
        readinessLabel: "준비도",
        readiness: "91%",
        reportLabel: "최근 보고",
        report:
          "우회로 수위가 12분 전 급상승했습니다. 아무도 제 최신 정찰 보고를 열람하지 않았습니다.",
      },
    ],
  },
  timeline: {
    regionLabel: "작전 진행",
    progressLabel: "단계",
    progress: "4 / 6",
    entries: [
      {
        time: "05:12",
        title: "명령 하달",
        detail: "지휘부가 보급로 확보 명령을 전 장교에게 전송했다.",
        status: "완료",
        tone: "complete",
      },
      {
        time: "05:19",
        title: "경로 자동 선정",
        detail: "작전 장교가 거리 기준으로 북쪽 우회로를 선택했다.",
        status: "완료",
        tone: "complete",
      },
      {
        time: "05:31",
        title: "정찰 경고 수신",
        detail: "정보 장교의 침수 보고가 참고 문서함에 분류되었다.",
        status: "주의",
        tone: "active",
      },
      {
        time: "05:47",
        title: "수송 2호차 고립",
        detail: "선두 차량이 불어난 하천에 진입했다. 후속 차량은 명령 대기 중이다.",
        status: "실패",
        tone: "failed",
      },
      {
        time: "다음",
        title: "현장 재판단",
        detail: "장교들이 상충하는 보고를 교차 검증해야 한다.",
        status: "대기",
        tone: "pending",
      },
    ],
  },
  harness: {
    regionLabel: "지휘 체계 조정",
    unavailableLabel: "이번 라운드에서는 조정 불가",
    explanation:
      "현재 설정을 관찰하십시오. 다음 라운드부터 정보 공유와 승인 조건을 조정할 수 있습니다.",
    controls: [
      {
        name: "정보 공유 범위",
        setting: "직무별 제한",
        description: "장교는 자신의 직무에 배정된 보고만 자동으로 확인합니다.",
      },
      {
        name: "명령 실행 권한",
        setting: "개별 판단",
        description: "담당 장교는 별도 승인 없이 작전을 시작할 수 있습니다.",
      },
      {
        name: "교차 검증 절차",
        setting: "비활성",
        description: "상충하는 정보가 있어도 재확인을 요구하지 않습니다.",
      },
      {
        name: "이상 보고 경로",
        setting: "참고 문서함",
        description: "예외 보고는 작전 흐름을 중단하지 않고 보관됩니다.",
      },
    ],
  },
  outcome: {
    regionLabel: "라운드 결과",
    verdict: "작전 실패",
    title: "모두가 자기 일은 했습니다",
    description:
      "최신 정찰 정보가 실행 권한과 연결되지 않아 수송대가 침수 구역으로 진입했습니다.",
    metricLabel: "조직 신뢰도",
    metric: "38 / 100",
  },
  footer: "지휘 기록 자동 저장 · 재생 모드",
};
