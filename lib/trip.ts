// 트립 관련 서버 헬퍼
import "server-only";
import { randomBytes } from "crypto";
import { getConcert, getPlaces, getTripBy, listTtPlaces, mockVenue, upsertTtPlaces } from "./db.ts";
import { courseSpots, getCourse, pilgrimView, km, type PilgrimCourse } from "./pilgrim.ts";
import { geocode, importNearby, kakaoConfigured } from "./kakao-local.ts";
import type { Concert, ConcertView, Place, Trip } from "./types.ts";
import type { PlanInput } from "./planner.ts";

/** 추측 불가 토큰 (128비트) */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export function concertView(trip: Trip, concert: Concert | null): ConcertView {
  if (concert) return { ...concert, custom: false, tips: mockVenue(concert.venue_key).tips };
  const c = trip.custom_concert!;
  const course = c.course_id ? getCourse(c.course_id) : null;
  if (course) return pilgrimView(course, c.date, c.start_time);
  return {
    id: null, title: c.title, artist_display: "", color: "#087E72", city: "", venue_name: c.venue_name,
    venue_lat: null, venue_lng: null, date: c.date, start_time: c.start_time, est_end_time: null,
    notice_text: "", gate_map: {}, zone_image_url: null, official_map_url: null, info_desk_place_id: null, custom: true,
  };
}

export interface LoadedTrip {
  trip: Trip;
  concert: ConcertView;
  places: Place[];
  input: PlanInput;
}

export async function loadTrip(by: "parent_token" | "kid_token", token: string): Promise<LoadedTrip | null> {
  const trip = await getTripBy(by, token);
  if (!trip) return null;
  const c = trip.concert_id ? await getConcert(trip.concert_id) : null;
  const concert = concertView(trip, c);
  const course = trip.custom_concert?.course_id ? getCourse(trip.custom_concert.course_id) : null;
  const places = trip.concert_id ? await getPlaces(trip.concert_id) : course ? await pilgrimPlaces(course) : [];
  return {
    trip, concert, places,
    input: { concert, parent: trip.parent_profile, prefs: trip.prefs, transport: trip.transport, seat: trip.seat, places },
  };
}

export function isExpired(trip: Trip): boolean {
  return new Date(trip.expires_at).getTime() < Date.now();
}

/** 성지순례 코스 장소 = 콘서트립 팬덤 장소 + 근처 식당·카페(카카오, 코스별로 한 번 불러와 저장) */
export async function pilgrimPlaces(course: PilgrimCourse): Promise<Place[]> {
  const key = `pil-${course.id}`;
  let spots = courseSpots(course);
  // 좌표가 없는 성지는 주소(없으면 이름)로 카카오에서 한 번 찾아 저장해 둔다
  const geoKey = `pil-geo`;
  const geo = new Map((await listTtPlaces({ venue_key: geoKey }).catch(() => [])).map((r) => [r.id, r.data]));
  const missing = spots.filter((p) => (p.lat == null || p.lng == null) && !geo.has(`geo__${p.id}`));
  if (missing.length && kakaoConfigured()) {
    const now = new Date().toISOString();
    const rows = [];
    for (const p of missing) {
      const addr = p.address && !/미확인|일대|단일 주소/.test(p.address) ? p.address.replace(/\s*\(.*\)$/, "") : "";
      const hit = (addr ? await geocode(addr).catch(() => null) : null) ?? await geocode(p.name.replace(/\s*\(([^)]*)\)$/, " $1")).catch(() => null);
      if (hit) rows.push({ id: `geo__${p.id}`, venue_key: geoKey, concert_id: null, origin: "research" as const, data: { ...p, id: `geo__${p.id}`, lat: hit.lat, lng: hit.lng, link_url: hit.url }, updated_at: now });
    }
    if (rows.length) { await upsertTtPlaces(rows).catch(() => undefined); for (const r of rows) geo.set(r.id, r.data); }
  }
  spots = spots.map((p) => {
    const g = geo.get(`geo__${p.id}`);
    if (!g) return p;
    // 운영자 붙여넣기(브라우저로 확인한 카카오맵 좌표·링크·평점)가 있으면 그 값이 우선
    return {
      ...p,
      lat: g.lat ?? p.lat, lng: g.lng ?? p.lng, link_url: g.link_url ?? p.link_url,
      address: g.address || p.address, rating: g.rating ?? p.rating, rating_count: g.rating_count ?? p.rating_count, rating_src: g.rating_src ?? p.rating_src,
    };
  });
  let near = await listTtPlaces({ venue_key: key }).catch(() => []);
  if (!near.length && kakaoConfigured()) {
    try {
      const ll = spots.filter((p) => p.lat != null && p.lng != null) as (Place & { lat: number; lng: number })[];
      const center = ll.length ? { lat: ll.reduce((a, p) => a + p.lat, 0) / ll.length, lng: ll.reduce((a, p) => a + p.lng, 0) / ll.length } : course.start;
      const radius = Math.min(5000, Math.max(1000, Math.round(Math.max(0, ...ll.map((p) => km(center, p))) * 1000)));
      const found = await importNearby(center.lat, center.lng, radius);
      const now = new Date().toISOString();
      near = found.map((p) => ({ id: `${key}__${p.id}`, venue_key: key, concert_id: null, origin: "kakao" as const, data: { ...p, id: `${key}__${p.id}`, walk_min_from_venue: null }, updated_at: now }));
      await upsertTtPlaces(near).catch(() => undefined);
    } catch (e) {
      console.warn("[pilgrim] 근처 식당 불러오기 실패:", e instanceof Error ? e.message : e);
    }
  }
  return [...spots, ...near.map((r) => ({ ...r.data, origin: r.origin }))];
}

/** 공연장 근처 식당·카페가 하나도 없으면 카카오에서 한 번 불러와 저장한다(시연·신규 공연장용) */
export async function ensureVenueFood(concert: Concert | null): Promise<void> {
  if (!concert?.venue_key || concert.venue_lat == null || concert.venue_lng == null || !kakaoConfigured()) return;
  const rows = await listTtPlaces({ venue_key: concert.venue_key }).catch(() => []);
  if (rows.some((r) => r.data.category === "restaurant")) return;
  try {
    const found = await importNearby(concert.venue_lat, concert.venue_lng, 800);
    const now = new Date().toISOString();
    await upsertTtPlaces(found.map((p) => ({ id: `${concert.venue_key}__${p.id}`, venue_key: concert.venue_key, concert_id: null, origin: "kakao" as const, data: { ...p, id: `${concert.venue_key}__${p.id}` }, updated_at: now })));
  } catch (e) {
    console.warn("[venue] 근처 식당 불러오기 실패:", e instanceof Error ? e.message : e);
  }
}
