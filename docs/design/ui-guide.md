# UI 가이드 — 교대근무 스케줄러

사용자: IT에 익숙하지 않은 매장 관리자. 한 달에 한 번 직원·휴가를 넣고 근무표를 만들어 확인한다.
기준 구현: `globals.css` 토큰과 `ScheduleRunner.tsx` 단계형 배치. v2(비주얼 리프레시)에서 바뀐 것은 끝의 '변경 이력'에 있다.

**컨셉(v2): 차분한 정밀함(Calm precision).** 흰 종이 같은 표면, 머리카락 굵기 테두리, 겹친 부드러운 그림자, 인디고 강조색 하나. 앱 아이콘의 인디고→바이올렛 그라데이션은 '브랜드 표시'에만 쓰고 글자 뒤에는 깔지 않는다. Linear·Vercel·Toss 류의 깔끔한 SaaS 톤.

## 1. 원칙

1. **할 일이 순서대로 보인다.** 1 근무 조건 입력 → 2 근무표 만들기 → 3 결과. 단계 번호와 제목을 항상 보인다.
2. **관리자 말로 쓴다.** JSON 키·영문 상태값·오류 코드를 화면에 그대로 보이지 않는다. 문장은 "무엇이 문제 → 무엇을 하면 되는지" 순서.
3. **근무표가 주인공이다.** 결과 그리드는 화면 전체 폭을 쓰고, 한 달(30~31일)이 1440px에서 가로 스크롤 없이 보인다.
4. **색만으로 뜻을 전하지 않는다.** 시프트·휴가·상태는 색 + 글자로 표시한다. WCAG AA(본문 4.5:1, 입력 테두리·포커스 3:1), 키보드 이동, 라이트·다크 모두 지원.
5. **깊이는 은은하게, 강조는 하나만.** 표면 구분은 테두리 + 겹친 그림자로 한다. 강조색(인디고)은 주 버튼·포커스·단계 번호·선택 상태에만 쓴다. 그라데이션은 브랜드 표시(헤더 로고, 로그인 배경 빛)에만 쓴다. 움직임은 150ms 이하, `prefers-reduced-motion`이면 끈다.

## 2. 화면 배치

**단계형(위→아래) 한 열**로 확정한다. 좌우 분할은 그리드 폭(30일)을 반으로 줄여 가로 스크롤을 만들기 때문에 쓰지 않는다.

```
┌ 헤더(sticky) ─────────────────────────────────────────────┐
│ 교대근무 스케줄러 · 설명 한 줄          근무 기간 11월 1일 (일) ~ 11월 30일 · 30일 │
└──────────────────────────────────────────────────────────┘
본문 max-w 1600px, 좌우 여백 32px(모바일 16px), 섹션 간격 24px
┌ ① 근무 조건 입력 ─────────────────── [고급: JSON 직접 편집] ┐
│ 근무 기간 / 근무 규칙 / 근무조·필요 인원 / 직원(N명) / ▸ 지난 기간에서 이어지는 정보 │
│ 확인이 필요한 항목 N건 (경고 상자)                                │
└──────────────────────────────────────────────────────────┘
┌ ② [근무표 만들기] [다음 기간 준비하기]  상태 문구 ─ sticky bottom 16px ┐
┌ ③ 결과 ──────────────────────────────────────────────────┐
│ [상태] [근무 공평성] [총 배정 근무] [근로 규칙 위반] [예상 인건비]  ← 지표 카드 5개 │
│ 안내/알림 상자                                                   │
│ 범례: ■오픈 ■미들 ■마감 ■피크 ■휴가 □쉬는 날                         │
│ 그리드: 직원 열 sticky, 날짜 30열                                   │
└──────────────────────────────────────────────────────────┘
```

- **결과 그리드 폭(가장 중요)**: 직원 열 `w-32`(128px) + 날짜 열 **고정 `w-10`(40px)** → 30일 = 1328px, 1440px 화면 안에 들어간다.
  - 날짜 머리글은 2줄: `1` / `일`(요일). 월은 그리드 위 제목("11월 근무표")으로 한 번만 쓴다. `<th>`에 `aria-label="11월 1일 일요일"`.
  - 칸 안 시프트 이름은 `truncate`(말줄임), 전체 이름은 `title`과 범례로 확인. 한글 2~3자 이름(오픈·미들·마감·피크)은 잘리지 않는다.
  - 주말: **일요일 = danger 색 글자, 토요일 = accent 색 글자**(한국 달력 관례). 주말 열 배경은 `surface-2` 유지.
  - 휴가 칸은 `leave`(danger-soft) + "휴가" 글자. 시프트 팔레트에 빨강 계열을 넣지 않는다(지금 구현 유지).
- **모바일(≤640px)**: 한 열 그대로. 지표 카드는 2열. 그리드·직원 표는 카드 안에서 가로 스크롤하고 첫 열(직원 이름)만 sticky. 페이지 전체는 가로 스크롤이 생기지 않아야 한다.
- 2단계 바는 640px 이상에서만 하단 sticky(결과 영역 아래 `pb-20`, 포커스가 바에 가리지 않게 `scroll-padding`). 640px 미만에서는 바가 입력을 가리므로 sticky 없이 제자리에 둔다.

## 3. 디자인 토큰

v2 값이다. 컴포넌트는 지금처럼 CSS 변수(`@theme` 유틸리티·컴포넌트 클래스)로만 색을 쓴다. 변수 이름은 그대로 두고 값만 바꾸며, 새 변수는 **굵게** 표시했다.

| 토큰 | 라이트 | 다크 | 대비 확인 |
|---|---|---|---|
| bg / surface / surface-2 | #f6f7f9 / #ffffff / #f1f3f6 | #0a0c10 / #12151b / #181c24 | — |
| text | #0f1419 | #eceef2 | 16.9~17.3:1 |
| text-muted | #5b6472 | #9aa3b2 | 5.4~7.2:1 ✅ |
| border (구분선·카드 테두리) | #e4e7ec | #262b35 | 장식용 |
| **border-soft** (보조 버튼 테두리) | **#cfd4dc** | **#353b47** | 버튼은 글자로 식별되므로 기준 없음 |
| border-strong (입력·체크박스 테두리) | #7c8595 | #677086 | 3.4~3.7:1 ✅ |
| accent / accent-hover / accent-fg | #4f46e5 / #4338ca / #ffffff | #8189f8 / #9aa1fa / #0a0c10 | 6.3 / 6.4:1 ✅ |
| accent-soft (선택·단계 번호·info 바탕) | #eef0ff | #1d1f3d | accent 글자 5.5:1 이상 ✅ |
| success·warning·danger (글자/soft 배경) | 지금 값 유지 | 지금 값 유지 | 5.6~7.7:1 ✅ |
| shift-0~5 (fg/bg) | 지금 값 유지 | 지금 값 유지 | 8.1~10.2:1 ✅ |
| **brand-gradient** | `linear-gradient(135deg, #4f46e5, #a21caf)` | 같음 | 글자 뒤 사용 금지(장식 전용) |

- **그림자**(라이트 / 다크)
  - `--shadow-xs`: `0 1px 2px rgb(15 20 25/.05)` / `0 1px 2px rgb(0 0 0/.5)`
  - `--shadow`(카드): `0 1px 2px rgb(15 20 25/.04), 0 4px 12px -2px rgb(15 20 25/.06)` / `0 1px 2px rgb(0 0 0/.5), inset 0 1px 0 rgb(255 255 255/.04)`
  - `--shadow-lg`(떠 있는 것: 생성 바·대화상자·로그인 카드): `0 2px 4px rgb(15 20 25/.04), 0 16px 40px -8px rgb(15 20 25/.14)` / `0 16px 40px -8px rgb(0 0 0/.6), inset 0 1px 0 rgb(255 255 255/.05)`
- **포커스**: 기본 `outline 2px accent, offset 2px`(지금과 같음). 입력은 `border accent + box-shadow 0 0 0 3px color-mix(accent 25%, transparent)` 링.
- 시프트 색 순서: 하늘(0) · 초록(1) · 보라(2) · 노랑(3) · 청록(4) · 남색(5). 근무조 정의 순서대로 배정(지금 구현).
- **타이포**: Noto Sans KR 유지(next/font, 400/500/600/700). 제목은 자간을 조인다. 숫자는 `tabular-nums`.
  - 로그인 제목 24px/700 `-0.02em` · 앱 이름(헤더) 15px/700 `-0.01em` · 섹션 제목 17px/700 `-0.01em` · 본문 14px/1.5 · 보조·표 12~13px · 지표 숫자 24px/700 `-0.02em`.
  - `word-break: keep-all` 유지. (Pretendard가 더 트렌디하지만 Google Fonts에 없어서 next/font/google로 못 쓴다. 쓰려면 폰트 파일을 리포에 넣는 next/font/local이 필요하므로 이번에는 하지 않는다.)
- **간격**: 4px 단위 유지. 카드 안 여백 24px(모바일 16px), 카드 사이 24px, 필드 사이 12px.
- **둥글기**: `--radius-sm` 8px(칩·시프트 칸·체크박스 외 작은 것), `--radius` 10px(입력·버튼·지표 카드·표 테두리), `--radius-lg` 16px(섹션 카드), **`--radius-xl` 20px**(로그인 카드·대화상자), 배지 999px. 카카오 버튼은 카카오 가이드대로 12px.
- **움직임**: `transition: background-color, border-color, box-shadow, transform 150ms ease`. `@media (prefers-reduced-motion: reduce)`에서 transition·animation 끔(스피너는 유지).
- **인쇄**: 그림자·그라데이션·backdrop-blur·배경 빛은 `@media print`에서 모두 끈다. 인쇄 규칙(A4 가로 월 보기)은 그대로.

## 4. 컴포넌트 규칙

| 컴포넌트 | 규칙 |
|---|---|
| 버튼 | `.btn-primary`는 화면당 하나("근무표 만들기"). 예외: 로그인 화면의 [카카오로 시작하기]는 카카오 가이드(배경 #FEE500, 검정 심볼, 글자 검정 85%, radius 12, 높이 40)를 따르고 다크 모드에서도 같은 색. 나머지 행동은 `.btn-secondary`. 행 삭제는 `.btn-danger-ghost` + aria-label에 대상 이름. 높이 40px(작은 버튼 32px), radius 10px. **v2**: primary = accent 바탕 + `shadow 0 1px 2px rgb(79 70 229/.3), inset 0 1px 0 rgb(255 255 255/.16)`(살짝 돋은 면), hover accent-hover, `:active` `translateY(1px)`. secondary = surface 바탕 + `border-soft` 테두리 + `shadow-xs`, hover surface-2. 비활성 opacity 0.6 |
| 입력 | **v2**: 높이 40px, radius 10px, surface 바탕, `border-strong` 테두리, hover 테두리 text-muted, 포커스 accent 테두리 + 3px 링. 단위는 라벨 괄호 `주당 최대 근로시간(시간)`. 오류 필드는 `aria-invalid` + danger 테두리 + danger 3px 링(25%) |
| 카드 | 섹션 = `.card`(**radius 16px**, `border` 테두리, `--shadow`). 카드 머리(제목 + 우측 보조 행동)와 본문은 `border` 한 줄로 나눈다. 카드 안 하위 묶음(근무 규칙, 근무조 등)은 테두리 없이 제목 13px/600 muted + 12px 간격으로만 나눈다 |
| 탭 | 폼/JSON 전환은 카드 머리 우측 보조 버튼 "고급: JSON 직접 편집" ↔ "입력 폼으로 돌아가기"(`aria-pressed`) |
| 배지 | pill + **앞에 6px 점(currentColor)**. 성공 success, 조건 불충족 warning, 입력 오류·요청 오류 danger, 중립(임시 저장 등) neutral. 글자 필수 |
| 표 | 머리글 `surface-2` + muted 12px/600. 행 구분선만, 세로선은 첫 열 뒤 한 줄. 바깥 테두리 radius 10px. **v2**: 화면에서 행 hover 시 `surface-2` 50%. 직원·근무조 표는 가로 스크롤 시 첫 열 sticky |
| 시프트 칸 | radius 6px, 글자 500. 색은 지금 팔레트 그대로 |
| 경고 상자 | `.alert-info / -warning / -danger`. **v2**: radius 12px, 테두리를 `color-mix(상태색 25%, transparent)`로 더 연하게. 제목 한 줄(굵게) + 목록. 오류는 `role="alert"` |
| 지표 카드 | **v2**: surface 바탕 + `border` + `shadow-xs`(지금은 surface-2 바탕). 라벨 12px/500 muted, 값 24px/700 tabular |
| 대화상자 | **v2**: radius 20px, `shadow-lg`, `::backdrop`은 `rgb(10 12 16/.45)` + `backdrop-filter: blur(4px)` |
| 빈 상태 | 점선 카드 + 다음 행동 한 문장 |
| 로딩 | 주 버튼 안 스피너 + "근무표 만드는 중…", 결과 영역에 예상 시간 문구, `aria-busy` |

## 4-1. 화면별 적용 포인트 (v2)

| 화면 | 바꿀 것 |
|---|---|
| 헤더(ScheduleRunner) | 높이 56px. 왼쪽에 **브랜드 표시 28px**(앱 아이콘 `docs/design/app-icon/app-icon.svg`를 `web-client/public/app-icon.svg`로 복사해 `<img alt="">`) + 앱 이름 15px/700. 설명 한 줄은 데스크톱에서만. 오른쪽 근무 기간은 **pill 칩**(surface-2 바탕, border, 13px). 배경 `surface` 72% + `backdrop-blur(12px)` + 아래 `border` 한 줄. favicon도 같은 아이콘으로 |
| 본문 | 배경 `bg` 그대로(그라데이션 없음). 섹션 간격 24px |
| ① 입력 카드(InputForm) | 카드 v2. 하위 묶음 제목을 13px/600 muted 대문자 느낌의 작은 머리말로. 입력 높이 40px. 표 v2 |
| ② 생성 바 | 떠 있는 바: radius 16px, `surface` 80% + `backdrop-blur(12px)` + `shadow-lg`. 640px 이상 sticky 규칙은 그대로 |
| ③ 결과 | 지표 카드 v2. 상태 배지 점 표시. 그리드 바깥 radius 10px, 시프트 칸 radius 6px. 그리드 폭 규칙(직원 128px + 날짜 40px)은 **바꾸지 않는다** |
| 달력(ScheduleCalendar) | 날짜 칸 radius 10px, 테두리 `border`, hover `surface-2`. 오늘은 지금처럼 accent 2px 테두리 + "오늘" 글자. 보기 전환 버튼(지금 primary/secondary 버튼 쌍)은 **세그먼트 컨트롤**로: 바깥 surface-2 바탕 radius 10px 안쪽 여백 4px, 선택된 항목은 surface 바탕 + `shadow-xs` + 글자 600, 나머지는 muted 글자. `aria-pressed`는 그대로(주 버튼은 화면당 하나 규칙). 일요일 danger·토요일 accent 글자 유지. 인쇄 규칙 유지 |
| 저장된 근무표(SavedSchedules) | 목록 한 줄 = 카드형 행(radius 10px, `border`, hover `surface-2` + `shadow-xs`). 게시 상태는 배지(점 + 글자) |
| 로그인(LoginView) | 배경에 **브랜드 빛**: `radial-gradient(640px circle at 50% -8%, rgb(79 70 229/.14), transparent 60%), radial-gradient(420px circle at 85% 6%, rgb(162 28 175/.10), transparent 60%)`(다크는 .24 / .16). 제목 위 앱 아이콘 56px. 제목 24px/700. 카드 radius 20px, `shadow-lg`, 여백 28px(모바일 20px). 카카오 버튼은 그대로 |

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-10-15 | 단계형 배치, 토큰·대비 확정, 용어표 |
| v2 | 2026-10-16 | 비주얼 리프레시(사용자 요청 "트렌디하게"). 원칙 5를 "조용한 화면, 장식 그림자·그라데이션 없음" → "깊이는 은은하게, 강조는 하나만"으로 바꿈: 겹친 그림자·브랜드 그라데이션(로고·로그인 배경에만)을 허용. 강조색 파랑 #2456cc → 인디고 #4f46e5(앱 아이콘과 맞춤). 배경·글자·테두리를 더 차가운 중립색으로. 둥글기 6/10/14 → 8/10/16/20. 입력 36 → 40px. 새 토큰 border-soft, radius-xl, shadow-xs, shadow-lg, brand-gradient. 대비 기준(AA)·그리드 폭·시프트 팔레트·인쇄·용어는 그대로 |

## 5. 용어표

| 개념 | 화면 표기 | 쓰지 않음 |
|---|---|---|
| 앱 이름 | 교대근무 스케줄러 | Shift Scheduler |
| schedule_period | 근무 기간 | 기간, 스케줄 기간 |
| rules | 근무 규칙 | 규칙(엔진 기본값…) |
| shift | 근무조 | 시프트, 교대 |
| shift_requirements | 필요 인원 / 최소 숙련 인원 | min_count, min_senior |
| Off | 쉬는 날 | 휴무(순환 근무 "휴무 M일"만 예외), Off |
| approved_leaves | 휴가 | 승인 휴가 |
| Full_Time / Part_Time | 정규직 / 파트타임 | 풀타임 |
| Senior / Junior | 숙련 / 일반 | 시니어, 주니어 |
| preferred shift | 선호 근무조 | |
| available_time_slots | 근무 가능 시간 | |
| undesirable_shifts | 기피 근무조 | |
| rotation_pattern | 순환 근무(근무 N일·쉬는 날 M일) | |
| 생성 버튼 | 근무표 만들기 / 근무표 만드는 중… | 생성, 실행 |
| 다음 기간 | 다음 기간 준비하기 | 다음 기간 입력 만들기 |
| SUCCESS | 근무표 생성 완료 | |
| INFEASIBLE | 조건을 모두 만족하는 근무표가 없음 + 확인할 항목 안내 | 실행 불가 |
| INVALID_INPUT | 입력값 확인 필요 | |
| legal_violations | 근로 규칙 위반 N건 | 법 위반 |
| fairness_score | 근무 공평성 N점(100점 만점) | |
| warnings | 알림 | 경고/예외 |
| 검증 오류 | 확인이 필요한 항목 N건 | 오류 |
| login | 로그인 | 로그온, 사인인 |
| Kakao login button | 카카오로 시작하기 / 카카오로 이동하는 중… | 카카오 SSO, 소셜 로그인 |
| logout | 로그아웃 | 사인아웃 |
| remember me | 로그인 상태 유지 | 자동 로그인 |
| invite | 초대 링크 | 초대 코드, 토큰 |
| session expired | 로그인 시간이 지남 | 세션 만료 |
| operator | 운영 담당자 | 관리자(매장 관리자와 혼동) |

**지난 기간에서 이어지는 정보**(접힘 영역) 설명 문구:
> 지난달 근무가 이번 달 규칙 계산에 이어집니다. [다음 기간 준비하기]를 쓰면 자동으로 채워지니, 처음 쓰실 때만 직접 입력하세요.

| 필드 | 라벨 | 도움말 |
|---|---|---|
| prior_consecutive_work_days | 직전까지 연속 근무일(일) | 지난 기간 마지막 날까지 쉬지 않고 일한 날 수 |
| prior_last_shift_end | 마지막 근무 종료 시각 | 지난 기간 마지막 근무가 끝난 날짜와 시각 |
| prior_week_hours | 이번 주 이미 근무한 시간(시간) | 근무 기간 첫 주에 지난 기간 쪽에서 이미 일한 시간 |
| rotation_offset | 순환 근무 시작 위치(번째 날) | 비워 두면 자동으로 정합니다 |

**오류 문구**: 지금 `requestErrorMessage`(429/504/413/400/500/연결 실패) 문장을 그대로 확정한다. 형식은 "상황. 할 일." 두 문장 이하.

**숫자·날짜**: 천 단위 쉼표, 단위는 붙여 씀(`16,099,200원`, `52시간`, `5일`). 날짜는 `11월 1일 (일)`.

## 6. 시프트 이름 한글화 의견

시프트 이름은 사용자 데이터라 화면에서 번역하지 않는다. 대신 **`sample_input.json`의 근무조 이름을 한글(오픈·미들·마감·피크)로 바꾸는 것을 권장**한다. 첫 화면이 곧 관리자가 따라 만들 예시이고, 그리드 40px 칸에 한글 2자는 잘리지 않지만 `Peak_PartTime`은 잘린다. 엔진 테스트 영향 때문에 결정은 lead에게 맡긴다.
