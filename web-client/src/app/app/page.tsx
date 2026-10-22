import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import AppStartView from "./AppStartView";

// 설치 앱 시작 주소(manifest start_url). 관리자 세션이 있으면 메인, 없으면 화면에서 마지막 직원 링크나 역할 선택으로 보낸다
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "교대근무 스케줄러",
  robots: { index: false, follow: false },
};

export default async function AppStartPage() {
  if (await readSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/");
  return <AppStartView />;
}
