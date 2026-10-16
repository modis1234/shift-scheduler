import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 한글 글리프는 unicode-range로 나뉜 파일을 필요할 때 받으므로 latin 서브셋만 preload한다
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "교대근무 스케줄러",
  description: "근무 조건을 입력하면 근무표를 자동으로 만들어 주는 매장 관리 도구입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${notoSansKr.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
