# 내 일정 문장 명령 — fromToday 위치 재재검토

대상: `qitem-20261020042953-75a66046` (`feature/nl-delete-color` 미커밋 작업 트리)

## 판정

지적 없음. 이전 MEDIUM은 해소됐다.

- `parseManagerCommand()`가 실제 앞머리에서 `오늘부터|오늘 날짜부터|오늘 기준으로`를 제거한 경우에만 `fromToday: true`를 반환한다.
- 앞쪽 삭제 절을 제거한 직후의 오늘 표현도 정상적으로 `fromToday: true`가 된다.
- `2일 오늘부터 점검하고 하루 휴무`, `2일 오늘 기준으로 점검하고 하루 휴무`는 각각 제목을 그대로 보존하고 `fromToday: false`를 반환한다.
- `parseManagerPatternInput()`은 같은 구조화 결과의 `fromToday`를 사용하므로 파서와 날짜 불일치 검증의 위치 판단이 일치한다.
- `시작일부터`, `다시`는 문서 정의대로 `fromToday: false`다.
- 이전 삭제·색 절 경계 수정도 회귀하지 않았다.

## 검증

- fromToday 위치 행렬 9건 및 이전 오해석 회귀 2건: 통과
- 삭제+색 결합 명령: 통과
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **PASS**
