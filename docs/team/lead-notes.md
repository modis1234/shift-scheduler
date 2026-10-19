# dev-lead 운영 메모

dev-lead seat이 Claude에서 Codex로 바뀌면서(2026-10-19) Claude 메모 폴더에 있던 내용을 옮겼다. 시작하면 `rig whoami --json`을 먼저 실행하고, 진행 상태는 queue(`rig queue list -o json`)부터 확인한다.

## 팀 구성 (2026-10-19, 사용자 결정)

| seat | 런타임 | 역할 |
|---|---|---|
| dev-lead | codex | 설계, 작업 배분, 사용자 결정 요청 |
| dev-plan | codex | 기획(`docs/planning/`) |
| dev-developer | claude-code | web-client 화면과 서버(API·인증·저장소). 옛 dev-fe와 dev-be를 합쳤다 |
| dev-review | codex | 코드 리뷰 |
| dev-algo | claude-code | 엔진(`algorithm-engine/`). `/exit` 상태 |
| dev-deploy | claude-code | 배포. `/exit` 상태 |

- dev-design과 dev-qa는 빼 두었다. 나중에 다시 추가한다. QA나 디자인 검수가 필요한 작업은 처리 방법을 사용자에게 묻는다.
- 꺼진 seat는 `rig launch 01M4YH258XFD7TJYTMQRE8PP24 dev.algo`로 띄운다.
- seat를 다시 추가하면 새 세션으로 시작한다. 작업을 넘길 때 관련 문서와 커밋을 함께 준다.

## 코드 상태

- 브랜치 `feature/calendar-share`, HEAD `4adbcf7`: Supabase(Postgres) 이전과 직원 달력 PWA 베타(기획서 3단계). 그 아래 `0efeb1f`(UI 리프레시 v2 검수 반영), `730f203`(리프레시).
- 푸시와 PR은 아직 하지 않았다. 사용자가 "DB를 붙여 확인한 뒤 PR"로 미뤘다. PR은 `gh`로 만든다.
- 리뷰·QA 기록은 `docs/review/{calendar-share,supabase-migration,ui-refresh-v2}`에 있다. Android 실기기 설치 확인은 사용자가 "나중에"로 미뤘다.
- 커밋은 사용자가 요청할 때만 한다.

## Supabase

- `web-client/.env.local`의 `DATABASE_URL`은 Session pooler(aws-0-ap-northeast-1)를 쓴다. Direct 주소는 IPv6 전용이라 WSL에서 ENETUNREACH가 난다.
- `web-client/db/migrations/001_init.sql`을 적용했다(stores·schedules·share_links, RLS on, 정책 0). 확인 당시 stores는 0행이었다.
- 다음 단계: 사용자가 `accounts.mjs create`로 매장 계정을 만들고 `./dev.sh`로 서버를 띄운다. 그다음 lead가 실DB에서 로그인·저장·게시·공유 링크를 확인한다.
- 실매장 데이터는 건드리지 않는다. 임시 테스트 매장을 만들어 쓰고 끝나면 지운다(CASCADE로 함께 지워진다).
- `accounts.mjs dev-session`은 실DB에 "개발용 매장" 행을 만들므로 실DB에서는 쓰지 않는다.

## 운영 규칙

- **공유 web-client에서 빌드 금지:** `web-client/`에서 `npm run build`, `next build`, `next dev`를 실행하지 않는다(`tsc --noEmit`, `npm run lint`는 괜찮다). 사용자가 포트 3000에 dev 서버를 띄워 두고 있어서 `.next`를 덮어쓰면 깨진다. 빌드·브라우저 검증은 scratchpad 복사본에서 3000이 아닌 포트로 한다.
- **검사 포트:** dev-developer가 3117(docker `shift-fe-pg` 54339)과 3107(`shift-be-pg` 54329)을 쓴다. 3000은 사용자 서버라 끄지 않는다. 종료 전에 `ss -ltnp`의 pid가 자기가 띄운 것인지 확인한다.
- **Kiro 래퍼:** `~/.bashrc`·`~/.profile`의 Kiro CLI가 tmux pane을 `bash (kiro-cli-term)`로 감싸면 OpenRig이 codex seat로의 `rig send`를 거부한다. `tmux set-environment -g PROCESS_LAUNCHED_BY_Q 1`로 막는다. tmux 서버를 다시 시작하면 이 설정이 사라진다.
- **seat 대화 비우기:** Claude seat는 `rig send <seat> "/clear" --raw`, Codex seat는 `/new`를 쓴다. 머리말이 붙으면 명령으로 실행되지 않는다. Codex 메뉴에 답할 때는 `--dangerously-interact --reason`을 쓴다.
- **Codex 모델:** `/model` 메뉴는 `~/.codex/config.toml`의 전역 기본값까지 바꾼다. 바꾼 뒤에는 전역 값을 `gpt-5.6-sol`로 되돌린다.
- **토큰 절약:** `AGENTS.md`의 "ai-scheduler-team 작업 규칙"을 따른다. 그 규칙의 dev-qa 단계는 dev-qa를 다시 추가할 때까지 사용자에게 처리 방법을 묻는다.
