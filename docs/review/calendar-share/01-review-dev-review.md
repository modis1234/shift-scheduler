# 직원 공유 API 서버 검토

## 결론

응답 allowlist, 매장 범위 지정, 링크 코드 형식 검사 및 재발급 동작은 계약과 일치한다. LOW 한 건: 직원 공유 베타를 끈 상태의 404와 관리자 공유 링크 API의 middleware 생성 401에 `Cache-Control: no-store`가 빠진다.

## 발견 사항

- **LOW — 공유 API의 middleware 생성 응답이 캐시 금지 헤더를 누락** — `web-client/src/middleware.ts:17-20,38-43`. `STAFF_SHARE_BETA`가 꺼져 있을 때 `/api/s/*`와 `/api/share-link`는 18-20행에서 즉시 404를 반환하고, 인증이 필요한 `/api/share-link`의 비로그인 401은 38-43행에서 반환한다. 두 경로 모두 이후 `isShare` 헤더 부착(29-34행)이나 route handler의 no-store 응답(share-link/route.ts:11,18)에 도달하지 않는다. 따라서 이 응답들에는 `Cache-Control: no-store`가 없다. 계약은 관리자 API와 `/api/s/*` 응답에 no-store를 요구한다. 특히 베타 비활성 404는 캐시 가능한 404 응답이 될 수 있어 베타 재활성화 후에도 중간 캐시에 남을 수 있다. middleware의 모든 공유 API 종료 응답에도 동일한 cache-control을 설정해야 한다.

## 확인한 항목

- `web-client/src/app/api/s/[code]/route.ts:16-35,39-46`: 저장 객체를 통째로 반환하지 않고 계약상 필드만 새로 구성한다. 게시본만 `listPublished(storeId)`로 가져오며 직원 ID·임금·고용형태 등은 응답에 복사하지 않는다.
- `web-client/src/lib/schedules.ts:78-95`: 16바이트 난수 base64url 코드를 생성하고, 22자 형식이 맞지 않으면 DB 조회 전에 거부한다. store ID 조회 후에는 해당 ID로만 게시본을 조회한다.
- `web-client/src/middleware.ts:11-12,24-35`: `/s/*`와 `/api/s/*`만 로그인 우회하며 no-store·robots·referrer 헤더를 붙인다. 페이지는 베타가 꺼지면 `notFound()` 처리하고(`web-client/src/app/s/[code]/page.tsx:24-27`), 동적 렌더링으로 요청 시 플래그를 읽는다.
- 직원 API의 미등록·폐기·형식 오류 코드 및 삭제된 매장은 같은 404 계약 문구를 쓴다(`api/s/[code]/route.ts:14,39-44`).

## 검증

- `npm run lint --prefix web-client`: 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json`: 통과.
- BE가 보고한 scratchpad API 테스트(두 매장, 게시 상태, 응답 필드·헤더 검사) 결과를 확인했다. 공유 작업 트리에서 build/dev는 실행하지 않았다.
- no-store 누락은 middleware의 조기 반환과 후속 헤더 부착 위치를 대조해 확인했다. 특정 reverse proxy/browser 캐시 조합에서의 재현은 수행하지 않았다.

## 범위 제한

Postgres 저장소 마이그레이션과 직원 화면/PWA는 요청에 따라 검토하지 않았다. `src/lib/schedules.ts`는 공유 코드 조회 및 게시본 조회 인터페이스를 확인하는 데 필요한 범위만 살폈다.
