-- 내 일정 뱃지 색. 기존 일정은 gray로 채워진다. 값 목록은 src/lib/manager-event-colors.ts와 같게 유지한다.
ALTER TABLE manager_events
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'gray'
  CHECK (color IN ('gray', 'blue', 'green', 'yellow', 'purple', 'red'));
