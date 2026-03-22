# BoardRoom - AI 부서별 가상 오피스

## 프로젝트 개요
게더타운 스타일의 2D 픽셀아트 가상 오피스에서 AI 부서 팀원들이 사용자의 업무 요청에 대해 **부서 단위로 호출**되어 자율 토론하고, 문서 산출물을 생성하는 웹 애플리케이션.

## 기술 스택
- **프론트엔드**: Phaser 3 (2D 게임 엔진) + Vanilla TypeScript + Vite
- **백엔드**: Node.js + Express + TypeScript (tsx로 실행)
- **AI**: Claude CLI (`claude -p`) — API 키 불필요, `--output-format stream-json --verbose`로 스트리밍
- **통신**: Server-Sent Events (SSE) - 실시간 단방향 스트리밍
- **마크다운**: marked 라이브러리로 문서 렌더링
- **영속화**: `data/sessions.json`에 세션 히스토리 저장

## 개발 환경
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm run dev    # Vite :5173 + Express :3001
npm run build  # 빌드
```

## 아키텍처

### 데이터 흐름
```
사용자 입력 → POST /api/task → orchestrator.startRoundtable()
  → analyzeTaskDepartments()로 관련 부서 판단
  → 해당 부서 팀장 브리핑 (이전 대화 컨텍스트 포함)
  → 팀원 분석 (부서 내부 회의)
  → 부서 내 토론 라운드
  → [두 부서 모두 필요하면] 부서 간 합동 회의
  → SSE 이벤트 → GameBridge → Phaser (캐릭터 이동/말풍선)
  → Sidebar UI (채팅 로그, 산출물)
  → 세션 저장 (data/sessions.json)
```

### 핵심 모듈

| 모듈 | 파일 | 역할 |
|------|------|------|
| **오케스트레이터** | `server/agents/orchestrator.ts` | 부서 기반 토론 엔진. `analyzeTaskDepartments()`, `selectDepartmentSpeakers()`, `bringAgent()` |
| **페르소나** | `server/agents/personas.ts` | 부서별 팀원 시스템 프롬프트 (한국어). `DEPARTMENTS`, `AGENT_ORDER` |
| **세션 스토어** | `server/store.ts` | 인메모리 상태 + 파일 기반 세션 영속화. `saveSession()`, `getRecentContext()` |
| **SSE 라우트** | `server/routes/chat.ts` | `GET /api/stream`, `POST /api/task`, `/api/continue`, `/api/finalize`, `/api/stop`, `GET /api/sessions` |
| **게임 브릿지** | `src/services/GameBridge.ts` | SSE → Phaser 변환. 개별 에이전트 이동/로밍 관리 |
| **오피스 씬** | `src/game/scenes/OfficeScene.ts` | 메인 Phaser 씬. 타일맵, 캐릭터, 말풍선 |
| **에이전트 매니저** | `src/game/characters/AgentManager.ts` | 자유 로밍 + 부서/합동 미팅 합류. `addAgentToMeeting()`, `startWandering()` |
| **에이전트 스프라이트** | `src/game/characters/Agent.ts` | 스프라이트(2.5x), 라벨, 애니메이션, `stopMovement()` |
| **사이드바** | `src/ui/Sidebar.ts` | 채팅 로그, 문서 카드, 토큰 사용량 표시, 주제 배너 |

### 회의 진행 (부서 기반)
1. **부서 분석** - `analyzeTaskDepartments()`가 업무 분석 → 관련 부서 판단
2. **팀장 브리핑** - 해당 부서 팀장이 업무 브리핑 (이전 대화 컨텍스트 포함)
3. **팀원 분석** - 부서 내 팀원들이 전문 분야 관점 분석
4. **부서 내 토론** - 부서 팀원 간 토론 라운드
5. **부서 간 합동 회의** - 두 부서 모두 참여 시, 팀장들이 부서 간 협업 논의
6. **산출물 작성** - 참여 팀원이 각자 책상에서 문서 작성

### SSE 이벤트 타입 (`server/agents/types.ts`)
- `task_accepted` - 태스크 접수
- `phase_change` - 회의 단계 변경
- `department_activated` - 부서 활성화 (department, agents)
- `agents_selected` - 현재 참여 팀원 목록 (동적 업데이트)
- `agent_moving` - 개별 캐릭터 이동 (meeting/desk)
- `agent_speak_start/token/end` - 발언 스트리밍
- `usage_update` - 토큰 사용량 (inputTokens, outputTokens, totalCalls, costUsd)
- `document_ready` - 산출물 완성
- `task_complete` - 회의 완료
- `error` - 오류

### 맵 구조 (32×24 타일, 각 타일 32px)
```
+----------------------------------------------+
|  마케팅부서 (상단 좌측)     |  공유 회의 공간   |
|  [팀장] [콘텐츠] [그로스]   |  (라운지)        |
|  desk    desk     desk     |                  |
|  (공용 공간)                |                  |
+-------- 문 ----------------+                  |
|  (공용 공간)                |  오픈 공간       |
|  개발부서 (하단 좌측)       |                  |
|  [팀장] [백엔드] [프론트]   |                  |
|  desk    desk     desk     |                  |
+----------------------------------------------+
```
- 좌측: 부서별 영역 (y=12 기준 상/하 분리, 문 있음)
- 우측: 공유 회의 공간 + 오픈 로밍 영역
- 캐릭터 자유 로밍 (70% 부서 근처, 30% 공용 공간)
- 미팅 시 라운지에 원형 배치 (`getMeetingPositions`)

## 부서 및 에이전트 정보

### 마케팅부서
| ID | 이름 | 직책 | 색상 | 산출물 |
|----|------|------|------|--------|
| `mkt_lead` | Jiyeon (지연) | 마케팅 팀장 | `#ec4899` (pink) | Marketing Strategy Report |
| `mkt_content` | Seoha (서하) | 콘텐츠 전략가 | `#f59e0b` (amber) | Content Strategy Plan |
| `mkt_growth` | Minjun (민준) | 그로스 해커 | `#8b5cf6` (violet) | Growth Analysis Report |

### 개발부서
| ID | 이름 | 직책 | 색상 | 산출물 |
|----|------|------|------|--------|
| `dev_lead` | Hyunwoo (현우) | 개발 팀장 | `#3b82f6` (blue) | Technical Architecture Document |
| `dev_backend` | Eunji (은지) | 백엔드 개발자 | `#10b981` (emerald) | Backend Implementation Plan |
| `dev_frontend` | Taehyun (태현) | 프론트엔드 개발자 | `#06b6d4` (cyan) | Frontend Implementation Plan |

## 그래픽 시스템
- 모든 에셋은 **런타임 프로그래밍 생성** (외부 이미지 없음)
- `BootScene`에서 Canvas API로 타일/캐릭터 텍스처 생성
- 캐릭터: 16×20px 원본, **2.5x 스케일** 표시 (40×50px)
- 라벨 오프셋: 이름 y-42, 뱃지 y-26, 말풍선 y-55, 발화 인디케이터 x+18/y-34
- 타일: 16×16px, 2배 스케일로 표시 (DISPLAY_TILE = 32)
- Phaser `pixelArt: true` 설정으로 안티앨리어싱 방지

## 대화 컨텍스트 영속화
- **저장**: `data/sessions.json`에 최근 50개 세션 저장
- **자동 저장**: 회의 완료(`finalizeDocuments`) 또는 중단(`stopAll`) 시 자동 저장
- **컨텍스트 주입**: 새 회의 시작 시 최근 3개 세션의 요약이 팀장 브리핑에 포함
- **API**: `GET /api/sessions` (목록), `GET /api/sessions/:id` (상세)

## 토큰 관리
- **사용량 추적**: 매 Claude CLI 호출 후 `result` 이벤트에서 usage/cost_usd 파싱
- **응답 제한**: 토론 `--max-budget-usd 0.05`, 문서 `--max-budget-usd 0.25`
- **컨텍스트 절약**: 이전 라운드 200자 압축, 최신 라운드만 전문 유지
- **UI 표시**: 사이드바 usage-bar

## 코드 규칙
- 서버 import에 `.js` 확장자 필수 (ESM)
- 한국어로 모든 UI 텍스트와 시스템 프롬프트 작성
- AI 호출: Claude CLI (`claude -p`) 사용, API 키 불필요
- 에이전트 순서: `AGENT_ORDER` (마케팅 → 개발 순)
- 발언 순서는 `selectDepartmentSpeakers()`가 부서 단위로 동적 결정

## 주요 의존관계
- `AgentManager` → `Agent.ts`, `zones.ts`, `characterPixels.ts`
- `OfficeScene` → `OfficeMap.ts`, `AgentManager`, `tilePixels.ts`
- `GameBridge` → `EventStream`, `OfficeScene`
- `Sidebar` → `marked` (마크다운 렌더링), DOM API
- `orchestrator.ts` → Claude CLI, `personas.ts`, `store.ts`

## 확장 포인트
- 새 부서 추가: `personas.ts`에 DEPARTMENTS/페르소나 추가 → `zones.ts`에 DEPARTMENT_ZONES/좌석 추가 → `characterPixels.ts`에 캐릭터 추가 → `OfficeMap.ts` 맵 확장
- 새 팀원 추가: `personas.ts`에 페르소나 추가 → `zones.ts`에 좌석/로밍웨이포인트 추가 → `characterPixels.ts`에 색상 추가
- 맵 변경: `OfficeMap.ts`의 floorLayer/furniture 수정 → `zones.ts` 좌표 업데이트
- UI 테마: `public/style.css` 수정
