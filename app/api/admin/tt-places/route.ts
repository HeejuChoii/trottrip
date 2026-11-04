// POST /api/admin/tt-places — 트롯트립이 직접 관리하는 장소(식당·카페·시설·버스·공지)
// action: kakao_import | upsert | delete | geocode | notice_extract | notice_apply
import { randomUUID } from "crypto";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { deleteTtPlace, getConcert, listTtPlaces, replaceTtPlacesByOrigin, upsertConcert, upsertTtPlaces } from "@/lib/db";
import { geocode, importNearby, kakaoConfigured, walkMinFromDistance } from "@/lib/kakao-local";
import { extractNotice, NoticeSchema } from "@/lib/notice-extract";
import { labelSpice } from "@/lib/label-ai";
import { bad, body, ok } from "@/lib/http";
import research from "@/data/venue-research.json";
import { PLACE_CATEGORIES, PLACE_TAGS, FAN_TYPES, type Concert, type Place, type TtPlaceRow } from "@/lib/types";

export const maxDuration = 60;

const PlaceInput = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1).max(80),
  category: z.enum(PLACE_CATEGORIES),
  description_ko: z.string().trim().max(200).default(""),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  address: z.string().max(200).default(""),
  walk_min_from_venue: z.number().int().min(0).max(600).nullable().default(null),
  tags: z.array(z.enum(PLACE_TAGS)).default([]),
  fan_type: z.enum(FAN_TYPES).default("none"),
  evidence_urls: z.array(z.string().url()).max(5).default([]),
  source: z.enum(["verified", "needs_check", "user_input"]).default("needs_check"),
});

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRow(c: Concert, scope: "venue" | "concert", origin: TtPlaceRow["origin"], p: z.infer<typeof PlaceInput>, extra: Partial<Place> = {}): TtPlaceRow {
  const now = new Date().toISOString();
  const id = p.id || `tt_${randomUUID().slice(0, 8)}`;
  let walk = p.walk_min_from_venue;
  if (walk == null && p.lat != null && p.lng != null && c.venue_lat != null && c.venue_lng != null) {
    walk = walkMinFromDistance(haversineM({ lat: p.lat, lng: p.lng }, { lat: c.venue_lat, lng: c.venue_lng }) * 1.3); // 직선거리 → 길 보정
  }
  const data: Place = {
    id, concert_ids: scope === "concert" ? [c.id] : [], name: p.name, category: p.category, lat: p.lat, lng: p.lng,
    address: p.address, walk_min_from_venue: walk, tags: p.tags, fan_type: p.fan_type, description_ko: p.description_ko,
    evidence_urls: p.evidence_urls, source: p.source, updated_at: now, concertrip_url: "", origin, ...extra,
  };
  return { id, venue_key: scope === "venue" ? c.venue_key : null, concert_id: scope === "concert" ? c.id : null, origin, data, updated_at: now };
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("로그인이 필요해요", 401);
  const b = await body<Record<string, unknown>>(req);
  const concert = typeof b.concert_id === "string" ? await getConcert(b.concert_id) : null;
  try {
    switch (b.action) {
      case "kakao_import": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        if (!kakaoConfigured()) return bad("KAKAO_REST_API_KEY를 먼저 설정해 주세요");
        if (!concert.venue_key) return bad("공연장 키(venue_key)를 먼저 넣어 주세요");
        if (concert.venue_lat == null || concert.venue_lng == null) return bad("공연장 위도·경도를 먼저 넣어 주세요");
        const radius = Math.min(Math.max(Number(b.radius) || 800, 200), 2000);
        const places = await importNearby(concert.venue_lat, concert.venue_lng, radius);
        const labels = await labelSpice(places);
        for (const p of places) { const l = labels.get(p.id); if (l) { p.ai_spice = l.spice; p.ai_note = l.note; } }
        const now = new Date().toISOString();
        await replaceTtPlacesByOrigin(concert.venue_key, "kakao", places.map((p) => ({ id: p.id, venue_key: concert.venue_key, concert_id: null, origin: "kakao" as const, data: p, updated_at: now })));
        return ok({ count: places.length, restaurants: places.filter((p) => p.category === "restaurant").length, cafes: places.filter((p) => p.category === "cafe").length, labeled: labels.size });
      }
      case "label_spice": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        const rows = (await listTtPlaces({ venue_key: concert.venue_key, concert_id: concert.id })).filter((r) => r.data.category === "restaurant");
        const labels = await labelSpice(rows.map((r) => r.data));
        const changed = rows.filter((r) => labels.has(r.id)).map((r) => ({ ...r, data: { ...r.data, ai_spice: labels.get(r.id)!.spice, ai_note: labels.get(r.id)!.note }, updated_at: new Date().toISOString() }));
        await upsertTtPlaces(changed);
        return ok({ labeled: changed.length });
      }
      case "upsert": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        const scope = b.scope === "venue" ? "venue" : "concert";
        if (scope === "venue" && !concert.venue_key) return bad("공연장 공통 장소는 공연장 키가 필요해요");
        const p = PlaceInput.safeParse(b.place);
        if (!p.success) return bad(`${p.error.issues[0]?.path.join(".")}: ${p.error.issues[0]?.message}`);
        // 기존 행이면 출처 유지(카카오 식당의 태그를 고쳐도 다음 불러오기 때 바뀌지 않게 manual로 바꿈)
        const row = toRow(concert, scope, "manual", p.data);
        await upsertTtPlaces([row]);
        return ok({ place: row });
      }
      case "delete": {
        if (typeof b.id !== "string") return bad("id가 필요해요");
        await deleteTtPlace(b.id);
        return ok({ ok: true });
      }
      case "geocode": {
        if (!kakaoConfigured()) return bad("KAKAO_REST_API_KEY를 먼저 설정해 주세요");
        const near = concert?.venue_lat != null && concert?.venue_lng != null ? { lat: concert.venue_lat, lng: concert.venue_lng } : undefined;
        const r = await geocode(String(b.query ?? "").slice(0, 100), near);
        return r ? ok({ result: r }) : bad("찾지 못했어요. 검색어를 바꿔 보세요", 404);
      }
      case "notice_extract": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        const text = String(b.text ?? "").trim();
        if (text.length < 20) return bad("공지 내용을 붙여 넣어 주세요");
        return ok({ extract: await extractNotice(text, concert.title, concert.venue_name) });
      }
      case "notice_apply": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        const ex = NoticeSchema.safeParse(b.extract);
        if (!ex.success) return bad("정리 결과 형식이 맞지 않아요");
        const e = ex.data;
        const gate_map = { ...concert.gate_map };
        for (const g of e.gate_map) if (g.zone.trim() && g.gate.trim()) gate_map[g.zone.trim()] = g.gate.trim();
        const notice = [e.summary, e.md_hours ? `MD 부스: ${e.md_hours}` : "", e.entry_start ? `입장 시작: ${e.entry_start}` : ""].filter(Boolean).join("\n");
        // 공연장 공통(팬 정리글·시설 정보)으로 저장할 때는 그 공연의 게이트·공지 문구를 건드리지 않는다
        if (b.scope !== "venue") await upsertConcert({ ...concert, gate_map, notice_text: notice || concert.notice_text });
        const near = concert.venue_lat != null && concert.venue_lng != null ? { lat: concert.venue_lat, lng: concert.venue_lng } : undefined;
        const rows: TtPlaceRow[] = [];
        for (const np of e.places) {
          let lat: number | null = null, lng: number | null = null, address = "";
          if (np.location_query && kakaoConfigured()) {
            const g = await geocode(np.location_query, near).catch(() => null);
            if (g && (g.distance_m == null || g.distance_m < 3000)) { lat = g.lat; lng = g.lng; address = g.address; }
          }
          rows.push(toRow(concert, b.scope === "venue" && concert.venue_key ? "venue" : "concert", "notice", PlaceInput.parse({
            name: np.name, category: np.category, description_ko: [np.description_ko, np.hours ? `운영 ${np.hours}` : ""].filter(Boolean).join(" · "),
            lat, lng, address, evidence_urls: typeof b.source_url === "string" && /^https?:\/\//.test(b.source_url) ? [b.source_url] : [],
            // 공식 공지면 확인됨, 팬 정리글(공연장 공통으로 저장)이면 확인 전
            source: b.scope === "venue" ? "needs_check" : "verified",
          })));
        }
        await upsertTtPlaces(rows);
        return ok({ gate_map, places: rows.length });
      }
      case "import_research": {
        if (!concert?.venue_key) return bad("공연장 키(venue_key)가 있는 공연에서 눌러 주세요");
        const list = (research as { venues: Record<string, unknown[]> }).venues[concert.venue_key] ?? [];
        if (!list.length) return bad(`'${concert.venue_key}' 공연장의 조사 자료가 아직 없어요`);
        const rows = list.map((x) => {
          const p = PlaceInput.parse({ ...(x as object), source: "needs_check" });
          return toRow(concert, "venue", "research", { ...p, id: String((x as { id: string }).id) });
        });
        await upsertTtPlaces(rows);
        return ok({ count: rows.length });
      }
      case "list": {
        if (!concert) return bad("공연을 찾을 수 없어요", 404);
        return ok({ rows: await listTtPlaces({ venue_key: concert.venue_key, concert_id: concert.id }) });
      }
      default:
        return bad("알 수 없는 동작");
    }
  } catch (e) {
    return bad(e instanceof Error ? e.message : "실패", 502);
  }
}
