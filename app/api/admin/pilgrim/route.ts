// POST /api/admin/pilgrim — 성지 좌표·카카오맵 링크·평점 관리
// action: status | geocode(카카오 주소 검색으로 좌표 없는 성지 채우기) | import(브라우저로 확인한 값 붙여넣기)
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { listAllTtPlaces, listTtPlaces, upsertTtPlaces } from "@/lib/db";
import { geocode, kakaoConfigured } from "@/lib/kakao-local";
import { allSpots, pilgrimCourses } from "@/lib/pilgrim";
import { bad, body, ok } from "@/lib/http";
import type { Place, TtPlaceRow } from "@/lib/types";

export const maxDuration = 60;
const GEO = "pil-geo";

const Item = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  lat: z.coerce.number().min(33).max(39).optional().nullable(),
  lng: z.coerce.number().min(124).max(132).optional().nullable(),
  url: z.string().url().optional().nullable(),
  address: z.string().optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional().nullable(),
  review_count: z.coerce.number().int().min(0).optional().nullable(),
  open: z.union([z.boolean(), z.string()]).optional().nullable(),
});

const norm = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").replace(/[\s·\-_.,'"]/g, "").toLowerCase();

async function status() {
  const geo = new Map((await listTtPlaces({ venue_key: GEO })).map((r) => [r.id, r.data]));
  const inCourse = new Map<string, string[]>();
  for (const c of pilgrimCourses()) for (const id of c.place_ids) inCourse.set(id, [...(inCourse.get(id) ?? []), c.title]);
  return allSpots().map((p) => {
    const g = geo.get(`geo__${p.id}`);
    return {
      id: p.id, name: p.name, address: g?.address || p.address, courses: inCourse.get(p.id) ?? [],
      lat: g?.lat ?? p.lat, lng: g?.lng ?? p.lng, url: g?.link_url ?? "", rating: g?.rating ?? null, rating_count: g?.rating_count ?? null,
      evidence: p.evidence_urls.length,
    };
  });
}

function geoRow(p: Place, patch: Partial<Place>, prev?: Place): TtPlaceRow {
  const now = new Date().toISOString();
  return { id: `geo__${p.id}`, venue_key: GEO, concert_id: null, origin: "research", data: { ...p, ...(prev ?? {}), ...patch, id: `geo__${p.id}` }, updated_at: now };
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("운영자 로그인이 필요해요", 401);
  const b = await body<{ action?: string; items?: unknown; text?: string }>(req);
  try {
    if (b.action === "status") return ok({ spots: await status(), kakao: kakaoConfigured() });

    if (b.action === "geocode") {
      if (!kakaoConfigured()) return bad("KAKAO_REST_API_KEY가 없어 좌표를 찾을 수 없어요. 브라우저로 확인해 붙여넣기를 써 주세요");
      const geo = new Map((await listTtPlaces({ venue_key: GEO })).map((r) => [r.id, r.data]));
      const rows: TtPlaceRow[] = [];
      const miss: string[] = [];
      for (const p of allSpots()) {
        const prev = geo.get(`geo__${p.id}`);
        if ((prev?.lat ?? p.lat) != null) continue;
        const addr = p.address && !/미확인|일대|단일 주소/.test(p.address) ? p.address.replace(/\s*\(.*\)$/, "") : "";
        const hit = (addr ? await geocode(addr).catch(() => null) : null) ?? await geocode(p.name.replace(/\s*\(([^)]*)\)$/, " $1")).catch(() => null);
        if (hit) rows.push(geoRow(p, { lat: hit.lat, lng: hit.lng, link_url: hit.url, address: hit.address || p.address }, prev));
        else miss.push(p.name);
      }
      await upsertTtPlaces(rows);
      return ok({ found: rows.length, miss, spots: await status() });
    }

    if (b.action === "import") {
      // JSON 배열 또는 { items: [...] }. 성지는 id나 이름으로, 그 밖의 식당·카페는 이름으로 찾는다
      let raw: unknown = b.items;
      if (!raw && b.text) {
        const t = b.text.trim().replace(/^```(json)?|```$/g, "");
        raw = JSON.parse(t);
      }
      const arr = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items;
      if (!Array.isArray(arr) || !arr.length) return bad("JSON 배열을 붙여 넣어 주세요");
      const items = arr.map((x) => Item.safeParse(x)).filter((r) => r.success).map((r) => r.data!);
      const spots = allSpots();
      const geo = new Map((await listTtPlaces({ venue_key: GEO })).map((r) => [r.id, r.data]));
      const others = (await listAllTtPlaces()).filter((r) => r.venue_key !== GEO);
      const rows: TtPlaceRow[] = [];
      const matched: string[] = [];
      const unmatched: string[] = [];
      for (const it of items) {
        const patch: Partial<Place> = {};
        if (it.lat != null && it.lng != null) { patch.lat = it.lat; patch.lng = it.lng; }
        if (it.url) patch.link_url = it.url;
        if (it.address) patch.address = it.address;
        if (it.rating != null) { patch.rating = it.rating; patch.rating_count = it.review_count ?? null; patch.rating_src = "카카오맵"; }
        const n = norm(it.name);
        const spot = spots.find((p) => p.id === it.id) ?? spots.find((p) => norm(p.name) === n) ?? spots.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
        if (spot) { rows.push(geoRow(spot, patch, geo.get(`geo__${spot.id}`))); matched.push(`성지 · ${spot.name}`); continue; }
        const hits = others.filter((r) => norm(r.data.name) === n);
        if (hits.length) {
          for (const r of hits) rows.push({ ...r, data: { ...r.data, ...patch }, updated_at: new Date().toISOString() });
          matched.push(`${hits[0].data.name} (${hits.length}곳)`);
        } else unmatched.push(it.name);
      }
      await upsertTtPlaces(rows);
      return ok({ matched, unmatched, skipped: arr.length - items.length, spots: await status() });
    }
    return bad("알 수 없는 요청이에요");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "처리하지 못했어요", 500);
  }
}
