# 토익 단어장 v2

카드형 토익 단어장 웹앱(PWA)입니다. FSRS로 복습 날짜를 잡고, 단어를 넣으면 Gemini나 Mac의 로컬 모델이 토익 뜻과 예문을 채워 줍니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 에 배포용 파일
npm test           # 채점, 빈칸, FSRS 단위 테스트
```

`main`에 푸시하면 GitHub Actions가 테스트, 빌드 후 GitHub Pages에 배포합니다: https://deanjw95.github.io/toeic-vocab/

휴대폰(안드로이드 Chrome)에서는 위 주소를 열고 메뉴의 "홈 화면에 추가", Mac에서는 Chrome 주소창의 설치 버튼이나 Safari의 "Dock에 추가"를 누르면 앱처럼 쓸 수 있습니다.

## 기능

- 기본 단어 200개 (Day 1~10, 주제별 20개)
- 오늘의 학습: 복습할 카드 + 하루 새 단어(기본 20개)
- 학습 카드: 탭해서 뒤집기, 왼쪽으로 밀면 다시, 오른쪽은 알맞음, 아래 4단계 버튼에 다음 복습까지 간격 표시. Mac에서는 Space, 1~4 키
- FSRS(ts-fsrs) 일정, 목표 기억률 85~95% 설정
- 퀴즈: 객관식 (A)~(D), 주관식(토익 Part 5식 빈칸에 단어 쓰기, 한 글자 오타는 "거의 맞음")
- 오답노트: 틀린 횟수 순, 8번 이상 잊은 단어는 "고질"
- 단어 추가: 뜻 자동 채우기(뜻별 카드), 직접 입력
- 백업 내보내기/불러오기 (기기 간 동기화가 붙기 전까지)

## 뜻 자동 채우기 설정

설정 화면의 "뜻 자동 채우기"에서 고릅니다.

- **Gemini (무료 티어):** [Google AI Studio](https://aistudio.google.com/)에서 API 키를 만들어 넣습니다. 기본 모델은 `gemini-2.5-flash-lite`이고 바꿀 수 있습니다. 무료 티어 입력은 구글이 모델 개선에 쓸 수 있습니다.
- **Mac 로컬 모델 (Ollama):** 모델 이름에 `ollama list`에 나오는 이름을 넣습니다. 브라우저에서 부르려면 Mac에서 한 번 실행 후 Ollama를 다시 켜세요.
  ```bash
  launchctl setenv OLLAMA_ORIGINS "*"
  ```
  Mac이 꺼져 있거나 폰에서 쓸 때는 로컬 모델에 닿지 않으니 "로컬 먼저, 안 되면 Gemini"를 권합니다.

한 번 찾은 단어는 기기에 저장해 두고 다시 부르지 않습니다. API 키는 이 기기에만 저장되고 백업 파일에는 들어가지 않습니다.

## 구조

```
src/lib/baseWords.ts  기본 200단어
src/lib/db.ts         IndexedDB (단어, 카드 상태, 복습 로그, 설정)
src/lib/srs.ts        FSRS 래퍼
src/lib/quiz.ts       주관식 채점, 예문 속 단어 찾기, 오답 보기 고르기
src/lib/ai.ts         Gemini / Ollama 호출과 프롬프트
src/lib/store.tsx     앱 상태
src/screens/          홈, 학습, 퀴즈, 오답노트, 단어장, 단어 추가, 설정
```

## 다음 단계

1. Supabase로 Mac과 안드로이드 동기화 (복습 로그는 추가만 하므로 충돌 없음)
2. 텔레그램 봇 알림 (08:00, 12:30, 21:00)과 버튼 미니 퀴즈
