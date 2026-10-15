# /api/schedule 엔진 동시 실행 제한 검토

## 결론

승인 가능. 검토한 변경 범위(web API route와 README)에서 영향 있는 결함 없음.

## 확인 결과

- `web-client/src/app/api/schedule/route.ts:16-20`: 환경값을 모듈 로드 시 한 번 파싱하고 1 이상의 정수만 사용한다. 잘못된 값은 기본 2로 대체하며 경고한다. 프로세스 단위 제한임도 주석/README에 명시되어 있다.
- `route.ts:88-99`: 본문 크기 초과, JSON 파싱 실패, 객체가 아닌 입력은 카운터 확인/증가 전에 반환되어 제한 슬롯을 점유하지 않는다.
- `route.ts:101-112`: 단일 Node 이벤트 루프 안에서 await 없는 check-and-increment라 동시 요청이 모두 같은 마지막 슬롯을 선점하지 않는다. `runEngine` 전체를 `try/finally`로 감싸 정상 결과와 throw 모두 한 번 감소한다. `runEngine`의 임시 파일 제거도 내부 `finally`가 끝나야 Promise가 settle하므로, 엔진 프로세스/정리 완료 전 슬롯이 해제되지 않는다.
- `route.ts:114-125`: 슬롯 반환 후 기존 timeout/엔진 실패/잘못된 엔진 출력 응답 흐름이 유지된다. 429는 지정된 `Retry-After: 30`을 포함한다.
- `README.md:36`: 설정 기본값, 429 거절 동작, 프로세스 범위를 설명한다.
- `npm run lint`: 통과.
- `npm run build`: 통과 (Next.js 15.5.27).

## 한계

이 검토는 모듈 카운터가 보장하는 단일 Node 프로세스 범위에 한정된다. 여러 프로세스/인스턴스 전체의 상한은 요청 의도대로 보장하지 않는다.

