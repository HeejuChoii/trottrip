import { notFound } from "next/navigation";
import RouteMap from "@/components/RouteMap";
import { loadTrip } from "@/lib/trip";
import { routeStops } from "@/lib/stops";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "동선 지도 · 트롯트립" };

// 자녀: 일정 순서대로 이은 동선 지도
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) notFound();
  const { concert } = loaded;
  const title = concert.pilgrim ? `${concert.artist_display} 팬덤 스팟 여행` : concert.title;
  return <RouteMap kidToken={token} title={title} stops={routeStops(loaded)} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""} />;
}
