import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "트롯트립 — 부모님 공연 날 안내장",
  description: "부모님의 최애를 만나러 가는 길, 여행까지 선물하세요. 공연과 부모님 정보를 넣으면 AI가 콘서트 하루를 짜서 링크 하나로 보내 드려요.",
  openGraph: { title: "트롯트립", description: "부모님의 최애를 만나러 가는 길, 여행까지 선물하세요.", locale: "ko_KR", type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#087E72" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
