# /s/<code> 404 수정 검토

## 결론

**통과 — 수정 요청 결함 없음.** 범위는 `page.tsx`의 서버 측 공유 코드 확인과 새 `not-found.tsx` 화면이다. 일반 코드, 잘못된 코드, 중지된 코드의 구분을 노출하지 않고 계약의 404 문구를 반환한다.

## 확인한 변경

- `web-client/src/app/s/[code]/page.tsx`: 베타 토글을 먼저 확인하고, `storeIdByCode(code)`가 유효한 코드 형식만 DB 조회하며 미등록 코드는 `null` 반환함을 확인했다(`web-client/src/lib/schedules.ts`). 미등록이면 `notFound()`로 종료하고 유효 코드만 기존 `StaffView`로 진행한다.
- `web-client/src/app/s/[code]/not-found.tsx`: 기획서 4.3의 공통 오류 문구를 `role="alert"`로 표시한다. 베타 비활성·잘못된 코드·중지된 링크를 구별하지 않는다.
- 기존 직원 API의 404 UI 처리는 남아 있어 페이지를 연 뒤 링크가 폐기되는 경우에도 같은 오류 문구를 표시한다.
- `/s/*` 응답에는 기존 middleware가 `no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`를 계속 붙인다.

## 검증

- `npm --prefix web-client run lint` 통과.
- `web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json` 통과.
- 공유 작업 트리가 아닌 임시 복사본에서 `STAFF_SHARE_BETA=1 npm run build` 통과.
- 임시 복사본을 3417 포트로 실행해 `/s/abc`를 요청한 결과 `HTTP 404`, 계약 문구, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` 확인.
- 유효 형식이지만 없는 코드의 DB 경로는 이 임시 실행에서 DB를 연결하지 않아 직접 재현하지 않았다. 제공된 QA 기록에는 그 경로와 이전 코드의 404 검증이 포함되어 있다.

## 미확인 사항

없음. 확인하지 않은 유효 형식 코드의 DB 경로는 이번 변경의 새 분기(존재 여부 조회)와는 별개이며, 기존 QA 근거를 참조했다.
