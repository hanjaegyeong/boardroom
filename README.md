# 🏢 BoardRoom

> 게더타운 스타일의 2D 픽셀아트 가상 오피스에서 AI 팀원들이 자율 토론하고 문서를 만들어주는 웹 애플리케이션

![Phaser 3](https://img.shields.io/badge/Phaser_3-2D_Game_Engine-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6)
![Claude CLI](https://img.shields.io/badge/AI-Claude_CLI-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## 소개

BoardRoom은 업무 요청을 입력하면 가상 오피스의 AI 부서 팀원들이 **부서 단위로 호출**되어 실시간으로 회의하고, 전문 문서 산출물을 생성하는 프로젝트입니다.

- 마케팅부서와 개발부서, 총 6명의 AI 팀원이 각자의 전문성으로 토론
- 캐릭터가 자유롭게 돌아다니다가 회의실로 모여 실시간 대화
- 토론 결과를 바탕으로 마크다운 문서를 자동 생성
- 이전 회의 맥락을 기억하여 연속적인 업무 처리 가능

## 데모

```
업무 입력: "새로운 B2B SaaS 제품 런칭 전략을 수립해주세요"

→ AI가 관련 부서 판단 (마케팅 + 개발)
→ 팀장 브리핑 → 팀원 분석 → 부서 내 토론 → 부서 간 합동 회의
→ Marketing Strategy Report, Technical Architecture Document 등 산출물 생성
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | Phaser 3, Vanilla TypeScript, Vite |
| **백엔드** | Node.js, Express, TypeScript (tsx) |
| **AI** | Claude CLI (`claude -p`) — API 키 불필요 |
| **통신** | Server-Sent Events (SSE) 실시간 스트리밍 |
| **렌더링** | marked (마크다운), Canvas API (픽셀아트) |

## 시작하기

### 사전 요구사항

- **Node.js** 18+
- **Claude CLI** 설치 및 인증 완료 ([설치 가이드](https://docs.anthropic.com/en/docs/claude-cli))

### 설치 및 실행

```bash
# 레포지토리 클론
git clone https://github.com/hanjaegyeong/boardroom.git
cd boardroom

# 의존성 설치
npm install

# 개발 서버 실행 (Vite :5173 + Express :3001)
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속합니다.

### 빌드

```bash
npm run build
npm start
```

## 프로젝트 구조

```
boardroom/
├── server/                  # 백엔드
│   ├── agents/
│   │   ├── orchestrator.ts  # 부서 기반 토론 엔진
│   │   ├── personas.ts      # 팀원 페르소나 & 시스템 프롬프트
│   │   └── types.ts         # 타입 정의, SSE 이벤트
│   ├── routes/
│   │   └── chat.ts          # API 엔드포인트 (SSE, task, sessions)
│   ├── store.ts             # 세션 영속화 (data/sessions.json)
│   └── index.ts             # Express 서버 진입점
├── src/                     # 프론트엔드
│   ├── game/
│   │   ├── scenes/          # Phaser 씬 (Boot, Office)
│   │   ├── characters/      # 에이전트 스프라이트 & 매니저
│   │   ├── map/             # 오피스 맵, 존 정의
│   │   └── assets/          # 런타임 생성 픽셀아트
│   ├── services/
│   │   └── GameBridge.ts    # SSE ↔ Phaser 이벤트 브릿지
│   ├── ui/
│   │   └── Sidebar.ts       # 채팅 로그, 산출물 패널
│   └── main.ts              # 앱 진입점
├── public/
│   └── style.css            # UI 스타일
├── data/                    # 세션 히스토리 저장
└── index.html               # SPA 진입 HTML
```

## 주요 기능

### 부서 기반 AI 토론

업무 내용을 분석하여 관련 부서를 자동 판단하고, 해당 부서 팀원만 회의에 참여합니다.

| 부서 | 팀원 | 역할 |
|------|------|------|
| **마케팅** | Jiyeon (지연) | 팀장 — 마케팅 전략 총괄 |
| | Seoha (서하) | 콘텐츠 전략가 |
| | Minjun (민준) | 그로스 해커 |
| **개발** | Hyunwoo (현우) | 팀장 — 기술 아키텍처 총괄 |
| | Eunji (은지) | 백엔드 개발자 |
| | Taehyun (태현) | 프론트엔드 개발자 |

### 회의 진행 흐름

```
1. 부서 분석 → 관련 부서 자동 판단
2. 팀장 브리핑 → 이전 대화 컨텍스트 포함
3. 팀원 분석 → 전문 분야별 관점 제시
4. 부서 내 토론 → 팀원 간 실시간 토론
5. 부서 간 합동 회의 → (양 부서 참여 시)
6. 산출물 작성 → 마크다운 문서 생성
```

### 실시간 시각화

- 캐릭터가 오피스 내 **자유 로밍** (70% 부서 근처, 30% 공용 공간)
- 회의 시작 시 라운지로 이동하여 **원형 배치**
- **말풍선**으로 실시간 발언 표시
- 산출물 작성 시 각자 **책상으로 복귀**

### 세션 영속화

- 최근 50개 세션을 `data/sessions.json`에 자동 저장
- 새 회의 시 최근 3개 세션 요약을 컨텍스트로 주입
- `GET /api/sessions`로 히스토리 조회 가능

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/stream` | SSE 스트림 연결 |
| `POST` | `/api/task` | 새 업무 요청 |
| `POST` | `/api/continue` | 토론 계속 |
| `POST` | `/api/finalize` | 산출물 생성 요청 |
| `POST` | `/api/stop` | 회의 중단 |
| `GET` | `/api/sessions` | 세션 목록 조회 |
| `GET` | `/api/sessions/:id` | 세션 상세 조회 |

## 그래픽 시스템

모든 그래픽 에셋은 **외부 이미지 파일 없이** 런타임에 Canvas API로 생성됩니다.

- 캐릭터: 16×20px 원본 → 2.5x 스케일 표시
- 타일맵: 16×16px → 2x 스케일 (32×24 타일 맵)
- Phaser `pixelArt: true`로 레트로 픽셀아트 스타일 유지

## 라이선스

[MIT](LICENSE) © hanjaegyeong
