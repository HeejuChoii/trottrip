import { notFound } from "next/navigation";
import RouteMap, { type Stop } from "@/components/RouteMap";
import { loadTrip } from "@/lib/trip";
import { toMin } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "동선 지도 · 트롯트립" };

// 자녀: 일정 순서대로 이은 동선 지도
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) notFound();
  const { trip, concert, places } = loaded;
  const byId = new Map(places.map((p) => [p.id, p]));
  const stops: Stop[] = [];
  // 성지 여행은 출발점, 공연은 공연장을 기준점으로
  if (concert.venue_lat != null && concert.venue_lng != null) stops.push({ n: 0, time: concert.start_time, label: concert.pilgrim ? "시작" : "공연장", name: concert.venue_name, lat: concert.venue_lat, lng: concert.venue_lng });
  for (const it of [...trip.plan!.items].sort((a, b) => toMin(a.start) - toMin(b.start))) {
    const p = it.place_id ? byId.get(it.place_id) : undefined;
    if (!p || p.lat == null || p.lng == null) continue;
    const label = / 스팟 · /.test(it.title) ? "팬덤 스팟" : it.title.split(" · ")[0];
    stops.push({ n: 0, time: it.start, label, name: p.name.replace(/\s*\(.*\)$/, ""), lat: p.lat, lng: p.lng });
  }
  // 공연 날은 공연장을 입장 순서 자리로 옮긴다
  if (!concert.pilgrim && stops.length > 1) {
    const venue = stops.shift()!;
    const enter = trip.plan!.items.find((i) => i.type === "enter");
    const at = enter ? stops.findIndex((s) => toMin(s.time) >= toMin(enter.start)) : -1;
    stops.splice(at < 0 ? stops.length : at, 0, { ...venue, time: enter?.start ?? venue.time, label: "입장" });
  }
  stops.forEach((s, i) => { s.n = i + 1; });
  const title = concert.pilgrim ? `${concert.artist_display} 팬덤 스팟 여행` : concert.title;
  return <RouteMap kidToken={token} title={title} stops={stops} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""} />;
}
