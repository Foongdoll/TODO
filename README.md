## 프로젝트 소개

Electron 기반의 데스크톱 생산성 앱으로, **할 일 / 캘린더 / 노트 / 채팅**을 한 곳에서 관리하는 통합 워크스페이스입니다.
로컬 SQLite에 업무와 노트를 저장해 오프라인에서도 빠르게 동작하며, 채팅은 Spring Boot + WebSocket으로 실시간 협업을 지원합니다.

---

## 프로젝트를 만들게 된 계기

할 일, 노트, 일정이 각각 다른 앱에 흩어져 있어 컨텍스트 전환이 잦았습니다.
**로컬 중심의 빠른 기록 + 실시간 소통을 하나의 데스크톱 앱으로 통합**해 생산성을 높이고자 프로젝트를 시작했습니다.

---

## 사용한 기술

### Front-end / Desktop

- React 19, TypeScript, Vite
- Tailwind CSS
- Electron + contextBridge (preload)
- sqlite3, fs-extra (로컬 DB/첨부파일)
- TipTap (이미지/표/체크리스트/정렬 등 확장)
- react-markdown, remark-gfm
- dnd-kit (드래그 정렬)
- SockJS, @stomp/stompjs (실시간 채팅)
- emoji-picker-react, lucide-react

### Back-end

- Spring Boot 4, Spring Security
- JWT access/refresh 토큰
- OAuth2 Client 템플릿 (Google/Kakao/Naver)
- WebSocket + STOMP
- Spring Data JPA, Hibernate, MySQL
- Multipart 업로드 (채팅 첨부파일)

---

## 주요 기능

### ✅ 할 일 관리

- 날짜별/데일리 태스크 분리 (매일 반복 TODO)
- TODO/진행/차단/완료 상태 배지 관리
- 드래그로 순서 변경 및 우선순위 관리
- Markdown 본문 편집 + 미리보기
- 이미지/문서(PDF/HWP/DOCX/PPTX 등) 첨부, 미리보기/열기/삭제
- TODO 간 참조(References) 연결
- 의존/차단/연관 관계 기록
- TODO ↔ 노트 연결로 컨텍스트 추적

---

### 📅 캘린더

- 월간 캘린더 뷰
- 날짜별 TODO 요약 및 상태 배지 표시
- 선택 날짜의 TODO 리스트 즉시 조회

---

### 📝 노트

- 폴더/노트 트리 구조 + 드래그로 이동
- TipTap 기반 리치 에디터
- Markdown 자동 감지 시 읽기 전용 프리뷰 제공
- 체크리스트/표/정렬/이미지/링크 지원
- 커스텀 블록(Select/Chart/Callout/Layout) + Slash 메뉴
- 파일/이미지 첨부 드래그 업로드, 다운로드/삭제
- 노트 PDF 내보내기
- TODO 링크 연결(업무-노트 상호 연결)

---

### 💬 실시간 채팅

- 회원가입/로그인 기반(이메일 + JWT)
- 친구 검색/추가/삭제/차단
- DM 및 그룹 채팅방 생성
- 실시간 메시지, 읽음 처리, 온라인 상태 갱신
- 채팅방 고정/알림 ON/OFF
- 이미지/오디오/비디오/파일 업로드
- 데스크톱 알림(Notification API)

---

### ⚙️ 설정/환경

- 창 투명도 조절(네이티브 window opacity)
- PIN 잠금(4~6자리) 및 Ctrl+L 잠금 토글
- 커스텀 타이틀바 + 최소화/최대화/닫기 제어

---

## 특징적인 기술적 시도

- **로컬 SQLite(WAL) 기반 데이터 저장**
  - TODO/노트/첨부/링크를 테이블로 분리하고 인덱스 최적화
  - 스키마 변경 시 `PRAGMA` + `ALTER TABLE` 자동 보정
- **Electron 보안 설계**
  - `contextIsolation` + `preload`로 IPC 브릿지 구성
  - 첨부파일 접근을 `note-attachment://` 커스텀 프로토콜로 제한
- **파일 첨부 처리 파이프라인**
  - DataURL -> 파일 저장, 미리보기/열기/삭제/다운로드 지원
  - 노트 PDF export를 위한 오프스크린 `printToPDF` 파이프라인
- **업무-노트 연결 구조**
  - TODO ↔ 노트 연결로 양방향 탐색
  - 참조/의존 관계로 작업 흐름 시각화
- **실시간 채팅 인프라**
  - STOMP + SockJS + JWT 인증
  - 읽음 처리, Presence, 알림 구독을 토픽으로 분리
- **토큰 갱신 로직**
  - 401 응답 시 refresh token으로 자동 재발급 후 재요청

---

## 나의 역할

개인 프로젝트로서 기획부터 디자인, 프론트엔드/일렉트론/백엔드까지 전 과정을 단독 구현했습니다.
특히 **로컬 데이터 모델링**, **Electron IPC/파일 시스템 연동**, **실시간 채팅 구조 설계**에 집중했습니다.

---

## 배운 점

- Electron 환경에서의 **안전한 IPC 설계**와 파일 접근 제어
- SQLite 기반 로컬 스토리지 설계 및 마이그레이션 전략
- STOMP 기반 실시간 메시징과 읽음/상태 동기화
- JWT access/refresh 설계와 토큰 갱신 흐름

---

## 아쉬운 점 및 개선 사항

- TODO/노트 통합 검색 고도화
- 데이터 동기화/백업 기능
- 다중 기기 로그인 및 푸시 알림
- 테스트 코드 보강 (프론트/백)
- 채팅 메시지 검색 및 파일 관리 UI 개선

---

## 참고

- Electron, SQLite3, contextBridge 공식 문서
- TipTap / React Markdown / dnd-kit 문서
- Spring Boot Security, WebSocket(STOMP), JWT 문서
