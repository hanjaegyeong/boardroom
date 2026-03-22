# BoardRoom - AI C-Suite Virtual Office

## 프로젝트 개요
게더타운 스타일의 2D 픽셀아트 가상 오피스에서 AI C-suite 캐릭터들이 사용자의 업무 요청에 대해 **동적으로 호출**되어 자율 토론하고, 문서 산출물을 생성하는 웹 애플리케이션.

## 기술 스택
- **프론트엔드**: Phaser 3 (2D 게임 엔진) + Vanilla TypeScript + Vite
- **백엔드**: Node.js + Express + TypeScript (tsx로 실행)
- **AI**: Claude CLI (`claude -p`) — API 키 불필요, `--output-format stream-json --verbose`로 스트리밍
- **통신**: Server-Sent Events (SSE) - 실시간 단방향 스트리밍
- **마크다운**: marked 라이브러리로 문서 렌더링

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
  → CEO 브리핑 → selectNextSpeakers()로 필요 전문가 동적 호출
  → 호출된 에이전트만 토론 참여 (Wave 1 → Wave 2 추가 호출 가능)
  → SSE 이벤트 → GameBridge → Phaser (캐릭터 이동/말풍선)
  → Sidebar UI (채팅 로그, 산출물)
```

### 핵심 모듈

| 모듈 | 파일 | 역할 |
|------|------|------|
| **오케스트레이터** | `server/agents/orchestrator.ts` | 동적 에이전트 호출 + 토론 엔진. `selectNextSpeakers()`, `bringAgent()`, 토큰 추적 |
| **페르소나** | `server/agents/personas.ts` | C-suite 시스템 프롬프트 (한국어). `AGENT_ORDER` 배열 |
| **세션 스토어** | `server/store.ts` | 인메모리 상태. 대화 이력, 트랜스크립트, 산출물 |
| **SSE 라우트** | `server/routes/chat.ts` | `GET /api/stream`, `POST /api/task`, `POST /api/continue`, `POST /api/finalize`, `POST /api/stop` |
| **게임 브릿지** | `src/services/GameBridge.ts` | SSE → Phaser 변환. 개별 에이전트 이동/로밍 관리 |
| **오피스 씬** | `src/game/scenes/OfficeScene.ts` | 메인 Phaser 씬. 타일맵, 캐릭터, 말풍선, 비용 버블 |
| **에이전트 매니저** | `src/game/characters/AgentManager.ts` | 자유 로밍 + 동적 미팅 합류. `addAgentToMeeting()`, `startWandering()` |
| **에이전트 스프라이트** | `src/game/characters/Agent.ts` | 스프라이트(2.5x), 라벨, 애니메이션, `stopMovement()` |
| **사이드바** | `src/ui/Sidebar.ts` | 채팅 로그, 문서 카드, 토큰 사용량 표시, 주제 배너 |

### 회의 진행 (동적 호출 방식)
1. **CEO 브리핑** - CEO가 업무 분석 및 팀 브리핑
2. **전문가 호출 (Wave 1)** - `selectNextSpeakers()`가 논의 맥락 분석 → 필요한 임원만 호출
3. **개별 분석** - 호출된 임원이 전문 분야 관점 분석
4. **토론 라운드** - 참여 임원 토론 → 새 사안 발생 시 추가 전문가 호출 (Wave 2)
5. **산출물 작성** - 참여한 임원만 각자 책상에서 문서 작성

### SSE 이벤트 타입 (`server/agents/types.ts`)
- `task_accepted` - 태스크 접수
- `phase_change` - 회의 단계 변경
- `agents_selected` - 현재 참여 임원 목록 (동적 업데이트)
- `agent_moving` - 개별 캐릭터 이동 (meeting/desk)
- `agent_speak_start/token/end` - 발언 스트리밍
- `usage_update` - 토큰 사용량 (inputTokens, outputTokens, totalCalls, costUsd)
- `document_ready` - 산출물 완성
- `task_complete` - 회의 완료
- `error` - 오류

### 맵 구조 (32×24 타일, 각 타일 32px)
```
+------+------+--+--------------------+
| CEO  | CDO  |  |                    |
| 사무실 | 사무실 |  |     Lounge         |
+------+------+  |  (오픈 공간, 미팅용)  |
| CTO  | CMO  |  |                    |
| 사무실 | 사무실 |  +--------------------+
+------+------+  |
| CFO  | CSO  |  |     (오픈 공간)      |
| 사무실 | 사무실 |  |                    |
+------+------+--+--------------------+
```
- 회의실 벽(x=14) 제거 → 오픈 라운지
- 캐릭터 자유 로밍 (70% 사무실 근처, 30% 공용 공간)
- 미팅 시 라운지에 원형 배치 (`getMeetingPositions`)

## 에이전트 캐릭터 정보

| ID | 이름 | 직책 | 색상 | 산출물 |
|----|------|------|------|--------|
| `ceo` | Alexandra | CEO | `#f59e0b` (amber) | Executive Summary & Action Plan |
| `cto` | Marcus | CTO | `#3b82f6` (blue) | Technical Architecture Proposal |
| `cmo` | Sofia | CMO | `#ec4899` (pink) | Marketing Strategy Brief |
| `cfo` | James | CFO | `#10b981` (emerald) | Financial Projection & Budget Plan |
| `cso` | Elena | CSO | `#8b5cf6` (violet) | Strategic Analysis Report |
| `cdo` | David | CDO | `#06b6d4` (cyan) | Data Strategy & KPI Framework |

## 그래픽 시스템
- 모든 에셋은 **런타임 프로그래밍 생성** (외부 이미지 없음)
- `BootScene`에서 Canvas API로 타일/캐릭터 텍스처 생성
- 캐릭터: 16×20px 원본, **2.5x 스케일** 표시 (40×50px)
- 라벨 오프셋: 이름 y-42, 뱃지 y-26, 말풍선 y-55, 발화 인디케이터 x+18/y-34
- 타일: 16×16px, 2배 스케일로 표시 (DISPLAY_TILE = 32)
- Phaser `pixelArt: true` 설정으로 안티앨리어싱 방지

## 토큰 관리
- **사용량 추적**: 매 Claude CLI 호출 후 `result` 이벤트에서 usage/cost_usd 파싱
- **응답 제한**: 토론 `--max-tokens 800`, 문서 `--max-tokens 4096`
- **컨텍스트 절약**: 이전 라운드 200자 압축, 최신 라운드만 전문 유지
- **UI 표시**: 사이드바 usage-bar + 게임 내 cost bubble (accountant 캐릭터)

## 코드 규칙
- 서버 import에 `.js` 확장자 필수 (ESM)
- 한국어로 모든 UI 텍스트와 시스템 프롬프트 작성
- AI 호출: Claude CLI (`claude -p`) 사용, API 키 불필요
- 에이전트 순서 기본값: CEO → CTO → CMO → CFO → CSO → CDO (`AGENT_ORDER`)
- 실제 발언 순서는 `selectNextSpeakers()`가 동적 결정

## 주요 의존관계
- `AgentManager` → `Agent.ts`, `zones.ts`, `characterPixels.ts`
- `OfficeScene` → `OfficeMap.ts`, `AgentManager`, `tilePixels.ts`
- `GameBridge` → `EventStream`, `OfficeScene`
- `Sidebar` → `marked` (마크다운 렌더링), DOM API
- `orchestrator.ts` → Claude CLI, `personas.ts`, `store.ts`

## 확장 포인트
- 새 에이전트 추가: `personas.ts`에 페르소나 추가 → `zones.ts`에 좌석/로밍웨이포인트 추가 → `characterPixels.ts`에 색상 추가
- 맵 변경: `OfficeMap.ts`의 floorLayer/furniture 수정 → `zones.ts` 좌표 업데이트
- UI 테마: `public/style.css` 수정
