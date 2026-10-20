# 달력 공휴일 표시 재검토

대상: `qitem-20261020041334-4117da4b585e786f` (`fix/holidays-labor-constitution` 작업 트리)

## 판정

지적 없음. 이전 HIGH는 해소됐다.

- `web-client/src/lib/holidays.ts:11,17`에 2026 노동절·제헌절이 추가됐다.
- `web-client/src/lib/holidays.ts:33-34,38-39`에 2027 노동절·제헌절 및 각 대체공휴일이 추가됐다.
- 6개 날짜를 `holidayName()`에 직접 전달해 기대 이름이 반환됨을 확인했다.
- 2027-05-01·07-17은 토요일이고 대체공휴일 05-03·07-19는 월요일로, 우주항공청 2027년 월력요항과 일치한다.
- 항목은 연도·날짜 오름차순을 유지한다.

## 검증

- 6개 날짜 반환값 및 UTC 요일 직접 검증: 통과
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **PASS**
