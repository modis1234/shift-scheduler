# 기간 경계 주당 근로시간 재검토

## 결론

승인 가능. 추가 결함 없음.

사용자가 승인한 A안대로 `trailing_week_hours`가 `end_date` 다음 날의 ISO 주를 기준으로 계산된다. 일요일 종료 시 0이 되어 다음 월요일에 그대로 전달해도 새 주를 잘못 차감하지 않는다.

## 확인 결과

- `algorithm-engine/solver.py:74-78`: 다음 날의 ISO 주를 기준으로 해당 주의 배정 시간만 합산한다.
- 첫날도 목표 주에 속할 때만 `prior_week_hours`를 포함한다.
- `algorithm-engine/solver.py:390-398`: validator가 같은 헬퍼로 직원별 키·정확한 `int` 타입·값을 대조한다.
- `algorithm-engine/test_solver.py:112-119`: 일요일 carry 0을 월요일에 그대로 넘겨도 `SUCCESS`인 회귀가 추가됐다.
- `README.md:55`: 승인된 새 의미와 “그대로 전달” 규칙이 일치한다.
- 형식 변경 필요: **승인 완료**. 키와 타입은 유지되고, 의미 변경은 dev-lead가 전달한 사용자 A안 승인에 따른다.

추가 경계 행렬도 확인했다.

```text
토요일 종료, 같은 주 prior 4 + 당일 8 -> 12
일요일 종료                         -> 0
월요일 단일 기간, prior 4 + 당일 8 -> 12
일요일~월요일 기간                  -> 월요일 8만 carry
여러 주를 지나 마지막 월요일 종료   -> 마지막 월요일 8만 carry
```

전체 테스트: `ok 100`, `ok rotation 90`.
