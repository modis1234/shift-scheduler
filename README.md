# shift-scheduler

교대근무 스케줄을 생성하고 저장·게시하는 매장 관리자용 SaaS 모노레포.

## 현재 기능

- 카카오 계정으로 매장 관리자 로그인(운영 담당자가 발급한 1회용 초대 링크로 최초 연결)
- 입력 폼 또는 JSON으로 직원·근무조·필요 인원·휴가·근무 규칙 편집
- Google OR-Tools CP-SAT 엔진으로 법정·운영 제약을 만족하는 근무표 생성
- 직원별 표와 월·주·일 달력 보기, 직원·근무조 필터, A4 가로 인쇄/PDF 저장
- 기간 경계의 연속 근무일·주간 근로시간·마지막 근무 종료·순환 위상을 다음 기간 입력으로 전달
- 생성 결과를 Postgres(Supabase)에 저장하고 다시 열기·삭제·게시·게시 취소
- 같은 매장·같은 기간에는 하나의 근무표만 게시(새 근무표를 게시하면 이전 게시본은 자동으로 게시 취소)

```
shift-scheduler/
├── web-client/          # Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS 4)
│   ├── src/app/         # 입력·결과·달력 UI와 API 라우트
│   ├── src/lib/         # 인증·계정·근무표 저장소(Postgres)
│   └── scripts/         # 매장 계정·초대 링크 관리
└── algorithm-engine/    # Python 3 + Google OR-Tools (CP-SAT)
    ├── requirements.txt
    ├── solver.py        # 스케줄 생성 + 절대 규칙 재검증(validate)
    ├── sample_input.json
    └── test_solver.py   # 샘플 입력으로 SUCCESS / 위반 0건 확인
```

## 로컬 실행

`./dev.sh [포트]`: 엔진 venv와 web-client 의존성이 없으면 만들고 개발 서버를 띄운다(기본 3000). 아래는 각각 따로 실행하는 방법이다.

Node.js 22 이상, Python 3, Postgres(운영은 Supabase, 로컬은 Docker 등), 카카오 애플리케이션 설정이 필요하다. 먼저 `web-client/.env.local`에 아래 환경변수를 설정한다(`web-client/.env.example` 참고).

```dotenv
KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
KAKAO_LOGOUT_REDIRECT_URI=http://localhost:3000/login
SESSION_SECRET=32자 이상의 임의 문자열
DATABASE_URL=postgresql://…   # 아래 [데이터베이스](#데이터베이스-postgres--supabase). 로컬 Postgres는 끝에 ?sslmode=disable
STAFF_SHARE_BETA=1   # 선택: 직원 공유 링크(/s/<코드>) 베타. 1이 아니면 꺼짐
```

그다음 [데이터베이스](#데이터베이스-postgres--supabase)에 마이그레이션을 적용하고, 개발용 매장과 세션을 만들거나, 아래 [로그인](#로그인-카카오) 절차로 매장·초대 링크를 만든다.

```bash
cd web-client
node --env-file=.env.local scripts/accounts.mjs dev-session
# 출력된 Cookie 값을 브라우저 요청에 사용하거나 카카오 초대 로그인을 진행
cd ..
./dev.sh
```

### algorithm-engine
```bash
cd algorithm-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python solver.py sample_input.json > output.json
python test_solver.py
```

### web-client
```bash
cd web-client
npm install
npm run dev   # http://localhost:3000
```

화면의 [근무표 생성]은 `POST /api/schedule`이 엔진(`solver.py`)을 직접 실행해 결과를 돌려준다(120초 초과 시 504). 엔진 위치는 환경변수
`ENGINE_DIR`(기본 `../algorithm-engine`), python은 `ENGINE_PYTHON`(기본 `$ENGINE_DIR/.venv/bin/python`)으로 바꿀 수 있으므로 위 algorithm-engine venv를 먼저 만들어 둔다.
동시에 실행되는 엔진 수는 `ENGINE_MAX_CONCURRENCY`(1 이상 정수, 기본 2)로 제한하며, 넘는 요청은 기다리지 않고 429(`Retry-After: 30`)로 거절한다. 제한은 Node 프로세스 단위다.

생성에 성공하면 직원별 표와 월·주·일 달력을 전환해 볼 수 있다. 달력은 직원·근무조로 필터링할 수 있고 [인쇄]는 월 보기를 A4 가로 형식으로 출력한다. [다음 기간 준비하기]는 결과의 기간 경계 값을 다음 입력으로 옮긴다.

### 로그인 (카카오)

`/login`, `/auth/*`, `/api/invite`, 정적 파일을 뺀 모든 페이지·API는 로그인이 필요하다(기획: `docs/planning/login.md`). `web-client/.env.local`에
`KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`(`…/auth/kakao/callback`), `KAKAO_LOGOUT_REDIRECT_URI`(`…/login`),
`SESSION_SECRET`(32자 이상, 바꾸면 모든 세션이 끊김), `DATABASE_URL`을 둔다. `KAKAO_API_BASE`는 가짜 카카오 서버로 테스트할 때만 설정한다(localhost·127.0.0.1·[::1]만 허용).

매장 계정은 운영 담당자가 `web-client`에서 스크립트로 관리한다. 초대 링크는 1회용·7일이고, 링크로 카카오 로그인한 계정이 그 매장에 연결된다.

```bash
node --env-file=.env.local scripts/accounts.mjs create "OO매장"   # 매장 생성 + 초대 링크 출력
node --env-file=.env.local scripts/accounts.mjs list             # 매장 id·연결·초대 상태
node --env-file=.env.local scripts/accounts.mjs invite <매장 id>  # 새 초대 링크(관리자 교체도 이것으로)
node --env-file=.env.local scripts/accounts.mjs revoke-invite <매장 id>
node --env-file=.env.local scripts/accounts.mjs unlink <매장 id>  # 연결 해제, 그 관리자의 로그인도 즉시 끊김
node --env-file=.env.local scripts/accounts.mjs delete <매장 id>
node --env-file=.env.local scripts/accounts.mjs dev-session      # 개발·테스트용 'Cookie: ss_session=…' 출력(production 거부)
```

근무표 저장·게시(`/api/schedules`)는 생성 입력과 결과를 Postgres에 함께 저장한다(직원 개인정보 포함). 저장된 근무표는 기간 최신순으로 표시되며 다시 열기·게시·게시 취소·삭제할 수 있다. `내 일정`(`/api/manager-events`)은 로그인한 매장 관리자만 보는 개인 일정의 제목·메모·날짜·시각을 저장한다. 일정은 관리자가 직접 삭제하거나 매장 계정을 삭제할 때까지 보관하며 직원 공유 화면과 근무표 생성에는 포함하지 않는다. `accounts.mjs delete`는 그 매장의 근무표·직원 공유 링크·관리자 개인 일정을 함께 지운다.

### 데이터베이스 (Postgres / Supabase)

매장 계정·근무표·직원 공유 링크·관리자 개인 일정은 Postgres의 `stores`, `schedules`, `share_links`, `manager_events` 표에 있다. 서버만 `DATABASE_URL`로 직접 접속하고(npm `postgres`), 브라우저는 DB에 붙지 않는다. 스키마는 `web-client/db/migrations/`의 번호 순 SQL이며 앱이 자동으로 실행하지 않으므로 각 파일을 한 번씩 직접 적용한다. 모든 표에 RLS를 켜 두어 Supabase Data API(anon 키)로는 읽히지 않는다.

`DATABASE_URL`에 `sslmode`가 없으면 SSL을 필수로 접속한다. SSL이 없는 로컬 Postgres는 끝에 `?sslmode=disable`을 붙인다.

**Supabase 프로젝트 만들고 연결하기**

1. [supabase.com](https://supabase.com) → New project. 데이터베이스 비밀번호를 정해 따로 보관한다(잊으면 Project Settings → Database에서 재설정).
2. 프로젝트 화면 위쪽 **Connect** → Connection string에서 **Session pooler**(포트 5432) 주소를 복사한다. 서버리스가 아니므로 Session pooler나 Direct connection을 쓴다.
3. `web-client/.env.local`에 `DATABASE_URL=<복사한 주소>`를 넣고 `[YOUR-PASSWORD]` 자리를 1의 비밀번호로 바꾼다(비밀번호에 `@`·`#` 등이 있으면 URL 인코딩).
4. 왼쪽 메뉴 **SQL Editor** → New query에서 `web-client/db/migrations/001_init.sql`, `002_manager_events.sql`을 번호 순서대로 각각 실행한다. psql이 있으면 각 파일에 `psql "$DATABASE_URL" -f <파일>`을 실행해도 된다.
5. `cd web-client && node --env-file=.env.local scripts/accounts.mjs create "OO매장"`으로 매장과 초대 링크를 만든다.

로컬에서 Supabase 없이 확인할 때:

```bash
docker run -d --name shift-pg -e POSTGRES_PASSWORD=dev -p 54329:5432 postgres:17
docker exec -i shift-pg psql -U postgres < web-client/db/migrations/001_init.sql
docker exec -i shift-pg psql -U postgres < web-client/db/migrations/002_manager_events.sql
# .env.local: DATABASE_URL=postgresql://postgres:dev@localhost:54329/postgres?sslmode=disable
```

### 주요 API

모든 API는 `/api/invite`·`/api/s/:code`를 제외하고 로그인 세션이 필요하며, 근무표 API는 현재 로그인한 매장의 데이터에만 접근한다.

| 메서드·경로 | 기능 |
|---|---|
| `POST /api/schedule` | 엔진으로 근무표 생성 |
| `GET /api/schedules` | 저장된 근무표 목록 조회 |
| `POST /api/schedules` | `SUCCESS` 결과를 작성 중 상태로 저장 |
| `GET /api/schedules/:id` | 저장된 입력·결과 조회 |
| `POST /api/schedules/:id/publish` | 게시(같은 기간의 기존 게시본은 게시 취소) |
| `POST /api/schedules/:id/unpublish` | 게시 취소 |
| `DELETE /api/schedules/:id` | 저장된 근무표 삭제 |
| `GET /api/me` | 현재 로그인한 매장 조회 |
| `GET /api/share-link` | 직원 공유 링크 조회(`STAFF_SHARE_BETA=1`일 때만) |
| `POST /api/share-link` | 직원 공유 링크 만들기·새로 만들기(이전 링크는 바로 무효) |
| `GET /api/s/:code` | 게시된 근무표 직원용 조회(로그인 없음, 이름·근무·휴가만) |

## 배포 (Docker)

`/api/schedule`이 같은 호스트에서 `solver.py`를 실행하므로 Next.js와 엔진을 이미지 하나에 담는다(루트 `Dockerfile`, multi-stage, `node` 사용자로 실행).
태그는 git 커밋 short 해시이고, 같은 값이 label `org.opencontainers.image.revision`에 붙는다. 작업 트리가 dirty일 수 있으므로 커밋된 소스에서 빌드한다.

```bash
REV=$(git rev-parse --short HEAD)
SRC=$(mktemp -d) && git archive HEAD | tar -x -C "$SRC"
docker build --build-arg GIT_REVISION=$REV -t shift-scheduler:$REV "$SRC"
docker run -d --name shift-scheduler -p 3000:3000 \
  --env-file /절대/경로/production.env \
  shift-scheduler:$REV
```

`production.env`에는 카카오 관련 환경변수, `SESSION_SECRET`, `DATABASE_URL`을 둔다. 직원 공유 링크 베타를 켜려면 `STAFF_SHARE_BETA=1`을 추가한다. 데이터는 모두 Postgres에 있으므로 컨테이너에 볼륨은 필요 없다. DB에는 계정 식별자와 직원 근무 정보가 있으므로 Supabase 백업과 비밀번호·접속 문자열 관리에 신경 쓴다.

배포 후 확인: 비로그인 `GET /login` → 200, `GET /` → `/login` 리다이렉트, `POST /api/schedule` → 401. 카카오 로그인 후 세션 쿠키를 포함해 `POST /api/schedule`에 `algorithm-engine/sample_input.json` → 200 `SUCCESS`, `'{bad'` → 400.
롤백은 이전 커밋 태그 이미지로 컨테이너를 다시 띄운다. 배포 호스트·레지스트리는 아직 정하지 않았다.

## 엔진 규칙 매핑

| 규칙 | 구현 |
|---|---|
| Hard 1 주당 최대 근로시간 | ISO 주 단위로 `min(rules.max_weekly_hours, 직원 max_weekly_hours)` 이하. `employees[].prior_week_hours`(선택, 기본 0)를 첫 주 합계에 더해 기간 경계 주도 검사 |
| Hard 2 최소 휴식 | 전날 종료 ~ 다음날 시작 < `min_rest_hours` 조합 금지 (마감→오픈 자동 차단). `employees[].prior_last_shift_end`(선택)로 직전 기간 마지막 근무 종료 시각부터 휴식이 부족한 시프트도 금지 |
| Hard 3 연속 근무 | 임의 `max_consecutive_days+1`일 구간 근무일 ≤ 제한값. `employees[].prior_consecutive_work_days`(선택, 기본 0)로 직전 기간 연속 근무를 이어받아 기간 경계도 검사 |
| Hard 4 휴가 보호 | `approved_leaves` 날짜 전 시프트 0 고정 |
| Hard 5 인원·숙련도 | 시프트별 `min_count`, `min_senior` 하한 |
| Hard 6 순환 패턴 | `rules.rotation_pattern {work_days, off_days}`가 있으면 풀타임만 대상. 직원별 위상(`rotation_offset`, 기간 시작일 기준)을 솔버가 골라 근무일 1시프트·휴무일 0 (휴가일은 0). `work_days > max_consecutive_days`는 `INVALID_INPUT`. `employees[].rotation_offset`(선택)을 주면 그 위상으로 고정 |
| Soft 2 기피 시프트 균등 | 풀타임 간 기피 시프트·주말 횟수 최대-최소 편차 최소화 |
| Soft 3 파트타임 가용시간 | `available_time_slots` 밖 시프트 배정 금지 |

`rules` 키(선택)로 기본값을 덮어쓸 수 있다: `max_weekly_hours`, `min_rest_hours`, `max_consecutive_days`, `undesirable_shifts`, `default_hourly_wage`, `time_limit_seconds`, `rotation_pattern`.
`undesirable_shifts` 기본값은 `["Closing", "Night", "마감"]`이며, 적용되는 목록이 등록된 근무조와 하나도 맞지 않으면 `warnings_and_exceptions`에 경고를 남기고 기피 근무 균등 배분을 건너뛴다(일부만 맞거나 `[]`이면 경고 없음).

입력 숫자 상한(모든 숫자는 유한값이어야 하며 `Infinity`·`NaN`은 거부, 범위를 넘으면 `INVALID_INPUT`):

| 필드 | 허용 범위 |
|---|---|
| 기간(`start_date`~`end_date`) | 최대 366일 |
| `shift_definitions.*.hours` | 정수 0~24 |
| `rules.max_weekly_hours`, `employees[].max_weekly_hours` | 정수 0~168 |
| `rules.min_rest_hours` | 숫자 0~168 |
| `rules.max_consecutive_days` | 정수 1~366 |
| `shift_requirements.*.min_count`, `min_senior` | 정수 0~10000 |
| `rules.default_hourly_wage`, `employees[].hourly_wage` | 숫자 0~10,000,000 |
| `rules.time_limit_seconds` | 숫자 0 초과~100 (웹 API가 120초에 엔진 종료) |
| `rotation_pattern.work_days` / `off_days` | 정수 1~`max_consecutive_days` / 1~366 |

결과의 `rotation_offsets`(`{직원 id: 위상}`)는 배정이 없는 직원까지 포함한 풀타임 전원의 위상이다. `rotation_offset`(입력·출력 공통)은 기간 시작일이 주기 안에서 몇 번째 날인지를 0부터 센 값이다(`0..work_days+off_days-1`, 범위 밖이면 `INVALID_INPUT`). 패턴을 다음 기간으로 이어가려면 다음 기간 입력에 `(offset + 이전 기간 일수) % (work_days + off_days)`를 넣는다.

결과의 `trailing_consecutive_work_days`(`{직원 id: 일수}`)는 기간 마지막 날까지 이어진 연속 근무일수다(기간 전체가 근무면 `prior` 포함, 배정 없는 직원은 0). 다음 기간 입력의 `prior_consecutive_work_days`로 그대로 넘긴다. 값이 `max_consecutive_days`를 넘거나 정수가 아니면 `INVALID_INPUT`.

결과의 `last_shift_end`(`{직원 id: "YYYY-MM-DDTHH:MM"}`)는 기간 안 마지막 근무의 종료 시각이다(배정이 없으면 입력 `prior_last_shift_end` 그대로, 그것도 없으면 `null`). 다음 기간 입력의 `prior_last_shift_end`로 그대로 넘긴다. 입력도 출력과 같은 `YYYY-MM-DDTHH:MM`(오프셋 없는 현지 시각)만 받으며, 그 외 형식은 `INVALID_INPUT`.

결과의 `trailing_week_hours`(`{직원 id: 시간}`)는 `end_date` 다음 날이 속한 ISO 주에서 `end_date`까지 이미 일한 시간이다(`end_date`가 일요일이면 0, 첫날도 그 주면 `prior_week_hours` 포함). 다음 기간 입력의 `prior_week_hours`로 그대로 넘긴다. 시프트 `hours`와 같이 정수만 받으며, 음수·bool·정수가 아닌 값, 주당 상한을 넘는 값은 `INVALID_INPUT`.

## 개발 팀 (OpenRig)

`rig.yml`이 팀 구성이고, 역할별 spec은 `agents/<역할>/`에 있다.

| 세션 | 역할 | 런타임 |
|---|---|---|
| `dev-lead@ai-scheduler-team` | 아키텍처·요구사항·FE/BE 기본 구조 | Claude Code |
| `dev-algo@ai-scheduler-team` | OR-Tools 엔진·제약조건 | Claude Code |
| `dev-review@ai-scheduler-team` | 결함·엣지 케이스·성능·타입 검토 | Codex |
| `dev-deploy@ai-scheduler-team` | 빌드·배포 준비, 배포 실행·검증 (외부 배포는 사용자 승인 후) | Claude Code |

```bash
rig spec validate rig.yml
rig up rig.yml --cwd . --plan   # 실행 계획만 확인
rig up rig.yml --cwd .
rig send dev-lead@ai-scheduler-team '<작업 내용>'
```
