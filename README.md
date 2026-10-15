# shift-scheduler

교대근무 스케줄 자동 생성 SaaS 모노레포.

```
shift-scheduler/
├── web-client/          # Next.js 15 (App Router, TypeScript, Tailwind CSS)
│   └── src/app/         # 라우트·페이지
└── algorithm-engine/    # Python 3 + Google OR-Tools (CP-SAT)
    ├── requirements.txt
    ├── solver.py        # 스케줄 생성 + 절대 규칙 재검증(validate)
    ├── sample_input.json
    └── test_solver.py   # 샘플 입력으로 SUCCESS / 위반 0건 확인
```

## 실행

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

## 배포 (Docker)

`/api/schedule`이 같은 호스트에서 `solver.py`를 실행하므로 Next.js와 엔진을 이미지 하나에 담는다(루트 `Dockerfile`, multi-stage, `node` 사용자로 실행).
태그는 git 커밋 short 해시이고, 같은 값이 label `org.opencontainers.image.revision`에 붙는다. 작업 트리가 dirty일 수 있으므로 커밋된 소스에서 빌드한다.

```bash
REV=$(git rev-parse --short HEAD)
SRC=$(mktemp -d) && git archive HEAD | tar -x -C "$SRC"
docker build --build-arg GIT_REVISION=$REV -t shift-scheduler:$REV "$SRC"
docker run -d --name shift-scheduler -p 3000:3000 shift-scheduler:$REV
```

배포 후 확인: `GET /` 200, `POST /api/schedule`에 `algorithm-engine/sample_input.json` → 200 `SUCCESS`, `'{bad'` → 400.
롤백은 이전 커밋 태그 이미지로 컨테이너를 다시 띄운다. 배포 호스트·레지스트리는 아직 정하지 않았다.

## 엔진 규칙 매핑

| 규칙 | 구현 |
|---|---|
| Hard 1 주당 최대 근로시간 | ISO 주 단위로 `min(rules.max_weekly_hours, 직원 max_weekly_hours)` 이하. `employees[].prior_week_hours`(선택, 기본 0)를 첫 주 합계에 더해 기간 경계 주도 검사 |
| Hard 2 최소 휴식 | 전날 종료 ~ 다음날 시작 < `min_rest_hours` 조합 금지 (Closing→Opening 자동 차단). `employees[].prior_last_shift_end`(선택)로 직전 기간 마지막 근무 종료 시각부터 휴식이 부족한 시프트도 금지 |
| Hard 3 연속 근무 | 임의 `max_consecutive_days+1`일 구간 근무일 ≤ 제한값. `employees[].prior_consecutive_work_days`(선택, 기본 0)로 직전 기간 연속 근무를 이어받아 기간 경계도 검사 |
| Hard 4 휴가 보호 | `approved_leaves` 날짜 전 시프트 0 고정 |
| Hard 5 인원·숙련도 | 시프트별 `min_count`, `min_senior` 하한 |
| Hard 6 순환 패턴 | `rules.rotation_pattern {work_days, off_days}`가 있으면 풀타임만 대상. 직원별 위상(`rotation_offset`, 기간 시작일 기준)을 솔버가 골라 근무일 1시프트·휴무일 0 (휴가일은 0). `work_days > max_consecutive_days`는 `INVALID_INPUT`. `employees[].rotation_offset`(선택)을 주면 그 위상으로 고정 |
| Soft 2 기피 시프트 균등 | 풀타임 간 기피 시프트·주말 횟수 최대-최소 편차 최소화 |
| Soft 3 파트타임 가용시간 | `available_time_slots` 밖 시프트 배정 금지 |

`rules` 키(선택)로 기본값을 덮어쓸 수 있다: `max_weekly_hours`, `min_rest_hours`, `max_consecutive_days`, `undesirable_shifts`, `default_hourly_wage`, `time_limit_seconds`, `rotation_pattern`.

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
