export type OfficerTone = "nominal" | "warning" | "critical";
export type TimelineTone = "complete" | "active" | "pending" | "failed";

export interface CommandRoomScenario {
  identity: {
    eyebrow: string;
    title: string;
    round: string;
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
  tacticalMap: {
    regionLabel: string;
    accessibleName: string;
    phaseDescriptions: string[];
  };
  officers: {
    regionLabel: string;
    entries: Array<{
      name: string;
      assignment: string;
      callSign: string;
      readinessLabel: string;
      readiness: string;
      reportLabel: string;
    }>;
  };
  timeline: {
    regionLabel: string;
    progressLabel: string;
    phases: Array<{
      time: string;
      title: string;
      detail: string;
      actionLabel: string;
      officerSummary: string;
      officerUpdates: Array<{
        status: string;
        tone: OfficerTone;
        report: string;
      }>;
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
    pendingVerdict: string;
    pendingTitle: string;
    pendingDescription: string;
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
  tacticalMap: {
    regionLabel: "전술 작전도",
    accessibleName: "협곡 7번 보급로 전술 작전도",
    phaseDescriptions: [
      "명령 하달. 수송대는 출발 지점에서 대기하고 북쪽 우회로는 아직 선정되지 않았다.",
      "경로 선정. 수송대가 북쪽 우회로로 출발했으며 불어난 하천의 교차점으로 향한다.",
      "정찰 경고 수신. 정보 장교의 경고가 침수 예상 교차점을 가리키지만 수송대는 선정 경로를 계속 이동한다.",
      "수송 2호차 고립. 선두 차량이 불어난 하천에 고립되고 후속 차량은 교차점 앞에서 정지했다.",
      "작전 실패. 최신 정찰 정보가 반영되지 않아 수송대가 침수 구역에 고립되었다.",
    ],
  },
  officers: {
    regionLabel: "장교 상태 및 보고",
    entries: [
      {
        name: "한서진 대위",
        assignment: "작전 장교",
        callSign: "검독수리",
        readinessLabel: "준비도",
        readiness: "82%",
        reportLabel: "최근 보고",
      },
      {
        name: "박철민 중위",
        assignment: "보급 장교",
        callSign: "두돈반",
        readinessLabel: "준비도",
        readiness: "64%",
        reportLabel: "최근 보고",
      },
      {
        name: "오미래 소위",
        assignment: "정보 장교",
        callSign: "부엉이",
        readinessLabel: "준비도",
        readiness: "91%",
        reportLabel: "최근 보고",
      },
    ],
  },
  timeline: {
    regionLabel: "작전 진행",
    progressLabel: "진행 단계",
    phases: [
      {
        time: "05:12",
        title: "명령 하달",
        detail: "지휘부가 보급로 확보 명령을 전 장교에게 전송했다.",
        actionLabel: "경로 선정 지시",
        officerSummary: "3명 접속 · 명령 확인 중",
        officerUpdates: [
          {
            status: "명령 확인",
            tone: "nominal",
            report: "지휘 명령을 확인했습니다. 가용 경로부터 검토하겠습니다.",
          },
          {
            status: "적재 점검",
            tone: "nominal",
            report: "전투 식량과 의약품 적재 상태를 확인하고 있습니다.",
          },
          {
            status: "정찰 시작",
            tone: "nominal",
            report: "교량과 우회로의 최신 수위 정보를 모으고 있습니다.",
          },
        ],
      },
      {
        time: "05:19",
        title: "경로 선정",
        detail: "작전 장교가 거리 기준으로 북쪽 우회로를 선택했다.",
        actionLabel: "정찰 보고 확인",
        officerSummary: "3명 접속 · 북쪽 우회로 준비 중",
        officerUpdates: [
          {
            status: "경로 선정",
            tone: "nominal",
            report: "북쪽 우회로가 가장 짧습니다. 이 경로로 호위 계획을 잡겠습니다.",
          },
          {
            status: "출발 준비",
            tone: "nominal",
            report: "수송대 적재를 마쳤습니다. 출발 명령을 기다립니다.",
          },
          {
            status: "수위 확인",
            tone: "warning",
            report: "북쪽 우회로의 수위가 빠르게 오르고 있습니다. 최신 보고를 확인 중입니다.",
          },
        ],
      },
      {
        time: "05:31",
        title: "정찰 경고 수신",
        detail: "정보 장교의 침수 보고가 참고 문서함에 분류되었다.",
        actionLabel: "수송대 상황 확인",
        officerSummary: "3명 접속 · 1명 판단 충돌",
        officerUpdates: [
          {
            status: "경고 보류",
            tone: "warning",
            report: "우회로가 가장 빠릅니다. 정찰대의 침수 경고는 오래된 정보로 판단했습니다.",
          },
          {
            status: "출발 강행",
            tone: "warning",
            report: "의약품 상자는 방수포 아래 있습니다. 차량 한 대쯤 빠져도 일정은 지킬 수 있습니다.",
          },
          {
            status: "이의 제기",
            tone: "critical",
            report: "우회로 수위가 12분 전 급상승했습니다. 아무도 제 최신 정찰 보고를 열람하지 않았습니다.",
          },
        ],
      },
      {
        time: "05:47",
        title: "수송 2호차 고립",
        detail: "선두 차량이 불어난 하천에 진입했다. 후속 차량은 명령 대기 중이다.",
        actionLabel: "작전 결과 확인",
        officerSummary: "3명 접속 · 수송 차량 1대 고립",
        officerUpdates: [
          {
            status: "경로 재검토",
            tone: "critical",
            report: "침수 보고를 먼저 확인했어야 합니다. 남은 차량의 퇴로를 찾고 있습니다.",
          },
          {
            status: "후속 차량 정지",
            tone: "critical",
            report: "후속 차량은 세웠습니다. 고립 차량의 의약품부터 옮기겠습니다.",
          },
          {
            status: "경고 재전송",
            tone: "warning",
            report: "최신 수위와 남쪽 임시 도로 정보를 전 장교에게 다시 보냈습니다.",
          },
        ],
      },
      {
        time: "05:54",
        title: "작전 실패",
        detail: "최신 정찰 정보가 실행 명령에 반영되지 않아 수송대가 침수 구역에 고립되었다.",
        actionLabel: "라운드 다시 시작",
        officerSummary: "3명 접속 · 작전 종료",
        officerUpdates: [
          {
            status: "판단 실패",
            tone: "critical",
            report: "가장 짧은 경로만 보고 최신 정찰 정보를 놓쳤습니다.",
          },
          {
            status: "수송 중단",
            tone: "critical",
            report: "일정만 지키려다 차량과 의약품을 위험에 빠뜨렸습니다.",
          },
          {
            status: "보고 미반영",
            tone: "critical",
            report: "경고는 보냈지만 실행 명령을 멈출 경로가 없었습니다.",
          },
        ],
      },
    ],
  },
  harness: {
    regionLabel: "지휘 체계 조정",
    unavailableLabel: "이번 라운드에서는 조정 불가",
    explanation:
      "현재 설정만 확인할 수 있습니다. 정보 공유와 승인 조건은 고정되어 있습니다.",
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
    pendingVerdict: "결과 대기",
    pendingTitle: "작전 진행 중",
    pendingDescription: "마지막 단계에서 이번 라운드의 결과를 확인할 수 있습니다.",
    verdict: "작전 실패",
    title: "모두가 자기 일은 했습니다",
    description:
      "최신 정찰 정보가 실행 권한과 연결되지 않아 수송대가 침수 구역으로 진입했습니다.",
    metricLabel: "조직 신뢰도",
    metric: "38 / 100",
  },
  footer: "지휘 기록 저장 중",
};
