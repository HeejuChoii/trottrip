// 동선 지도 정류장: 일정 속 장소 + 출발역·도착역·숙소 + 공연장(입장) / 팬덤 여행 시작점을 (며칠째, 시각) 순서로
import { absMin, toMin } from "./time.ts";
import type { LoadedTrip } from "./trip.ts";

export interface Stop { n: number; time: string; label: string; name: string; lat: number; lng: number; day: number }

export function routeStops({ trip, concert, places }: Pick<LoadedTrip, "trip" | "concert" | "places">): Stop[] {
  const items = trip.plan?.items ?? [];
  const byId = new Map(places.map((p) => [p.id, p]));
  const all: (Stop & { abs: number })[] = [];
  const push = (abs: number, time: string, label: string, name: string, lat: number, lng: number) => all.push({ n: 0, time, label, name, lat, lng, abs, day: Math.floor(abs / 1440) + 1 });
  if (concert.venue_lat != null && concert.venue_lng != null) {
    const enter = items.find((i) => i.type === "enter");
    const arrive = items.find((i) => i.type === "arrive" && !i.title.startsWith("🚄") && !i.title.startsWith("🚌") && !i.title.startsWith("출발"));
    const ref = concert.pilgrim ? arrive : enter;
    if (ref) push(absMin(ref), ref.start, concert.pilgrim ? "시작" : "입장", concert.venue_name, concert.venue_lat, concert.venue_lng);
  }
  for (const it of items) {
    const p = it.place_id ? byId.get(it.place_id) : undefined;
    if (!p || p.lat == null || p.lng == null) continue;
    const label = / 스팟 · /.test(it.title) ? "팬덤 스팟" : it.title.split(" · ")[0];
    push(absMin(it), it.start, label, p.name.replace(/\s*\(.*\)$/, ""), p.lat, p.lng);
  }
  for (const pin of trip.plan?.pins ?? []) {
    if (pin.time) push(toMin(pin.time) + ((pin.day ?? 1) - 1) * 1440, pin.time, pin.label, pin.name, pin.lat, pin.lng);
  }
  const stops: Stop[] = all.sort((x, y) => x.abs - y.abs).map(({ abs: _abs, ...s }) => s);
  stops.forEach((s, i) => { s.n = i + 1; });
  return stops;
}
