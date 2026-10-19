-- 매장 관리자 개인 일정. 직원 근무표·공유 화면과 분리하며 서버 DB 연결로만 접근한다.
CREATE TABLE IF NOT EXISTS manager_events (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  title varchar(50) NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  start_time time NULL,
  end_time time NULL,
  note varchar(200) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (all_day AND start_time IS NULL AND end_time IS NULL)
    OR
    (NOT all_day AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS manager_events_store_date_idx
  ON manager_events(store_id, event_date, start_time);

-- Supabase Data API에서는 보이지 않게 하고, 표 소유자인 서버 연결만 사용한다.
ALTER TABLE manager_events ENABLE ROW LEVEL SECURITY;
