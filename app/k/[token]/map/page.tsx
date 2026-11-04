import { notFound } from "next/navigation";
import RouteMap, { type Stop } from "@/components/RouteMap";
import { loadTrip } from "@/lib/trip";
import { absMin, toMin } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "동선 지도 · 트롯트립" };

// 자녀: 일정 순서대로 이은 동선 지도
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) notFound();
  const { trip, concert, places } = loaded;
  const byId = new Map(places.map((p) => [p.id, p]));
  // 모든 정류장을 (며칠째, 시각) 순서로: 일정 속 장소 + 출발역·도착역·숙소 + 공연장(입장 시각) / 팬덤 여행 시작점
  const all: (Stop & { abs: number })[] = [];
  const push = (abs: number, time: string, label: string, name: string, lat: number, lng: number) => all.push({ n: 0, time, label, name, lat, lng, abs });
  if (concert.venue_lat != null && concert.venue_lng != null) {
    const enter = trip.plan!.items.find((i) => i.type === "enter");
    const arrive = trip.plan!.items.find((i) => i.type === "arrive" && !i.title.startsWith("🚄") && !i.title.startsWith("🚌") && !i.title.startsWith("출발"));
    const ref = concert.pilgrim ? arrive : enter;
    if (ref) push(absMin(ref), ref.start, concert.pilgrim ? "시작" : "입장", concert.venue_name, concert.venue_lat, concert.venue_lng);
  }
  for (const it of trip.plan!.items) {
    const p = it.place_id ? byId.get(it.place_id) : undefined;
    if (!p || p.lat == null || p.lng == null) continue;
    const label = / 스팟 · /.test(it.title) ? "팬덤 스팟" : it.title.split(" · ")[0];
    push(absMin(it), it.start, label, p.name.replace(/\s*\(.*\)$/, ""), p.lat, p.lng);
  }
  for (const pin of trip.plan!.pins ?? []) {
    if (pin.time) push(toMin(pin.time) + ((pin.day ?? 1) - 1) * 1440, pin.time, pin.label, pin.name, pin.lat, pin.lng);
  }
  const stops: Stop[] = all.sort((x, y) => x.abs - y.abs).map(({ abs: _abs, ...s }) => s);
  stops.forEach((s, i) => { s.n = i + 1; });
  const title = concert.pilgrim ? `${concert.artist_display} 팬덤 스팟 여행` : concert.title;
  return <RouteMap kidToken={token} title={title} stops={stops} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""} />;
}
