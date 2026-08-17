import {
  assertValidCampaignDefinition,
  type CampaignDefinition,
  type CampaignMapTopology,
} from "../campaign";

export const firstSpatialMap = {
  width: 24,
  height: 16,
  blocked: [
    { x: 11, y: 0 }, { x: 11, y: 1 }, { x: 11, y: 2 },
    { x: 11, y: 4 }, { x: 11, y: 5 }, { x: 11, y: 6 },
    { x: 11, y: 8 }, { x: 11, y: 9 }, { x: 11, y: 10 },
    { x: 11, y: 11 }, { x: 11, y: 12 }, { x: 11, y: 14 },
    { x: 11, y: 15 },
  ],
  terrain: [
    { position: { x: 5, y: 6 }, movementCost: 4 },
    { position: { x: 6, y: 6 }, movementCost: 4 },
    { position: { x: 7, y: 6 }, movementCost: 4 },
    { position: { x: 8, y: 6 }, movementCost: 4 },
  ],
  spawns: [
    { id: "west-north", position: { x: 1, y: 2 } },
    { id: "west-center", position: { x: 1, y: 7 } },
    { id: "west-south", position: { x: 1, y: 12 } },
  ],
  destinations: [
    { id: "east-north", position: { x: 22, y: 2 } },
    { id: "east-center", position: { x: 22, y: 7 } },
    { id: "east-south", position: { x: 22, y: 12 } },
  ],
} as const satisfies CampaignMapTopology;

export const completeCampaign = {
  id: "complete-campaign",
  title: "자율군단 지휘학교",
  version: 1,
  startSceneId: "signal-school",
  officers: [
    {
      id: "major-baek",
      name: "백돌격",
      rank: "소령",
      role: "기동 지휘",
      disposition: "action",
    },
    {
      id: "captain-han",
      name: "한확인",
      rank: "대위",
      role: "검증 통제",
      disposition: "verification",
    },
    {
      id: "lieutenant-kim",
      name: "김중계",
      rank: "중위",
      role: "통신 중계",
      disposition: "communication",
    },
  ],
  scenes: [
    {
      identity: { id: "signal-school", kind: "tutorial" },
      copy: {
        title: "통신학교 · 들리면 두 번 깜빡이시오",
        subtitle: "입교 훈련 / 확인했다는 확인을 확인하기",
        briefing:
          "보급 상자 하나를 표시 천막까지 보내면 된다. 문제는 훈련병 전원이 모든 확인 신호에 다시 확인 신호를 보내고 있다는 점이다.",
        lesson:
          "시간을 멈추고 의도를 살핀 뒤, 필요한 보고만 올바른 장교에게 연결하고 다시 흐르게 한다.",
        success: "보고는 목적지에 닿았고 보급 상자는 천막에 도착했다.",
        failure: "확인 신호만 가득한 사이 보급 상자는 출발지에 그대로 있다.",
      },
      presentation: {
        mapId: "signal-school-yard",
        backdropId: "training-yard-dawn",
        soundtrackId: "two-blinks-march",
        accentColor: "#67c1a3",
      },
      mapTopology: firstSpatialMap,
      guidance: [
        {
          id: "tutorial-pause",
          instruction: "작전 시간을 멈춘다.",
          action: "pause",
          target: { kind: "operation-clock" },
          completionEvent: "operation-paused",
        },
        {
          id: "tutorial-inspect",
          instruction: "백돌격 소령의 이동 의도와 점멸하는 위험 신호를 살핀다.",
          action: "inspect",
          target: { kind: "officer", officerId: "major-baek" },
          completionEvent: "officer-inspected",
        },
        {
          id: "tutorial-route",
          instruction: "천막 위치 보고를 백돌격 소령에게 직접 연결한다.",
          action: "route",
          target: {
            kind: "report-recipient",
            reportId: "school-han-address",
            recipientOfficerId: "major-baek",
          },
          completionEvent: "report-routed",
        },
        {
          id: "tutorial-resume",
          instruction: "시간을 다시 흐르게 한다.",
          action: "resume",
          target: { kind: "operation-clock" },
          completionEvent: "operation-resumed",
        },
      ],
      beats: [
        {
          id: "school-roll-call",
          timeMs: 0,
          headline: "전원 통신 양호",
          description: "첫 확인 신호가 훈련장 전체로 번진다.",
          reports: [
            {
              id: "school-baek-ready",
              officerId: "major-baek",
              tone: "confident",
              text: "침묵은 출발 허가로 알겠습니다. 상자는 제가 바로 옮기겠습니다.",
            },
          ],
          threats: [],
        },
        {
          id: "school-acknowledgement-loop",
          timeMs: 8_000,
          headline: "확인 신호가 확인 신호를 낳음",
          description: "모든 훈련병이 다른 훈련병의 응답까지 재확인한다.",
          reports: [
            {
              id: "school-kim-channel",
              officerId: "lieutenant-kim",
              tone: "urgent",
              text: "현재 확인 47건, 확인의 확인 93건입니다. 모두 빠짐없이 중계 중입니다.",
            },
          ],
          threats: [
            {
              id: "school-channel-saturation",
              kind: "communications",
              lane: "command",
              severity: "medium",
              telegraphDurationMs: 5_000,
            },
          ],
        },
        {
          id: "school-address-check",
          timeMs: 18_000,
          headline: "수신인이 없는 천막 보고",
          description: "표시 천막의 위치는 정확하지만 담당 장교에게 연결되지 않았다.",
          reports: [
            {
              id: "school-han-address",
              officerId: "captain-han",
              tone: "cautious",
              text: "좌표는 맞습니다. 이제 누가 이 보고를 받아야 하는지만 확인하면 됩니다.",
            },
          ],
          threats: [],
        },
        {
          id: "school-crate-delivered",
          timeMs: 32_000,
          headline: "보급 상자 도착",
          description: "필요한 보고 하나가 필요한 사람에게 닿자 훈련장이 조용해진다.",
          reports: [
            {
              id: "school-kim-silence",
              officerId: "lieutenant-kim",
              tone: "relieved",
              text: "중계할 내용이 없습니다. 이런 상태는 처음이라 일단 보고합니다.",
            },
          ],
          threats: [],
        },
      ],
      objectives: [
        {
          id: "deliver-training-crate",
          description: "보급 상자를 표시 천막까지 보낸다.",
          required: true,
        },
        {
          id: "route-one-report",
          description: "천막 위치 보고 하나를 올바른 장교에게 전달한다.",
          required: true,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "signal-school" },
        { outcomeId: "success", targetSceneId: "flooded-convoy" },
      ],
      encounterParameters: {
        durationMs: 45_000,
      },
      gameplayTuning: {
        startingResources: 80,
        interventionBudget: 4,
        simulationSpeed: 0.75,
      },
    },
    {
      identity: { id: "flooded-convoy", kind: "operation" },
      copy: {
        title: "제1작전 · 새벽의 보급선",
        subtitle: "협곡 7번 / 가장 필요한 사람만 소식을 못 들었다",
        briefing:
          "폭우가 다리를 삼키기 전에 의약품 수송대를 전방 초소로 보낸다. 넓게 알릴수록 보고는 늦어진다.",
        lesson: "정보가 닿는 범위와 메시지가 도착하는 시간을 함께 조정한다.",
        success: "정찰대와 수송대가 출발 전에 경로를 대조해 안전한 길을 골랐다.",
        failure: "끊긴 다리는 모두에게 정확히 보고되었다. 수송대만 빼고.",
      },
      presentation: {
        mapId: "flooded-valley-route",
        backdropId: "rainy-valley-dawn",
        soundtrackId: "convoy-in-the-rain",
        accentColor: "#4aa3c7",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "convoy-departure-window",
          timeMs: 0,
          headline: "일출 전 출발",
          description: "수송대는 가장 짧은 북쪽 길을 향해 시동을 건다.",
          reports: [
            {
              id: "convoy-baek-departure",
              officerId: "major-baek",
              tone: "confident",
              text: "길이 잠잠하니 출발하겠습니다. 물도 우리보다 느립니다.",
            },
          ],
          threats: [],
        },
        {
          id: "convoy-bridge-warning",
          timeMs: 16_000,
          headline: "북쪽 교량 유실",
          description: "정찰 보고가 넓은 배포망을 돌며 수송대보다 늦게 움직인다.",
          reports: [
            {
              id: "convoy-kim-fanout",
              officerId: "lieutenant-kim",
              tone: "urgent",
              text: "교량 유실 보고를 취사반까지 공유했습니다. 수송대 채널은 전송 대기 8번입니다.",
            },
          ],
          threats: [
            {
              id: "convoy-flooded-bridge",
              kind: "flood",
              lane: "north",
              severity: "high",
              telegraphDurationMs: 7_000,
            },
          ],
        },
        {
          id: "convoy-route-cross-check",
          timeMs: 34_000,
          headline: "출발 전 경로 대조",
          description: "정찰대와 수송대가 같은 지도를 놓고 남쪽 임시 도로를 확인한다.",
          reports: [
            {
              id: "convoy-han-route",
              officerId: "captain-han",
              tone: "relieved",
              text: "수위 시각과 차량 위치를 맞췄습니다. 남쪽 길은 아직 살아 있습니다.",
            },
          ],
          threats: [
            {
              id: "convoy-rising-ford",
              kind: "flood",
              lane: "south",
              severity: "medium",
              telegraphDurationMs: 9_000,
            },
          ],
        },
      ],
      objectives: [
        {
          id: "deliver-medical-convoy",
          description: "의약품 수송 차량 세 대를 전방 초소에 도착시킨다.",
          required: true,
        },
        {
          id: "preserve-civilian-bridge",
          description: "민간 교량에 추가 피해를 내지 않는다.",
          required: true,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "flooded-convoy" },
        { outcomeId: "success", targetSceneId: "misaddressed-artillery" },
      ],
      encounterParameters: {
        durationMs: 72_000,
      },
      gameplayTuning: {
        startingResources: 74,
        interventionBudget: 4,
        simulationSpeed: 0.9,
      },
    },
    {
      identity: { id: "misaddressed-artillery", kind: "operation" },
      copy: {
        title: "제2작전 · 축포는 적진 쪽으로",
        subtitle: "쌍둥이 포대 / 서로 먼저 하시라며 양보 중",
        briefing:
          "두 포대가 같은 표적을 받았다. 현장 판단 범위를 정하지 않으면 전투 포대는 양보하고 의장대는 예정대로 발사한다.",
        lesson: "권한 경계는 주도권을 없애지 않고 충돌만 위로 올려보내야 한다.",
        success: "현장 포대가 경계 안의 표적을 처리하고 충돌 좌표만 지휘부에 올렸다.",
        failure: "전투 포대는 정중히 양보했고 의장대의 축포만 정확한 시각에 날아갔다.",
      },
      presentation: {
        mapId: "twin-battery-ridge",
        backdropId: "artillery-ridge-noon",
        soundtrackId: "courteous-cannonade",
        accentColor: "#e28b44",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "artillery-shared-order",
          timeMs: 0,
          headline: "동일 표적, 동일 권한",
          description: "두 포대가 동시에 사격 승인을 받는다.",
          reports: [
            {
              id: "artillery-han-boundary",
              officerId: "captain-han",
              tone: "cautious",
              text: "양쪽 승인 문서가 모두 유효합니다. 어느 쪽이 우선인지 재확인이 필요합니다.",
            },
          ],
          threats: [],
        },
        {
          id: "artillery-polite-deadlock",
          timeMs: 14_000,
          headline: "먼저 쏘십시오",
          description: "두 포대가 같은 주파수에서 서로에게 발사권을 양보한다.",
          reports: [
            {
              id: "artillery-kim-courtesy",
              officerId: "lieutenant-kim",
              tone: "deadpan",
              text: "양보 의사 여섯 건을 정확히 중계했습니다. 아직 발사 의사는 없습니다.",
            },
          ],
          threats: [
            {
              id: "artillery-ceremonial-volley",
              kind: "artillery",
              lane: "center",
              severity: "critical",
              telegraphDurationMs: 6_000,
            },
          ],
        },
        {
          id: "artillery-local-command",
          timeMs: 30_000,
          headline: "경계 안에서는 즉시 사격",
          description: "백돌격 소령이 현장 표적을 맡고 겹친 좌표 하나만 상급부대에 올린다.",
          reports: [
            {
              id: "artillery-baek-fire",
              officerId: "major-baek",
              tone: "confident",
              text: "제 구역 표적은 제가 처리합니다. 겹친 좌표 하나만 확인해 주십시오.",
            },
          ],
          threats: [
            {
              id: "artillery-false-coordinate",
              kind: "misinformation",
              lane: "north",
              severity: "high",
              telegraphDurationMs: 8_000,
            },
          ],
        },
      ],
      objectives: [
        {
          id: "silence-hostile-battery",
          description: "적 포대를 사격 창 안에 제압한다.",
          required: true,
        },
        {
          id: "prevent-ceremonial-fire",
          description: "의장대가 전투 좌표로 축포를 발사하지 않게 한다.",
          required: true,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "misaddressed-artillery" },
        { outcomeId: "success", targetSceneId: "inspection-ambush" },
      ],
      encounterParameters: {
        durationMs: 78_000,
      },
      gameplayTuning: {
        startingResources: 68,
        interventionBudget: 3,
        simulationSpeed: 1,
      },
    },
    {
      identity: { id: "inspection-ambush", kind: "operation" },
      copy: {
        title: "제3작전 · 사열은 완벽했고 매복도 완벽했다",
        subtitle: "검문소 / 도장보다 급한 경고",
        briefing:
          "열병식 대열이 검문소를 통과한다. 모든 것을 확인하면 아무것도 제시간에 움직이지 못한다.",
        lesson: "검증 역량을 위험한 주장에 우선 배정하고 일상 이동은 계속 흐르게 한다.",
        success: "고위험 경고는 먼저 검증됐고 보급 차량은 멈추지 않았다.",
        failure: "군복과 서명과 차량 도색은 완벽했다. 매복 경고만 마지막 책상에서 기다렸다.",
      },
      presentation: {
        mapId: "inspection-crossroads",
        backdropId: "parade-road-afternoon",
        soundtrackId: "stamp-and-march",
        accentColor: "#d9b64c",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "inspection-gates-open",
          timeMs: 0,
          headline: "사열 대열 진입",
          description: "검문관들이 단추와 서명과 차축 번호를 차례로 확인한다.",
          reports: [
            {
              id: "inspection-han-checklist",
              officerId: "captain-han",
              tone: "confident",
              text: "검사항목 84개를 순서대로 확인하겠습니다. 예외는 마지막 창구입니다.",
            },
          ],
          threats: [],
        },
        {
          id: "inspection-scout-warning",
          timeMs: 17_000,
          headline: "수풀에서 철모 세 개",
          description: "정찰병의 매복 경고가 미완성 서식으로 분류된다.",
          reports: [
            {
              id: "inspection-kim-queue",
              officerId: "lieutenant-kim",
              tone: "urgent",
              text: "매복 경고는 접수됐습니다. 서명 누락으로 일반 보완함 26번에 있습니다.",
            },
          ],
          threats: [
            {
              id: "inspection-hedgerow-ambush",
              kind: "ambush",
              lane: "south",
              severity: "critical",
              telegraphDurationMs: 7_000,
            },
          ],
        },
        {
          id: "inspection-risk-priority",
          timeMs: 36_000,
          headline: "경고 먼저, 단추는 나중",
          description: "고위험 보고가 즉시 대조되고 일상 차량은 간이 검사로 통과한다.",
          reports: [
            {
              id: "inspection-baek-screen",
              officerId: "major-baek",
              tone: "relieved",
              text: "수풀은 비웠고 차량은 계속 갑니다. 단추는 목적지에서도 셀 수 있습니다.",
            },
          ],
          threats: [
            {
              id: "inspection-road-blockage",
              kind: "obstruction",
              lane: "center",
              severity: "medium",
              telegraphDurationMs: 10_000,
            },
          ],
        },
      ],
      objectives: [
        {
          id: "verify-ambush-warning",
          description: "매복 경고를 공격 전에 검증한다.",
          required: true,
        },
        {
          id: "maintain-convoy-throughput",
          description: "보급 차량의 절반 이상을 정지시키지 않는다.",
          required: true,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "inspection-ambush" },
        { outcomeId: "success", targetSceneId: "night-switchboard" },
      ],
      encounterParameters: {
        durationMs: 84_000,
      },
      gameplayTuning: {
        startingResources: 62,
        interventionBudget: 3,
        simulationSpeed: 1.1,
      },
    },
    {
      identity: { id: "night-switchboard", kind: "operation" },
      copy: {
        title: "제4작전 · 모두 연결됨, 서로에게는 아님",
        subtitle: "야간 교환대 / 완벽하게 자세한 오답",
        briefing:
          "밤새 쌓인 전투 결과를 다음 행동 전에 공유한다. 자세한 보고가 반드시 분명한 신호는 아니다.",
        lesson: "피드백의 세부 수준을 줄여 공통된 결과와 다음 판단을 선명하게 만든다.",
        success: "짧은 결과 보고가 공통 상황판을 갱신했고 다음 의도가 같은 전장을 향했다.",
        failure: "모든 장교가 다른 부대의 완전한 보고서를 읽고 틀린 계획을 자신 있게 고쳤다.",
      },
      presentation: {
        mapId: "night-switchboard-grid",
        backdropId: "blackout-headquarters",
        soundtrackId: "crossed-wires-nocturne",
        accentColor: "#8d7ed8",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "switchboard-reports-arrive",
          timeMs: 0,
          headline: "전 회선 보고 시작",
          description: "교환대가 각 부대의 전투 기록을 한꺼번에 연결한다.",
          reports: [
            {
              id: "switchboard-kim-complete",
              officerId: "lieutenant-kim",
              tone: "confident",
              text: "누락 방지를 위해 식단표 부록까지 전 장교에게 전문으로 보냅니다.",
            },
          ],
          threats: [],
        },
        {
          id: "switchboard-crossed-feedback",
          timeMs: 15_000,
          headline: "정확한 보고, 잘못된 부대",
          description: "북쪽 방어 결과가 남쪽 기동 계획을 덮어쓴다.",
          reports: [
            {
              id: "switchboard-baek-wrong-plan",
              officerId: "major-baek",
              tone: "urgent",
              text: "보고대로 북쪽 돌파를 수정했습니다. 제가 남쪽에 있다는 점만 빼면 완벽합니다.",
            },
          ],
          threats: [
            {
              id: "switchboard-signal-fog",
              kind: "communications",
              lane: "command",
              severity: "high",
              telegraphDurationMs: 5_000,
            },
          ],
        },
        {
          id: "switchboard-shared-outcome",
          timeMs: 33_000,
          headline: "한 줄 결과 공유",
          description: "위치, 결과, 다음 위험만 남긴 보고가 공통 상황판을 바로잡는다.",
          reports: [
            {
              id: "switchboard-han-consensus",
              officerId: "captain-han",
              tone: "relieved",
              text: "세 항목이 일치합니다. 이제 모두 같은 밤을 보고 있습니다.",
            },
          ],
          threats: [
            {
              id: "switchboard-decoy-signal",
              kind: "misinformation",
              lane: "north",
              severity: "medium",
              telegraphDurationMs: 8_000,
            },
          ],
        },
      ],
      objectives: [
        {
          id: "align-shared-beliefs",
          description: "다음 행동 전에 세 장교의 전장 인식을 일치시킨다.",
          required: true,
        },
        {
          id: "keep-command-channel-clear",
          description: "지휘 회선의 혼잡도를 한계 아래로 유지한다.",
          required: true,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "night-switchboard" },
        { outcomeId: "success", targetSceneId: "orchard-siege" },
      ],
      encounterParameters: {
        durationMs: 90_000,
      },
      gameplayTuning: {
        startingResources: 56,
        interventionBudget: 2,
        simulationSpeed: 1.2,
      },
    },
    {
      identity: { id: "orchard-siege", kind: "operation" },
      copy: {
        title: "최종작전 · 과수원은 전략 자산이다",
        subtitle: "복합 위기 / 사과 낙하를 포격으로 분류하지 말 것",
        briefing:
          "홍수, 거짓 포격 좌표, 억류된 정찰병, 관개 타이머가 동시에 움직인다. 이번에는 장교들이 스스로 모순을 찾고 다시 계획해야 한다.",
        lesson: "정보, 권한, 검증, 피드백을 결합해 조직이 개입 없이 교차 확인하고 재계획하게 한다.",
        success: "장교들이 출처를 대조하고 권한을 재배치해 민간인과 과수원을 함께 지켰다.",
        failure: "사령부는 떨어지는 사과를 반복 포격으로 확정했고 진짜 포탄은 참고 문서함에 들어갔다.",
      },
      presentation: {
        mapId: "orchard-siege-network",
        backdropId: "orchard-storm-evening",
        soundtrackId: "apples-under-fire",
        accentColor: "#c95c62",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "orchard-compound-crisis",
          timeMs: 0,
          headline: "네 가지 위기 동시 발생",
          description: "침수 도로, 거짓 좌표, 검문소 억류, 관개 경보가 한 상황판에 겹친다.",
          reports: [
            {
              id: "orchard-kim-four-alerts",
              officerId: "lieutenant-kim",
              tone: "urgent",
              text: "경보 네 건을 연결했습니다. 사과 낙하음 31건도 참고로 첨부합니다.",
            },
          ],
          threats: [
            {
              id: "orchard-flood-cutoff",
              kind: "flood",
              lane: "south",
              severity: "high",
              telegraphDurationMs: 8_000,
            },
            {
              id: "orchard-false-barrage",
              kind: "misinformation",
              lane: "command",
              severity: "critical",
              telegraphDurationMs: 6_000,
            },
          ],
        },
        {
          id: "orchard-independent-cross-check",
          timeMs: 19_000,
          headline: "출처가 서로를 확인함",
          description: "장교들이 음향, 정찰 시각, 관개 기록을 직접 대조한다.",
          reports: [
            {
              id: "orchard-han-contradiction",
              officerId: "captain-han",
              tone: "confident",
              text: "포격 좌표와 탄착 시각이 맞지 않습니다. 낙하음은 관개 구역의 사과입니다.",
            },
          ],
          threats: [
            {
              id: "orchard-scout-detention",
              kind: "obstruction",
              lane: "north",
              severity: "high",
              telegraphDurationMs: 9_000,
            },
          ],
        },
        {
          id: "orchard-autonomous-replan",
          timeMs: 41_000,
          headline: "개입 없이 재계획",
          description: "현장 권한이 재배치되고 주민 대피로와 방어선이 함께 열린다.",
          reports: [
            {
              id: "orchard-baek-replan",
              officerId: "major-baek",
              tone: "relieved",
              text: "정찰병은 풀어 줬고 주민은 북쪽 길로 보냅니다. 저는 진짜 포대만 막겠습니다.",
            },
          ],
          threats: [
            {
              id: "orchard-real-artillery",
              kind: "artillery",
              lane: "center",
              severity: "critical",
              telegraphDurationMs: 7_000,
            },
          ],
        },
      ],
      objectives: [
        {
          id: "protect-orchard-civilians",
          description: "과수원 주민을 안전한 북쪽 길로 대피시킨다.",
          required: true,
        },
        {
          id: "enable-autonomous-replan",
          description: "직접 개입 없이 장교들이 모순을 확인하고 방어선을 다시 세우게 한다.",
          required: true,
        },
        {
          id: "preserve-irrigation-system",
          description: "관개 시설을 작전 종료까지 유지한다.",
          required: false,
        },
      ],
      transitions: [
        { outcomeId: "retry", targetSceneId: "orchard-siege" },
        { outcomeId: "success", targetSceneId: "greenhouse-epilogue" },
      ],
      encounterParameters: {
        durationMs: 108_000,
      },
      gameplayTuning: {
        startingResources: 48,
        interventionBudget: 0,
        simulationSpeed: 1.3,
      },
    },
    {
      identity: { id: "greenhouse-epilogue", kind: "epilogue" },
      copy: {
        title: "졸업 · 오늘의 작전은 바질에 물 주기",
        subtitle: "온실 / 무전기는 주방 타이머로 전환됨",
        briefing:
          "전장은 스스로 계획을 고친다. 지휘관의 마지막 일정은 햇빛 드는 선반에서 시작한다.",
        lesson: "자율적으로 움직이는 조직에 더 할 일이 없다면 다른 삶으로 돌아가도 된다.",
        success: "보고는 됐어. 잘 자라고 있네.",
        failure: "다시 피울 사이렌은 없다.",
      },
      presentation: {
        mapId: "quiet-greenhouse",
        backdropId: "greenhouse-morning",
        soundtrackId: "basil-on-the-sill",
        accentColor: "#83b86b",
      },
      mapTopology: firstSpatialMap,
      guidance: [],
      beats: [
        {
          id: "greenhouse-kitchen-timer",
          timeMs: 0,
          headline: "무전 종료, 타이머 시작",
          description: "오래된 지휘 무전기가 바질 물 주는 시간을 알린다.",
          reports: [
            {
              id: "greenhouse-baek-rest",
              officerId: "major-baek",
              tone: "relieved",
              text: "명령이 없으니 먼저 화분을 옮기겠습니다. 이번에는 햇빛 쪽입니다.",
            },
            {
              id: "greenhouse-han-moisture",
              officerId: "captain-han",
              tone: "deadpan",
              text: "흙의 수분은 충분합니다. 두 번 확인했지만 물은 한 번만 주겠습니다.",
            },
            {
              id: "greenhouse-kim-quiet",
              officerId: "lieutenant-kim",
              tone: "relieved",
              text: "온실 전체에 전할 보고는 없습니다. 창문만 열어 두겠습니다.",
            },
          ],
          threats: [],
        },
      ],
      objectives: [
        {
          id: "water-the-basil",
          description: "바질 화분에 물을 준다.",
          required: true,
        },
      ],
      transitions: [],
      encounterParameters: {
        durationMs: 0,
      },
      gameplayTuning: {
        startingResources: 0,
        interventionBudget: 0,
        simulationSpeed: 1,
      },
    },
  ],
} satisfies CampaignDefinition;

assertValidCampaignDefinition(completeCampaign);
