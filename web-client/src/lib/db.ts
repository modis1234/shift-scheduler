import postgres from "postgres";

// Postgres(Supabase) 연결. 서버에서만 쓴다. 접속 문자열에 비밀번호가 있으므로 로그에 남기지 않는다
// 개발 서버가 파일을 다시 읽을 때마다 연결 풀이 새로 생기지 않게 globalThis에 둔다
const g = globalThis as { pg?: postgres.Sql };

export function db(): postgres.Sql {
  if (g.pg) return g.pg;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 없습니다.");
  return (g.pg = postgres(url, {
    // 접속 문자열에 sslmode가 없으면 SSL 필수. 로컬 Postgres는 ?sslmode=disable
    ...(/[?&]sslmode=/.test(url) ? {} : { ssl: "require" as const }),
    // Supabase transaction pooler(6543)는 prepared statement를 못 쓴다. session pooler·직접 연결에서도 동작한다
    prepare: false,
  }));
}
