import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { staffShareBeta } from "@/lib/auth";
import { storeIdByCode } from "@/lib/schedules";
import StaffView from "./StaffView";

// STAFF_SHARE_BETA를 요청 때 읽는다. 헤더(no-store·X-Robots-Tag·Referrer-Policy)는 middleware가 준다
export const dynamic = "force-dynamic";

// manifest·apple-touch-icon·theme-color는 직원 화면에서만(관리자 화면은 설치 대상이 아님)
export const metadata: Metadata = {
  title: "근무표 (베타)",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/app-icon.svg", apple: "/app-icon-512.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
};

export default async function StaffPage({ params }: { params: Promise<{ code: string }> }) {
  if (!staffShareBeta()) notFound();
  const { code } = await params;
  // 없는·바뀐·형식이 틀린 코드는 화면도 404(계약 7-3 확인 항목 3). 문구는 not-found.tsx
  if (!(await storeIdByCode(code))) notFound();
  return <StaffView code={code} />;
}
