-- 근무표·계정·직원 공유 링크 저장소(Postgres, Supabase). 앱이 자동으로 실행하지 않는다: Supabase SQL Editor에 붙여 넣거나 psql "$DATABASE_URL" -f로 한 번 적용한다
-- 서버만 DATABASE_URL로 직접 접속한다. Supabase Data API(anon·authenticated 역할)로는 아무것도 읽히지 않게 모든 표에 RLS를 켜고 정책은 두지 않는다(표 소유자인 접속 계정은 RLS를 받지 않음)

-- 매장 = 관리자 계정. 초대 코드는 sha256 해시만 저장
CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY,
  name text NOT NULL,
  kakao_id text UNIQUE,                 -- 카카오 회원번호. 한 계정은 한 매장에만 연결
  linked_at timestamptz,
  invite_hash text UNIQUE,
  invite_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((invite_hash IS NULL) = (invite_expires_at IS NULL))
);

-- 근무표. 생성 입력·결과를 그대로 저장(직원 이름·시급 등 개인정보 포함)
-- jsonb가 아니라 json: jsonb는 객체 키 순서를 바꾸는데, shift_definitions의 키 순서가 화면의 근무조 순서다
CREATE TABLE IF NOT EXISTS schedules (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'unpublished')),
  input json NOT NULL,
  result json NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedules_store ON schedules (store_id, start_date);
-- 같은 매장·같은 기간에 게시된 근무표는 하나
CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_published ON schedules (store_id, start_date, end_date) WHERE status = 'published';

-- 직원 공유 링크: 매장당 1개. 관리자가 다시 복사해야 하므로 코드는 평문
CREATE TABLE IF NOT EXISTS share_links (
  store_id text PRIMARY KEY REFERENCES stores (id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
