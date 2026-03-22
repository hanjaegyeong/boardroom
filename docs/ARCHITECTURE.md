# BoardRoom 아키텍처 문서

## 1. 시스템 개요

BoardRoom은 AI 기반 가상 C-suite 팀이 사용자의 비즈니스 요청을 자율적으로 논의하고 산출물을 생성하는 시스템입니다.

### 핵심 가치
- **시각적 몰입감**: 게더타운 스타일의 2D 픽셀아트 오피스에서 캐릭터들이 실제로 움직이며 소통
- **자율적 협업**: 6명의 AI 임원이 각자의 전문성으로 독립적 분석 후 토론을 통해 합의 도출
- **실질적 산출물**: 토론으로 끝나지 않고 각 임원별 전문 보고서를 마크다운으로 생성

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │     Phaser 3 Game    │  │      HTML/CSS UI         │  │
│  │                      │  │                          │  │
│  │  BootScene           │  │  Sidebar                 │  │
│  │    → 텍스처 생성       │  │    → TaskInput          │  │
│  │                      │  │    → ChatLog             │  │
│  │  OfficeScene         │  │    → DocumentViewer      │  │
│  │    → 타일맵 렌더       │  │    → PhaseIndicator     │  │
│  │    → AgentManager    │  │                          │  │
│  │    → SpeechBubbles   │  │  DocumentModal           │  │
│  │                      │  │    → Markdown Render     │  │
│  └───────────┬──────────┘  └─────────────┬────────────┘  │
│              │                           │                │
│              └──────────┬────────────────┘                │
│                         │                                 │
│                    GameBridge                              │
│                         │                                 │
│                    EventStream (SSE Client)                │
│                         │                                 │
└─────────────────────────┼─────────────────────────────────┘
                          │ SSE (Server-Sent Events)
                          │
┌─────────────────────────┼─────────────────────────────────┐
│                    Express Server (:3001)                  │
│                         │                                 │
│  ┌──────────────────────┴──────────────────────────────┐  │
│  │              Routes                                  │  │
│  │  POST /api/task     → 태스크 접수                      │  │
│  │  GET  /api/stream   → SSE 스트리밍                     │  │
│  │  GET  /api/documents → 산출물 조회                     │  │
│  │  GET  /api/transcript → 토론 기록                      │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                 │
│  ┌──────────────────────┴──────────────────────────────┐  │
│  │           Orchestrator (라운드테이블 엔진)              │  │
│  │                                                      │  │
│  │  Phase 1: Gathering (이동)                            │  │
│  │  Phase 2: CEO Briefing (브리핑)                       │  │
│  │  Phase 3: Individual Analysis (개별분석)               │  │
│  │  Phase 4: Discussion Round 1 (토론1)                  │  │
│  │  Phase 5: Discussion Round 2 (합의)                   │  │
│  │  Phase 6: Document Generation (산출물)                │  │
│  └──────────┬───────────────────────────┬──────────────┘  │
│             │                           │                 │
│  ┌──────────┴──────────┐  ┌─────────────┴──────────────┐  │
│  │   Claude API        │  │      SessionStore          │  │
│  │   (Anthropic SDK)   │  │  - conversations (per agent)│  │
│  │   - 6 personas      │  │  - transcript              │  │
│  │   - Streaming       │  │  - documents               │  │
│  │   - max 800/4096 tk │  │  - currentTask             │  │
│  └─────────────────────┘  └────────────────────────────┘  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 3. 서버 상세

### 3.1 오케스트레이터 (orchestrator.ts)

핵심 비즈니스 로직. 사용자의 태스크를 받아 6명의 AI 에이전트간 토론을 조율합니다.

#### 실행 흐름

```
runRoundtable(task, emit)
│
├─ 1. store.reset() - 이전 세션 초기화
├─ 2. emit(task_accepted)
│
├─ 3. Phase: Gathering
│     emit(agent_moving × 6)
│     sleep(3000) - 이동 애니메이션 대기
│
├─ 4. Phase: CEO Briefing
│     getAgentResponse('ceo', briefing_prompt)
│       └─ Claude API streaming → emit(speak_start/token/end)
│
├─ 5. Phase: Individual Analysis
│     for each [cto, cmo, cfo, cso, cdo]:
│       getAgentResponse(agent, analysis_prompt)
│       └─ 각 에이전트가 CEO 브리핑 + 원래 태스크를 받음
│
├─ 6. Phase: Discussion Round 1
│     for each agent in AGENT_ORDER:
│       getAgentResponse(agent, other_opinions_prompt)
│       └─ 다른 임원들의 의견을 컨텍스트로 받아 피드백
│
├─ 7. Phase: Discussion Round 2 (Convergence)
│     for each agent in AGENT_ORDER:
│       getAgentResponse(agent, convergence_prompt)
│       └─ 합의사항, 리스크, 액션아이템 정리
│
├─ 8. Phase: Document Generation
│     emit(agent_moving → desk × 6)
│     Promise.all([generateDocument() × 6])
│       └─ 각 에이전트가 전체 토론 로그를 받아 보고서 생성
│
└─ 9. emit(task_complete)
```

#### 에이전트별 대화 관리

각 에이전트는 독립적인 대화 이력을 유지합니다:

```typescript
// store.conversations = Map<agentId, Message[]>
// 에이전트 B가 에이전트 A의 말을 "듣는" 방법:
// A의 출력이 B의 대화에 user 메시지로 주입됨

Agent A conversation:  [user: task] → [assistant: A의 분석]
Agent B conversation:  [user: task + "A가 말하기를..."] → [assistant: B의 분석]
```

#### API 호출 패턴

```typescript
// 토론 중 (800 토큰, 스트리밍)
client.messages.stream({
  model: 'claude-sonnet-4-5-20250514',
  max_tokens: 800,
  system: persona.systemPrompt,  // 한국어 역할 프롬프트
  messages: agentConversationHistory,
});

// 문서 생성 (4096 토큰, 비스트리밍)
client.messages.create({
  model: 'claude-sonnet-4-5-20250514',
  max_tokens: 4096,
  system: persona.systemPrompt + documentMode,
  messages: [{ role: 'user', content: fullDiscussionLog }],
});
```

### 3.2 페르소나 시스템 (personas.ts)

각 페르소나의 시스템 프롬프트 구조:
1. **역할과 책임** - 무엇을 담당하는지
2. **성격과 커뮤니케이션 스타일** - 어떻게 소통하는지
3. **의사결정 프레임워크** - 무엇을 기준으로 판단하는지
4. **다른 임원들과의 상호작용** - 누구에게 무엇을 물어보는지
5. **응답 규칙** - 한국어, 3-5문장, 구체적 의견

### 3.3 SSE 통신 (chat.ts)

```typescript
// 서버 → 클라이언트 단방향 스트리밍
const sseClients: Set<Response> = new Set();

function broadcast(event: SSEEvent) {
  const data = JSON.stringify(event);
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}
```

클라이언트는 `EventSource`로 연결, 자동 재연결(exponential backoff).

---

## 4. 클라이언트 상세

### 4.1 Phaser 게임 레이어

#### 씬 구조
```
BootScene (텍스처 생성) → OfficeScene (게임 플레이)
```

#### 텍스처 생성 (BootScene)
- 모든 타일/캐릭터 에셋을 Canvas API로 런타임 생성
- 외부 이미지 파일 의존성 0
- 타일: 16×16px 픽셀 배열 → Canvas → Phaser 텍스처
- 캐릭터: 16×20px, 4방향 × 3프레임 → 스프라이트시트 → 애니메이션

#### 캐릭터 상태 머신
```
IDLE ←→ WALKING ←→ TALKING
  ↑                    ↕
  └──── TYPING ────────┘
```

#### 이동 시스템
- 웨이포인트 기반 경로 (A* 아님)
- 경로: 책상 → 복도(x=7) → 커넥터(x=13) → 회의실 입구(x=15,y=5) → 배정된 좌석
- Phaser Tween으로 부드러운 이동 (3 tiles/sec)
- 도착 시 idle 애니메이션 복귀

### 4.2 GameBridge

SSE 이벤트와 Phaser 씬을 연결하는 미들웨어:

```
SSE Event                  →  Game Action
─────────────────────────────────────────
agent_moving(conference)   →  agentManager.moveToConference()
agent_moving(desk)         →  agentManager.moveToDesks()
agent_speak_start          →  agentManager.setSpeaking(id)
agent_speak_token          →  scene.showSpeechBubble(최근 50자)
agent_speak_end            →  agentManager.stopAllSpeaking()
document_ready             →  agentManager.setTyping(id)
task_complete              →  stopAll + hideAllBubbles
```

중복 방지: `agent_moving`이 6번 발생하지만 `moveToConference()`는 1번만 호출.

### 4.3 UI 레이어 (Sidebar)

```
┌──────────────────────┐
│  BoardRoom   [phase] │  ← 헤더 + 현재 단계 표시
├──────────────────────┤
│  [태스크 입력]        │  ← textarea + 제출 버튼
│  [회의 시작]          │
├──────────────────────┤
│  --- CEO 브리핑 ---   │  ← 단계 구분선
│  [CEO] Alexandra     │  ← 색상 코딩된 메시지
│  분석 내용...         │     토큰 단위 스트리밍
│                      │
│  [CTO] Marcus        │
│  기술 관점...         │
│  ...                 │  ← 스크롤 가능, 자동 스크롤
├──────────────────────┤
│  산출물               │
│  📄 CEO 보고서        │  ← 클릭 → 모달 (marked 렌더링)
│  📄 CTO 보고서        │     다운로드 (.md 파일)
└──────────────────────┘
```

---

## 5. 맵 시스템

### 5.1 타일맵 (32×24, 각 32px)

```
좌표계: (0,0) = 좌상단
x축 →, y축 ↓

구역:
(0-6, 0-6)   : CEO 사무실 + CDO 사무실
(0-6, 7-12)  : CTO 사무실 + CMO 사무실
(0-6, 13-18) : CFO 사무실 + CSO 사무실
(7, 전체)     : 복도
(14, 0-9)    : 벽 (사무실/회의실 경계)
(15-24, 1-9) : 회의실 (카펫)
(15-24, 10+) : 빈 공간 (확장 가능)
```

### 5.2 에이전트 좌석 배치

| Agent | 책상 | 의자(시작위치) | 회의석 |
|-------|------|---------------|--------|
| CEO | (3,3) | (3,4) | (18,4) |
| CTO | (3,9) | (3,10) | (17,3) |
| CMO | (9,9) | (9,10) | (21,3) |
| CFO | (3,15) | (3,16) | (17,7) |
| CSO | (9,15) | (9,16) | (21,7) |
| CDO | (9,3) | (9,4) | (19,8) |

---

## 6. API 엔드포인트

| Method | Path | 설명 | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/stream` | SSE 연결 | - | `text/event-stream` |
| POST | `/api/task` | 태스크 제출 | `{task: string}` | `{status, task}` |
| GET | `/api/transcript` | 토론 기록 | - | `TranscriptEntry[]` |
| GET | `/api/documents` | 산출물 목록 | - | `Document[]` (content 제외) |
| GET | `/api/documents/:id` | 산출물 상세 | - | `Document` (content 포함) |
| GET | `/api/health` | 헬스체크 | - | `{status, timestamp}` |

---

## 7. 비용 고려사항

1회 태스크 실행 시 Claude API 호출:
- CEO 브리핑: 1회
- 개별 분석: 5회
- 토론 라운드 1: 6회
- 토론 라운드 2: 6회
- 문서 생성: 6회
- **총 24회 API 호출** (Sonnet 기준)

토큰 사용 예상:
- 토론: ~800 출력 토큰 × 18회 = ~14,400 토큰
- 문서: ~2,000 출력 토큰 × 6회 = ~12,000 토큰
- 입력 토큰: 시스템 프롬프트 + 컨텍스트 누적

---

## 8. 향후 확장 방향

### 단기
- [ ] 영속 저장소 (SQLite/PostgreSQL)로 세션 저장
- [ ] 캐릭터 커스터마이징 (이름, 역할, 성격)
- [ ] 토론 중 사용자 개입 (의견 추가, 방향 수정)
- [ ] 프롬프트 캐싱으로 API 비용 절감

### 중기
- [ ] 다중 사용자 지원 (WebSocket)
- [ ] 이전 회의 기록 참조 기능
- [ ] 외부 도구 사용 (웹 검색, 데이터 분석)
- [ ] 산출물 포맷 다양화 (PDF, 슬라이드)

### 장기
- [ ] 커스텀 에이전트 팀 구성
- [ ] 프로젝트 관리 기능 (태스크 트래킹)
- [ ] 외부 서비스 연동 (Slack, Notion, Jira)
- [ ] 에이전트간 비동기 소통 (이메일, 메시지)
