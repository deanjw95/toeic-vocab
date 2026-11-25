#!/bin/bash
# Sets up the example agent on this Mac: saves the sync code and registers a launchd job
# that wakes every 5 minutes (only while the Mac is awake).
# Usage: bash mac/install.sh        (install or update)
#        bash mac/install.sh remove (uninstall)
set -euo pipefail

LABEL="com.toeicvocab.examples"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$HOME/.toeic-vocab"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "예문 자동 채우기를 껐어요. (설정은 $DIR 에 남아 있어요)"
  exit 0
fi

NODE="$(command -v node || true)"
CLAUDE="$(command -v claude || true)"
[ -n "$NODE" ] || { echo "node 를 찾을 수 없어요. Node.js 를 먼저 설치하세요."; exit 1; }
[ -n "$CLAUDE" ] || { echo "claude 를 찾을 수 없어요. Claude Code 를 먼저 설치하고 로그인하세요."; exit 1; }

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
if [ ! -f "$DIR/config.json" ]; then
  read -r -p "앱 설정 → 기기 동기화의 동기화 코드: " KEY
  KEY="$(echo "$KEY" | tr -d '[:space:]')"
  [ -n "$KEY" ] || { echo "코드가 비어 있어요."; exit 1; }
  printf '{\n  "key": "%s",\n  "claude": "%s",\n  "model": "sonnet"\n}\n' "$KEY" "$CLAUDE" > "$DIR/config.json"
  chmod 600 "$DIR/config.json"
fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$HERE/example-agent.mjs</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$CLAUDE"):$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$DIR/agent.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "설치했어요. 5분마다 확인하고, 매일 12시와 앱에서 요청할 때 예문을 채워요."
echo "기록: tail -f $DIR/agent.log"
echo "바로 시험해 보기(저장 안 함): $NODE $HERE/example-agent.mjs --force --dry-run"
