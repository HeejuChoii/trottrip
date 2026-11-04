import type { Metadata } from "next";
import Link from "next/link";
import { getParentData } from "./data";
import { shareTitle } from "@/lib/text";
import { fmtDateKo } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d) return { title: "트롯트립", robots: { index: false } };
  const title = shareTitle(d.trip.kid_label, d.trip.kid_name, !!d.concert.pilgrim);
  const description = `${d.concert.pilgrim ? `${d.concert.artist_display} 팬덤 스팟 여행 · ${d.concert.city}` : d.concert.title} · ${fmtDateKo(d.concert.date)} · 앱 설치 없이 바로 보세요`;
  const image = `/api/og?t=${token}`;
  return {
    title, description, robots: { index: false, follow: false },
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "website", locale: "ko_KR" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) {
    return (
      <main className="shell pv">
        <h1 className="h">{d ? "안내장 기간이 끝났어요" : "안내장을 찾을 수 없어요"}</h1>
        <p className="hello">{d ? "공연 다음 날까지만 열 수 있어요. 즐거운 공연 되셨기를 바라요!" : "링크를 다시 한번 확인해 주세요."}</p>
        <Link className="cta" href="/">트롯트립 알아보기</Link>
      </main>
    );
  }
  return <>{children}</>;
}
