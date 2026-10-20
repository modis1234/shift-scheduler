# 내 일정 문장 해석 AI 보조 재재검토

대상: `qitem-20261020055129-9707c699` (이전 HIGH 1건·MEDIUM 1건의 수정분)

## Finding

### HIGH — 결정적 삭제 절이 공백형 부정을 삭제 명령으로 확정한다

- 근거: `web-client/src/lib/manager-pattern-language.ts:26-31`, `web-client/src/lib/manager-pattern-language.ts:40-52`, `web-client/src/lib/manager-pattern-ai.ts:55-68`
- `DELETE`에서 `삭제`·`제거` 뒤의 접속 표현은 선택 사항이고 `END`는 공백도 경계로 인정한다. 따라서 동사 뒤 공백으로 이어지는 부정어를 확인하기 전에 삭제 절 일치가 끝난다.
- 재현:
  - `splitLeadingDelete("모든 일정 삭제 안 하고 2일 근무하고 하루 휴무")` → `{ deleteExisting: true, rest: "안 하고 2일 근무하고 하루 휴무" }`
  - `splitLeadingDelete("모든 일정 삭제 말고 2일 근무하고 하루 휴무")` → `{ deleteExisting: true, rest: "말고 2일 근무하고 하루 휴무" }`
  - 이후 모델이 남은 문장을 `supported: true`, `deleteScope: "none"`, 유효한 2일/1일 규칙으로 반환하면 `toCommand()`는 `lead.deleteExisting`을 그대로 사용한다.
- 영향: 사용자가 명시적으로 삭제하지 말라고 한 문장에서도 모델이 앞의 짧은 부정 표현을 무시하는 한 선택 기간의 기존 일정 전체가 삭제된다. 삭제 여부를 AI와 독립적으로 결정한다는 안전 경계가 아직 성립하지 않는다.
- 수정 방향: 삭제만 하는 문장은 삭제 동사 뒤가 실제 문자열 끝(존댓말 포함)이어야 하고, 뒤에 등록 문장이 이어지면 `삭제하고`·`삭제 후`처럼 허용한 접속 표현까지 결정적 파서가 반드시 소비해야 한다. 적어도 공백 뒤 `안`, `말고`, `하지` 등의 부정형은 삭제 절로 인정하지 않는다.

## 해소 확인

- 앞에 제외 조건이 붙은 `병원 일정 빼고 모든 일정 삭제`, `근무 일정은 제외하고 기존 일정 다 지워`는 삭제로 인식하지 않는다.
- 붙임형 부정 `모든 일정 삭제하지 말고 …`는 삭제로 인식하지 않는다.
- AI 결과는 `deleteScope === "none"`만 허용하며, 삭제 여부는 `splitLeadingDelete()` 결과만 사용한다.
- `3일간`, `사흘간`, `사흘 동안`이 들어간 복수 패턴은 거부된다.
- `쉬프트 근무`, `휴일근무`, `하루방 근무`, `3일차 교육`은 정상 제목으로 계속 허용된다.

## 검증

- `splitLeadingDelete()` 삭제·제외·붙임형/공백형 부정 입력 직접 실행
- `parseManagerCommand()` 기간 표현 및 정상 제목 입력 직접 실행
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **CHANGES REQUESTED (HIGH 1건)**
