# 엔진 입력 폼 3차 재검토

## 결론

unsafe integer의 원문 손실 차단은 확인했으나 감지기가 유효한 지수 표기 실수도 거부한다. 이로 인해 현재 엔진이 허용하는 입력의 미지정/확장 필드가 불필요하게 막히므로 좁은 수정 후 재검토 권고.

## 이전 지적 상태

- JSON 정수 토큰 반올림을 제출 전에 막음: `hasUnsafeInt`가 `validateInput` 시작에서 실행되고 `handleGenerate`가 검증 오류 시 전송하지 않으므로 해결.
- `prior_week_hours` 실효 상한: 이전 재검토에서 해결 확인.

## 발견 사항

- **LOW — unsafe integer 감지가 정수 표기가 아닌 지수 실수도 차단** — `web-client/src/app/InputForm.tsx:68-74,78`. 재현 입력은 샘플의 유효한 필드들을 유지하고 임의 확장 키 `future_extension: 1e20`를 추가하는 것. Python JSON 파서는 `1e20`을 float로 읽으며 현재 엔진의 `_check_input`은 알 수 없는 최상위 키를 거부하지 않는다. 하지만 JS `JSON.parse("1e20")` 결과에 `Number.isInteger`는 `true`, `Number.isSafeInteger`는 `false`이므로 `hasUnsafeInt`가 이를 unsafe integer로 오인해 폼 검증 및 생성 요청을 막는다. Node로 위 두 판정을 재현했다. 의도한 정수 토큰 초과 감지만 하도록 원문 lexical 형태를 구분하거나, 이 검사를 엔진의 정수 필드에 한정할 필요가 있다.

## 검증

- `npm run lint`: 통과.
- `npm run build`: 통과 (Next.js 15.5.27).
- `JSON.parse("1e20")`에 대한 Node `Number.isInteger`/`Number.isSafeInteger`: 각각 `true`/`false`.

