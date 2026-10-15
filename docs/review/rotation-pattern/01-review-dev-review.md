# rules.rotation_pattern 코드 리뷰

검토 대상: `algorithm-engine/solver.py`, `algorithm-engine/test_solver.py`, `README.md`의 요청된 변경 범위.

## 결론

수정 후 재검토가 필요하다. 기간 내부의 위상/휴가 처리는 의도대로 동작하지만, 기간 경계에서 상태가 이어지지 않아 실제 연속 스케줄 운용 시 순환 패턴과 최대 연속 근무 제한을 깨뜨릴 수 있다. 또한 새 입력 필드의 타입 검사가 API 계약대로 `INVALID_INPUT`을 보장하지 않는다.

## Findings

### MUST-FIX — 기간마다 위상을 새로 선택해 기간 경계에서 패턴과 연속근무 제한이 끊긴다

- 근거: `algorithm-engine/solver.py:41-44`, `algorithm-engine/solver.py:125-136`
- `_rotation_workdays`는 매 요청의 `schedule_period.start_date`를 인덱스 0으로 삼고, 각 `solve()` 호출에서 직원별 위상을 다시 자유롭게 선택한다. 이전 기간의 마지막 근무일이나 기존 위상을 입력받는 경로가 없다.
- 재현: 직원 1명, 매일 최소 1명인 8시간 시프트, `rotation_pattern={work_days:5, off_days:1}`, `max_consecutive_days=5`로 2026-11-01..05와 2026-11-06..10을 각각 호출하면 두 호출 모두 `SUCCESS`, 5개 근무, `rotation_offset=0`을 반환한다. 합치면 같은 직원이 10일 연속 근무한다.
- 영향: 월별/주별로 스케줄을 연속 생성하는 정상 운용에서 “5일 근무-1일 휴무”와 최대 5일 연속근무가 동시에 깨진다. 법적 제약 검증도 각 기간 안에서만 0건으로 보고된다.
- 필요한 방향: 이전 기간에서 이어지는 고정 위상/절대 기준일 또는 경계 직전 근무 이력을 입력 계약에 포함하고, 모델과 `validate()`가 같은 연속 상태를 사용해야 한다. 제품이 의도적으로 기간별 패턴 재시작을 허용한다면 그 제한을 명시해야 하지만, 그 경우에도 최대 연속근무의 경계 이력은 별도로 필요하다.

### HIGH — `rotation_pattern` 타입 오류가 `INVALID_INPUT` 계약을 지키지 않는다

- 근거: `algorithm-engine/solver.py:68-74`
- `rp`가 객체인지 확인하기 전에 `.get()`을 호출하고, Python에서 `bool`은 `int`의 하위 타입이므로 `isinstance(True, int)`가 참이다.
- 재현 1: `rotation_pattern="2-1"` 입력은 `AttributeError: 'str' object has no attribute 'get'`으로 엔진을 중단시킨다.
- 재현 2: 샘플 입력에 `rotation_pattern={work_days:true, off_days:1}`을 넣으면 입력 오류로 거부되지 않고 모델을 풀어 최종 `INFEASIBLE`을 반환한다.
- 영향: 외부 JSON의 잘못된 새 필드가 안정적인 `INVALID_INPUT` 응답 대신 500성 예외 또는 잘못된 진단으로 노출된다.
- 필요한 방향: `rp`가 dict인지 먼저 확인하고, 각 값에 대해 `type(value) is int`와 양수 조건을 검사해야 한다.

## 요청 항목별 판단

- `validate()` 독립성: 정상적인 솔버 출력 형태에서는 기록된 위상을 맹신하지 않고 실제 근무일 집합을 다시 계산하므로 적절하다. 서로 다른 위상 기록도 위반 처리한다. 다만 결과 스키마 자체의 타입 검증기는 아니어서 모든 `rotation_offset`이 같은 비정수 값이면 `TypeError`가 난다.
- 휴가 상호작용: 패턴 시계는 계속 진행하고, on-day 휴가만 근무 집합에서 제외한다. 2-1 패턴에서 첫날이 휴가이고 둘째 날 근무, 셋째 날 휴무인 결과가 `validate()` 0건임을 확인했다. 설명된 설계와 일치한다.
- `work_days > max_consecutive_days`의 `INVALID_INPUT`: 이를 직원/기간과 무관한 규칙 구성의 상호 모순으로 정의한다면 타당하다. “항상 해가 없다”는 근거는 휴가, 풀타임 부재, 짧은 기간 때문에 엄밀하지 않지만, 현재 오류 메시지는 두 규칙의 직접 충돌을 정확히 말한다.
- `Peak_PartTime` 배정: 현재 계약은 풀타임의 패턴 근무일에 “정확히 1시프트”만 요구하고 시프트별 고용형태 적격성을 정의하지 않는다. 따라서 4시간 Peak 배정은 현 계약과 일치한다. 풀타임 근무일의 최소 시간 또는 시프트 적격성이 필요하다면 별도 입력 규칙이어야 한다.

## 검증

- `cd algorithm-engine && .venv/bin/python test_solver.py`: 통과 (`ok`, `ok rotation`).
- 위 두 findings는 별도 최소 재현 입력으로 실제 반환 상태와 예외를 확인했다.

