# 예문 자동 채우기 (Mac)

앱에서 예문 없이 저장한 단어를 Mac의 Claude Code가 채웁니다. 내가 쓴 뜻에 맞는 토익식 영어 예문 한 문장과 한국어 해석을 만듭니다.

- **언제:** 매일 12:00 (그 시각에 Mac이 잠자고 있었다면 깨어난 뒤 처음 5분 안에), 그리고 앱 설정 → "지금 예문 채우기"를 누르면 5분 안에
- **조건:** Mac이 켜져 있고 깨어 있을 때만. 꺼져 있으면 건너뛰고, 다음에 켜졌을 때 이어서 합니다
- **비용:** Claude Code에 로그인한 계정(구독)으로 실행됩니다. 단어 25개당 한 번 호출합니다

## 설치 (한 번만)

준비: Node.js, Claude Code 설치 후 터미널에서 `claude` 로 한 번 로그인, 앱에서 기기 동기화를 켠 상태

```bash
git clone https://github.com/deanjw95/toeic-vocab.git ~/toeic-vocab
bash ~/toeic-vocab/mac/install.sh
```

동기화 코드를 물어보면 앱 설정 → 기기 동기화의 코드를 붙여넣으세요. 코드는 `~/.toeic-vocab/config.json` 에만 저장됩니다.

## 확인과 관리

```bash
node ~/toeic-vocab/mac/example-agent.mjs --force --dry-run   # 지금 만들어 보기 (저장 안 함)
node ~/toeic-vocab/mac/example-agent.mjs --force             # 지금 채우고 저장
tail -f ~/.toeic-vocab/agent.log                              # 기록
bash ~/toeic-vocab/mac/install.sh remove                      # 끄기
cd ~/toeic-vocab && git pull && bash mac/install.sh           # 업데이트
```

모델은 `~/.toeic-vocab/config.json` 의 `"model"` 로 바꿀 수 있어요 (기본 `sonnet`, 더 싸고 빠르게는 `haiku`).
