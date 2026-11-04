// 공연장·역 근처 가볼 만한 곳(1박 둘째 날). 부모님 취향(전시·산책·시장·역사·바다·카페·실내)으로 고른다
import data from "../data/sights.json" with { type: "json" };
import type { Place } from "./types.ts";
import { kmBetween } from "./legs.ts";

type Raw = { id: string; name: string; region: string; lat: number; lng: number; likes: string[]; description_ko: string };
const SIGHTS = (data as { sights: Raw[] }).sights;

export const LIKES = ["전시", "산책", "시장", "역사", "바다", "카페", "실내"] as const;

/** 기준점에서 km 안의 관광지 (Place 형식, origin research) */
export function sightsNear(ll: { lat: number | null; lng: number | null } | null | undefined, km = 30): Place[] {
  if (!ll || ll.lat == null || ll.lng == null) return [];
  return SIGHTS.filter((s) => kmBetween({ lat: ll.lat!, lng: ll.lng! }, s) <= km).map((s) => ({
    id: s.id, concert_ids: [], name: s.name, category: "sight" as const, lat: s.lat, lng: s.lng, address: s.region, walk_min_from_venue: null,
    tags: s.likes.includes("실내") ? ["indoor" as const] : [], fan_type: "none" as const, description_ko: s.description_ko, evidence_urls: [],
    source: "needs_check" as const, updated_at: "2026-11-05T00:00:00+09:00", concertrip_url: "", origin: "research" as const, likes: s.likes,
  }));
}
