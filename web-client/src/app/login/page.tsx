import type { Metadata } from "next";
import LoginView from "./LoginView";

export const metadata: Metadata = {
  title: "로그인 | 교대근무 스케줄러",
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  return (
    <LoginView
      error={one(q.error)}
      invite={one(q.invite)}
      next={one(q.next)}
      // 카카오 로그아웃은 등록된 주소로만 돌아오므로 쿼리 대신 state로 표시가 온다(be). logged_out=1도 받는다
      loggedOut={one(q.state) === "logged_out" || one(q.logged_out) === "1"}
    />
  );
}
