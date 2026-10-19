# 직원 공유(3단계) + Supabase 이전 통합 QA

## 결론

**통과(조건부).** `docs/planning/calendar.md` 7-3 확인 항목 1~12, 관리자 링크 영역, `accounts.mjs` create/invite 실패 경로를 로컬 Postgres 17 통합본에서 확인했다. 수정 요청할 결함은 없다. 판단이 필요한 LOW 1건과 실기기에서만 확인할 수 있는 항목 2건이 남는다.

- **LOW — 바뀐·없는 코드의 `/s/<코드>` 화면은 HTTP 200**: 7-3 확인 항목 3은 "이전 코드의 `/s/`·`/api/s/`는 404"다. `/api/s/`는 404지만, `/s/` 페이지는 서버에서 코드를 확인하지 않고 껍데기를 200으로 낸다. 그 뒤 클라이언트가 API 404를 받아 "링크를 열 수 없습니다…"를 보여 준다(`web-client/src/app/s/[code]/page.tsx:24-27`, `StaffView.tsx:49`). 헤더(no-store·noindex·no-referrer)와 robots meta는 붙어 있어 캐시·색인 위험은 없다. 사용자가 보는 화면도 계약과 같다. 계약 문구를 "화면은 오류 문구"로 고칠지, 페이지에서 `storeIdByCode`로 `notFound()`를 낼지 결정이 필요하다.
- **미확인 — 실기기**: Android Chrome "홈 화면에 추가" 설치와 설치 앱의 시작 주소(항목 10), 실제 360px 휴대폰 조작(항목 8)은 실기기가 없어 확인하지 못했다. 대신 헤드리스 Chromium에서 모바일 에뮬레이션으로 확인했다(아래).

## 환경

- `postgres:17` 컨테이너(127.0.0.1:54329)에 `web-client/db/migrations/001_init.sql`만 적용했다. QA 후 컨테이너를 삭제했다.
- 공유 트리를 scratchpad로 복사해 `next build` → `next start -p 3127`. `.env*`는 복사하지 않고 QA 전용 env를 따로 썼다. 공유 트리 build/dev와 git은 쓰지 않았다.
- 세션은 `scripts/accounts.mjs dev-session`. 근무표 입력은 `algorithm-engine/sample_input.json`에 민감 값 카나리아(시급 98765~, 가용시간·메모 문자열)를 넣었다. 결과는 fe의 엔진 결과 fixture를 썼다.
- 검사 스크립트: `~/.cache/shift-scheduler-qa-checks/`(README.txt). 비밀 값과 쿠키는 넣지 않았다.

## 결과

| 7-3 항목 | 결과 | 근거 |
|---|---|---|
| 1 베타 꺼짐 | PASS | `/s/x`·`/api/s/x`·`/api/share-link`가 로그인 여부와 상관없이 404이고, 셋 다 `Cache-Control: no-store`·noindex·no-referrer가 붙는다(01 리뷰 LOW 수정 확인). 관리자 화면에는 링크 영역이 없다. |
| 2 켬·로그아웃 | PASS | `/s/<코드>`는 200이고 로그인으로 보내지 않는다. `GET`·`POST /api/share-link`는 401 + `no-store`(조기 반환 401 수정 확인). |
| 3 만들기·새로 만들기 | PASS / LOW | 22자 코드가 나오고, 새로 만들면 이전 코드의 `/api/s`는 바로 404 + "링크를 열 수 없습니다."이며 화면도 같은 문구다. `/s/` HTTP 상태는 위 LOW 참고. 형식 오류·없는 코드·23자·대소문자 변형·SQL 문자열도 모두 같은 404를 낸다. |
| 4 allowlist | PASS | 최상위·period·shift·day·leave 키 순서까지 계약과 같다. 근무조는 정의 순서이고 Off(hours 0)는 빠진다. 직원은 가나다순이다. 본문에서 카나리아 20종(시급 값, `employment_type`, `employee_id`, `assignment_reason`, fairness, `rotation_offset`, `level`, `preferences`, 근무표 id 등)은 0건이다. |
| 5 게시본만 | PASS | 작성 중(10월)·게시 취소(9월)는 나오지 않는다. 12월 게시를 취소하면 다음 요청부터 사라진다. 게시본 없는 매장은 "아직 게시된 근무표가 없습니다…"를 보여 준다. |
| 6 두 매장 | PASS | A 코드 응답에는 B 매장 전용 이름이 없고, B 코드는 B 매장 근무표만 보여 준다. 다른 매장 근무표 API는 404다. |
| 7 헤더·meta | PASS | `/api/s` 200·404와 `/s` 화면 모두 헤더 3종이 있고, 화면 HTML에 `<meta name="robots" content="noindex, nofollow">`가 있다. |
| 8 모바일 | PASS(에뮬) | 360·390폭(Android UA, touch)에서 가로 스크롤이 없다. 이름 선택 → 내 근무 25건(휴가 포함) → 일(다음 날 이동) → 주 보기가 동작한다. 새로고침 후에도 이름이 기억되고 키는 `shift-scheduler:staff-name:<코드>`다. 저장된 이름이 목록에 없으면 선택하지 않는다. 배정 없는 직원에게는 "이 기간에는 배정된 근무가 없습니다."가 나온다. |
| 9 여러 게시본 | PASS | 오늘 12/5 → 12월, 11/15 → 11월, 10/20 → 11월(가장 가까운 미래), 2027/1/10 → 12월(가장 최근 과거). 다른 기간으로 바꿀 수 있고, 게시본이 하나면 선택 상자 대신 기간 글자만 보인다. |
| 10 베타·PWA | PASS(헤드리스) / 실기기 미확인 | 베타 배지가 보인다. manifest 필드가 계약과 같고 `start_url`은 없다. 아이콘 3개 모두 200이다. `/s`에만 manifest·apple-touch-icon·theme-color가 있고 관리자 화면에는 없다. CDP `Page.getAppManifest` 오류 0, `Page.getInstallabilityErrors` 0. |
| 11 키보드·대비 | PASS | Tab 순서는 기간 → 이름 → 내 근무 → 일 → 주이고, 화살표로 이름을 고르고 Enter·Space로 보기를 바꾼다. 포커스 표시가 있다. 보이는 글자 234개의 WCAG 대비는 라이트 최저 5.38:1, 다크 최저 5.98:1로 미달이 없다. |
| 12 회귀 | PASS | fe 회귀 스크립트를 이 서버(Postgres)에서 다시 실행했다. 회귀 26, 로그인 35, 달력 22, 폼 13, 저장·게시 12, 레이아웃 5, 접근성 5로 118/118 통과. |

**관리자 링크 영역**: 링크가 없을 때는 `[링크 만들기]`만 보인다. 읽기 전용 주소와 안내 "게시된 근무표만 직원에게 보입니다."가 있다. `[복사]`하면 클립보드에 주소가 들어가고 `aria-live`로 "복사했습니다"를 알린다. 복사가 실패하면 실패 문구와 함께 입력칸이 선택된다. `[링크 새로 만들기]`는 확인 문구가 계약과 같고, Esc로 취소하면 링크가 그대로다. 확인하면 새 링크가 나오고 이전 코드는 바로 404다.

**`accounts.mjs` 실패 경로**: 모두 exit 1이고, 실행 전후 `stores` 스냅샷이 같다.

- create: `KAKAO_REDIRECT_URI` 없음, `javascript:`, 파싱 불가 값, 이름 없음, `DATABASE_URL` 없음, DB 접속 불가.
- invite: URI 없음, `ftp:`, 없는 매장, id 없음.
- 기존 초대 해시는 실패한 invite 뒤에도 그대로였다.
- 트리거로 초대 UPDATE를 강제로 실패시키면 create는 매장 INSERT까지 롤백되고(행 0), invite도 변경이 없다.
- 정상 create·invite는 동작한다.
- DB 오류 출력에 접속 문자열과 비밀번호가 나오지 않음을 카나리아로 확인했다.

## 참고(수정 요청 아님)

- `accounts.mjs invite`를 id 없이 실행하면 "매장 undefined이(가) 없습니다."가 나온다.
- DB 접속 실패·쿼리 실패 시 처리되지 않은 예외 스택이 그대로 출력된다. 운영자 스크립트라 영향은 낮다.
