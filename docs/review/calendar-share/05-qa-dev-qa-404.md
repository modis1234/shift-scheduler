# /s/<코드> HTTP 404 수정 QA 재확인

## 결론

**통과.** `03-qa-dev-qa.md`의 LOW(바뀐·없는 코드의 `/s/` 화면이 HTTP 200)가 고쳐졌다. 이제 7-3 확인 항목 3대로 `/s/`도 404를 낸다. 범위는 `web-client/src/app/s/[code]/page.tsx`의 `storeIdByCode` 서버 확인과 새 `not-found.tsx`다(`04-review-dev-review-404.md`).

## 환경

03과 같다. postgres:17(127.0.0.1:54329)을 새로 띄워 `001_init.sql`을 적용했고, 수정본을 scratchpad로 다시 복사해 build했다. 서버는 `next start -p 3127`이다. QA 후 컨테이너를 삭제했고, 공유 트리 build/dev와 git은 쓰지 않았다. 스크립트는 `~/.cache/shift-scheduler-qa-checks/`에 있다.

## 확인

- **바뀐 코드**: 링크를 새로 만든 뒤 이전 코드의 `/s/<코드>`는 HTTP 404이고 `role="alert"`로 "링크를 열 수 없습니다. 매장 관리자에게 새 링크를 요청해 주세요."가 나온다. 390폭에서 가로 스크롤이 없다.
- **없는·형식 오류 코드**: `short`, 22자 미등록 코드, 23자 코드 모두 같은 404와 같은 문구다. 어느 경우인지 구분할 수 없다.
- **베타 꺼짐**: `/s/` 미등록·형식 오류 코드가 같은 404 화면을 낸다.
- **헤더**: 모든 404에 `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`가 있다.
- **404 화면 metadata**: manifest 링크가 없다(설치 대상 아님).
- **404 화면 대비**: 라이트 최저 15.82:1, 다크 최저 14.18:1.
- **열어 둔 화면**: 링크를 새로 만든 뒤 새로고침하면 404 화면이 나온다. 클라이언트의 API 404 처리(`StaffView.tsx`)도 남아 있다.
- **회귀(직원 공유 범위)**: 03의 API·화면 점검을 새 DB에서 다시 실행했다. API 53, 화면 51, 내 근무 없음·기간 1개 2로 모두 통과했다. 정상 코드 `/s/`는 200이고 헤더 3종, `noindex, nofollow` robots meta, manifest가 그대로다.

## 참고(수정 요청 아님)

- 404 화면의 robots meta는 Next 기본값 `noindex`이고 `nofollow`가 없다. 정상 화면은 `noindex, nofollow`다. `X-Robots-Tag: noindex, nofollow` 헤더가 같은 응답에 있고 404 화면에는 링크가 없어 실제 영향은 없다.
- Android 실기기 설치와 실제 360px 휴대폰 조작은 03에 적은 대로 여전히 확인하지 못했다.
