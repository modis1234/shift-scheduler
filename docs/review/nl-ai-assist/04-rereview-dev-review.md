# 내 일정 문장 해석 AI 보조 삭제 절 재검토

대상: `qitem-20261020055703-640dd3bb` (공백형 부정 HIGH 수정분)

## Finding

### HIGH — `삭제하고` 뒤 보조용언 부정을 삭제 접속 절로 오인한다

- 근거: `web-client/src/lib/manager-pattern-language.ts:26-34`, `web-client/src/lib/manager-pattern-language.ts:43-55`, `web-client/src/lib/manager-pattern-ai.ts:72-83`
- 수정된 `DELETE`는 `삭제하고` 뒤가 공백이면 완결된 삭제 접속 절로 즉시 인정한다. 하지만 한국어에서 같은 표면형 뒤에 `싶지 않다` 같은 보조용언 부정이 올 수 있다.
- 재현:
  - `splitLeadingDelete("모든 일정 삭제하고 싶지 않고 2일 근무하고 하루 휴무")` → `{ deleteExisting: true, rest: "싶지 않고 2일 근무하고 하루 휴무" }`
  - `splitLeadingDelete("모든 일정 삭제하고 싶은 게 아니라 2일 근무하고 하루 휴무")` → `{ deleteExisting: true, rest: "싶은 게 아니라 2일 근무하고 하루 휴무" }`
  - AI에는 이미 `모든 일정 삭제하고`가 제거된 나머지만 전송된다. 모델이 앞의 짧은 말을 무시하고 유효한 2일/1일 규칙과 `deleteScope: "none"`을 반환하면 `toCommand()`는 결정적 파서가 정한 전체 삭제를 그대로 활성화한다.
- 영향: 삭제를 원하지 않는다는 문장이 선택 기간 전체 삭제로 실행될 수 있다. 모델이 삭제 원문을 보지 못하므로 `deleteScope` 검증도 이 오판을 복구할 수 없다.
- 수정 방향: 삭제+등록을 AI 보조 경로에서 함께 허용하려면 접속형 뒤의 첫 토큰까지 검사해 `싶지/싶은/말고/않` 같은 부정·희망 보조 구문을 거부해야 한다. 파생 표현을 완전하게 제한하기 어렵다면, 가장 안전한 경계는 `lead.deleteExisting === true`인 경우 남은 등록 문장도 결정적 파서가 전부 해석할 때만 삭제를 허용하고 AI fallback에는 넘기지 않는 것이다.

## 해소 확인

- `삭제 안 하고`, `삭제 말고`, `삭제하지`, `삭제 2일 …`, `지워 2일 …`은 삭제 절로 인식하지 않는다.
- `삭제하고 2일 …`, `삭제 후 2일 …`, 삭제 단독 `삭제해줘`, `그날 일정 싹 지워줘`는 정상 인식된다.
- 기간 표현 제목 및 정상 제목 회귀는 유지된다.

## 검증

- `splitLeadingDelete()` 부정·보조용언·정상 접속·단독 삭제 입력 직접 실행
- `parseManagerCommand()` 동일 입력 결과 확인
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **CHANGES REQUESTED (HIGH 1건)**
