#!/usr/bin/env bash
# 팀 세션을 골라서 연다. 사용법: ./attach.sh [-r]   (-r: 읽기 전용)
RIG="${RIG:-ai-scheduler-team}"

mapfile -t sessions < <(tmux list-sessions -F '#S' 2>/dev/null | grep "@${RIG}\$" | sort)
if [ ${#sessions[@]} -eq 0 ]; then
  echo "실행 중인 ${RIG} 세션이 없습니다. 'rig up rig.yml --cwd .'로 먼저 띄우세요." >&2
  exit 1
fi

PS3="열 세션 번호: "
select s in "${sessions[@]}"; do
  [ -n "$s" ] && break
  echo "목록에 있는 번호를 입력하세요."
done
[ -n "$s" ] || exit 1   # Ctrl+d로 취소

if [ -n "$TMUX" ]; then
  tmux switch-client -t "$s"   # 이미 tmux 안이면 attach 대신 전환
else
  tmux attach ${1:+-r} -t "$s"
fi
