# 웹 클라이언트 엔진 호출 API 및 화면 검토

## 결론

승인 가능. 요청 범위에서 영향 있는 결함 없음.

엔진 입력·출력 형식 변경 없음.

## 확인 결과

- `web-client/src/app/api/schedule/route.ts:16-33`: `Content-Length` 선검사와 실제 스트림 바이트 계수가 함께 적용된다. 1,048,577바이트 요청은 일반 `Content-Length` 전송과 `Transfer-Encoding: chunked` 전송 모두 413이었다.
- `web-client/src/app/api/schedule/route.ts:83-91`: 잘못된 JSON과 배열·원시값·`null`을 엔진 실행 전에 400으로 거부한다. `{bad` 재현은 400이었다.
- `web-client/src/app/api/schedule/route.ts:39-76`: `mkdtemp`로 만든 입력 파일을 `finally`에서 제거하며, `spawn` 인수 배열을 사용해 셸을 거치지 않는다. 타이머는 직접 자식에 `SIGKILL`을 보내고 timeout 결과를 504로 변환한다.
- `web-client/src/app/api/schedule/route.ts:70-74,93-104`: stderr는 서버 로그에만 기록한다. `{"employees":"x"}` 재현에서 서버에는 Python traceback이 남았지만 응답은 `{"error":"엔진 실행에 실패했습니다."}`뿐이었다.
- `web-client/src/app/ScheduleRunner.tsx:54-87`: 기간은 UTC 자정과 86,400,000ms 단위로 계산한다. carry 매핑과 순환 위상 계산은 README의 계약과 일치한다.
- `web-client/src/app/ScheduleRunner.tsx:203-204,226-236,244-252`: 결과와 요청 당시 파싱 입력을 한 객체로 보관하므로, 요청 후 textarea를 수정해도 그리드와 다음 기간 입력은 실제 전송 입력을 기준으로 한다.
- `web-client/src/app/ScheduleRunner.tsx:94-190`: 직원×기간 그리드가 요청 당시 직원·기간·휴가를 사용한다. 날짜/직원 헤더에 `scope`, 표에 caption, 범례에 텍스트가 있고 시프트도 색상만이 아니라 이름으로 구분된다.
- `web-client/src/app/page.tsx:5-12`, `web-client/src/app/layout.tsx:15-30`, `README.md:16-35`: 샘플 입력 로딩, 한국어 문서 메타데이터와 언어, 엔진 가상환경·경로 실행 안내가 구현과 일치한다.

## 검증

```text
npm run lint                      PASS
npm run build                     PASS (Next.js 15.5.27)
.venv/bin/python test_solver.py   PASS
sample_input.json POST            200
{bad POST                         400
{"employees":"x"} POST           500, stderr 비노출
1,048,577 bytes POST              413 (Content-Length, chunked 각각 확인)
git diff --check                  PASS
```

`{"employees":"x"}`에서 엔진이 `KeyError`로 종료하는 기존 입력 검증 문제는 요청서에 명시된 엔진 범위 사항이며, 웹 변경분의 결함으로 집계하지 않았다.
