# Todoongs

Electron 기반 데스크톱 생산성 앱입니다. **할 일 / 캘린더 / 노트 / 채팅**을 한 곳에서 관리하며,
로컬 SQLite로 오프라인에서도 빠르게 동작하고 Spring Boot + WebSocket으로 실시간 협업을 지원합니다.

## 주요 기능

- 할 일 관리: 상태 배지, 드래그 정렬, Markdown 본문, 첨부파일, 참조/의존 관계
- 캘린더: 월간 뷰, 날짜별 TODO 요약 및 상태 표시
- 노트: 폴더 트리, TipTap 리치 에디터, 첨부/미리보기, PDF 내보내기
- 실시간 채팅: DM/그룹 채팅, 읽음/온라인 상태, 첨부파일 업로드
- 설정: 창 투명도, PIN 잠금, 커스텀 타이틀바

## 기술 스택

- Desktop/Front: React 19, TypeScript, Vite, Tailwind CSS, Electron, SQLite
- Chat/Backend: Spring Boot 4, Spring Security, WebSocket(STOMP), JPA, MySQL

## 프로젝트 구조

- `todo_front/`: Electron + React 데스크톱 앱
- `todo_back/`: Spring Boot 채팅/인증 서버

## 로컬 실행

### 1) 백엔드 (Spring Boot)

사전 요구: JDK 17, MySQL

1. `todo_back/src/main/resources/application.properties`에서 DB 및 JWT 설정을 로컬 환경에 맞게 변경
2. 실행

```bash
cd todo_back
./gradlew bootRun
# Windows: gradlew.bat bootRun
```

기본 포트: `http://localhost:8080`

### 2) 데스크톱 앱 (Electron + Vite)

사전 요구: Node.js 18+

1. API 주소 설정 (선택)
   - `todo_front/.env` 파일 생성
   - 예시: `VITE_API_BASE=http://localhost:8080`
2. 실행

```bash
cd todo_front
npm install
npm run dev
```

`npm run dev`는 Vite(5173)와 Electron을 동시에 실행합니다.

## 빌드

```bash
cd todo_front
npm run build
```

```bash
cd todo_back
./gradlew build
# Windows: gradlew.bat build
```

## 참고

상세 기능 및 기술적 시도는 `project.md`를 참고하세요.
