// 저장소 계층. SUPABASE_URL/SUPABASE_SERVICE_KEY가 있으면 Supabase, 없으면 로컬 개발용 JSON 파일(.data/db.json).
// 서버에서만 import 한다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChatRow, Concert, EventType, Place, Plan, Trip, TripEvent, TtPlaceRow } from "./types.ts";
import { SEED_CONCERTS, SEED_TT_PLACES } from "./seed.ts";
import venueMock from "../data/venue-mock.json" with { type: "json" };
import { sightsNear } from "./sights.ts";
import type { FanComment, FanPost } from "./community.ts";

type MockVenue = { name: string; lat: number; lng: number; tips: string[]; places: (Partial<Place> & { id: string; name: string })[] };
const MOCK = (venueMock as unknown as { venues: Record<string, MockVenue> }).venues;

/** 시연용 공연장 시설·꿀팁 (운영자가 넣은 장소가 같은 id면 그쪽이 우선) */
export function mockVenue(venueKey: string | null | undefined): { tips: string[]; places: Place[] } {
  const v = venueKey ? MOCK[venueKey] : undefined;
  if (!v) return { tips: [], places: [] };
  return {
    tips: v.tips,
    places: v.places.map((p) => ({
      concert_ids: [], address: v.name, walk_min_from_venue: null, tags: [], fan_type: "none", description_ko: "", evidence_urls: [],
      source: "needs_check", updated_at: "2026-11-04T00:00:00+09:00", concertrip_url: "", lat: null, lng: null, category: "rest",
      ...p, origin: "research",
    }) as Place),
  };
}

/** 실제 일정으로 바뀌어 더 쓰지 않는 시연용 가상 공연 → 목록에서 숨긴다 */
const RETIRED_SEED_IDS = ["yt-exco-1206", "kgm-goyang-1121", "lyw-gocheok-1227", "sgi-bexco-1213"];
/** 공식 일정으로 시각·예매처가 바뀐 시드 공연 → 시각·예매처·공지만 시드 값으로 맞춘다 */
const REFRESH_SEED_IDS = ["cyp-kspo-1127", "cyp-kspo-1128", "lsc-kspo-1205", "yt-daegu-1128", "yt-daegu-1129", "lsc-daejeon-1122", "lsc-exco-1128", "lsc-bexco-1224"];

/** 시드 공연 중 아직 없는 것만 넣는다(운영자가 고친 공연은 건드리지 않음) */
export async function ensureSeedConcerts(): Promise<void> {
  const all = await listConcerts(false);
  const byId = new Map(all.map((c) => [c.id, c]));
  const warn = (id: string) => (e: unknown) => console.warn("[seed] 공연 반영 실패", id, e instanceof Error ? e.message : e);
  for (const c of SEED_CONCERTS) {
    const cur = byId.get(c.id);
    if (!cur) await upsertConcert({ ...c }).catch(warn(c.id));
    else if (REFRESH_SEED_IDS.includes(c.id) && (cur.start_time !== c.start_time || cur.ticket_url !== c.ticket_url))
      await upsertConcert({ ...cur, start_time: c.start_time, est_end_time: c.est_end_time, ticket_url: c.ticket_url, notice_text: c.notice_text }).catch(warn(c.id));
  }
  for (const id of RETIRED_SEED_IDS) {
    const cur = byId.get(id);
    if (cur?.active) await upsertConcert({ ...cur, active: false }).catch(warn(id));
  }
}

interface LocalDB {
  concerts: Concert[];
  places_cache: { id: string; concert_id: string; data: Place; synced_at: string }[];
  trips: Trip[];
  trip_events: TripEvent[];
  chats: ChatRow[];
  tt_places?: TtPlaceRow[];
  plan_cache?: { hash: string; plan: Plan; created_at: string }[];
  api_usage?: UsageRow[];
  community_posts?: FanPost[];
  community_comments?: FanComment[];
  community_likes?: { post_id: string; author_id: string }[];
}

export interface UsageRow { id: string; kind: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; created_at: string }

let sb: SupabaseClient | null = null;
function supa(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  if (!sb) sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return sb;
}

export function storageMode(): "supabase" | "local" {
  return supa() ? "supabase" : "local";
}

/**
 * SUPABASE_SERVICE_KEY에 어떤 키가 들어 있는지. anon/publishable 키면 RLS 때문에 읽기가 오류 없이 0건으로 나온다.
 * (키 값은 밖으로 내보내지 않고 종류만 본다)
 */
export function supabaseKeyKind(): "service" | "secret" | "anon" | "publishable" | "unknown" | "none" {
  const k = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!k) return "none";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("sb_publishable_")) return "publishable";
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      if (payload.role === "service_role") return "service";
      if (payload.role === "anon") return "anon";
    } catch { /* 형식 오류 */ }
  }
  return "unknown";
}

/** /admin 상태 확인: 공연 수와 쓰기 가능 여부 */
export async function storageHealth(): Promise<{ concerts: number; error: string | null }> {
  try {
    const c = await listConcerts(false);
    return { concerts: c.length, error: null };
  } catch (e) {
    return { concerts: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- 로컬 파일 저장소 (개발·데모용) ----------
const LOCAL_PATH = process.env.LOCAL_DB_PATH || path.join(process.cwd(), ".data", "db.json");
let localCache: LocalDB | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function local(): Promise<LocalDB> {
  if (localCache) return localCache;
  try {
    localCache = JSON.parse(await fs.readFile(LOCAL_PATH, "utf8")) as LocalDB;
  } catch {
    localCache = { concerts: SEED_CONCERTS.map((c) => ({ ...c })), places_cache: [], trips: [], trip_events: [], chats: [], tt_places: SEED_TT_PLACES.map((p) => ({ ...p })) };
    await flush();
  }
  localCache.tt_places ??= SEED_TT_PLACES.map((p) => ({ ...p }));
  for (const c of localCache.concerts) if (c.venue_key === undefined) c.venue_key = SEED_CONCERTS.find((x) => x.id === c.id)?.venue_key ?? null;
  return localCache;
}
async function flush() {
  const data = JSON.stringify(localCache);
  writeChain = writeChain.then(async () => {
    await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
    await fs.writeFile(LOCAL_PATH, data);
  });
  await writeChain;
}

function must<T>(r: { data: T; error: { message: string } | null }, newColumn?: string): T {
  // 새 칸(0009 SQL: 투표·댓글 사진)을 아직 안 만든 DB면 알아볼 수 있게 알려 준다
  if (r.error && newColumn && r.error.message.includes(newColumn)) throw new Error("이 기능은 준비 중이에요(운영자: supabase 0009 SQL을 실행해 주세요)");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

// ---------- concerts ----------
export async function listConcerts(activeOnly = true): Promise<Concert[]> {
  const s = supa();
  let rows: Concert[];
  if (s) {
    let q = s.from("concerts").select("*").order("date").order("start_time");
    if (activeOnly) q = q.eq("active", true);
    rows = must(await q) as Concert[];
  } else {
    rows = (await local()).concerts.filter((c) => !activeOnly || c.active);
    rows.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  }
  return rows;
}

export async function getConcert(id: string): Promise<Concert | null> {
  const s = supa();
  if (s) return (must(await s.from("concerts").select("*").eq("id", id).maybeSingle()) as Concert) ?? null;
  return (await local()).concerts.find((c) => c.id === id) ?? null;
}

export async function upsertConcert(c: Concert): Promise<Concert> {
  const s = supa();
  if (s) return must(await s.from("concerts").upsert(c).select().single()) as Concert;
  const db = await local();
  const i = db.concerts.findIndex((x) => x.id === c.id);
  if (i >= 0) db.concerts[i] = c; else db.concerts.push(c);
  await flush();
  return c;
}

// ---------- places_cache ----------
/** 콘서트립에서 불러온 장소(캐시)만 */
export async function getConcertripPlaces(concertId: string): Promise<Place[]> {
  const s = supa();
  if (s) {
    const rows = must(await s.from("places_cache").select("data").eq("concert_id", concertId)) as { data: Place }[];
    return rows.map((r) => ({ ...r.data, origin: "concertrip" as const }));
  }
  return (await local()).places_cache.filter((p) => p.concert_id === concertId).map((p) => ({ ...p.data, origin: "concertrip" as const }));
}

/** 일정·화면에 쓰는 장소 = 콘서트립(팬덤 등) + 트롯트립 공연장 공통 장소 + 이 공연만의 장소 */
export async function getPlaces(concertId: string): Promise<Place[]> {
  const concert = await getConcert(concertId);
  const [ct, tt] = await Promise.all([getConcertripPlaces(concertId), listTtPlaces({ venue_key: concert?.venue_key ?? null, concert_id: concertId })]);
  const seen = new Set<string>();
  const out: Place[] = [];
  // 트롯트립 장소가 같은 id면 우선(운영자가 고친 값)
  // 같은 시설 종류를 운영자가 이미 넣었으면 시연용 목데이터는 그 종류를 건너뛴다
  const ttCats = new Set(tt.map((r) => r.data.category));
  const mock = mockVenue(concert?.venue_key).places.filter((p) => !ttCats.has(p.category) || ["goods", "photo"].includes(p.category) && !tt.some((r) => r.data.category === p.category));
  // 공연장 30km 안의 가볼 만한 곳(1박 둘째 날 추천용)
  const sights = sightsNear(concert ? { lat: concert.venue_lat, lng: concert.venue_lng } : null, 30);
  for (const p of [...tt.map((r) => ({ ...r.data, origin: r.origin })), ...ct, ...mock, ...sights]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// ---------- tt_places (트롯트립이 직접 관리하는 장소) ----------
export async function listTtPlaces(scope: { venue_key?: string | null; concert_id?: string | null }): Promise<TtPlaceRow[]> {
  const s = supa();
  if (s) {
    const ors: string[] = [];
    if (scope.venue_key) ors.push(`venue_key.eq.${scope.venue_key}`);
    if (scope.concert_id) ors.push(`concert_id.eq.${scope.concert_id}`);
    if (!ors.length) return [];
    return must(await s.from("tt_places").select("*").or(ors.join(","))) as TtPlaceRow[];
  }
  return ((await local()).tt_places ?? []).filter((r) => (!!scope.venue_key && r.venue_key === scope.venue_key) || (!!scope.concert_id && r.concert_id === scope.concert_id));
}

// ---------- 공연 포스터 (tt_places에 venue_key "posters"로 저장: 마이그레이션 없이) ----------
const POSTERS = "posters";
/** 기본 포스터(공식 포스터 이미지를 public/posters에 둠). 운영자가 넣은 값이 있으면 그쪽이 우선 */
const STATIC_POSTERS: Record<string, string> = {
  이승철: "/posters/lee-seungchul.webp", 김건모: "/posters/kim-gunmo.webp", 박서진: "/posters/park-seojin.webp",
  이찬원: "/posters/lee-chanwon.png", 영탁: "/posters/youngtak.png", 조용필: "/posters/cho-yongpil.png",
};
/** 키(공연 id 또는 가수 이름) → 포스터 이미지 주소 */
export async function listPosters(): Promise<Record<string, string>> {
  const rows = await listTtPlaces({ venue_key: POSTERS }).catch(() => []);
  return { ...STATIC_POSTERS, ...Object.fromEntries(rows.filter((r) => r.data.link_url).map((r) => [r.data.name, r.data.link_url!])) };
}
export async function setPosters(items: { key: string; url: string | null }[]): Promise<void> {
  const now = new Date().toISOString();
  for (const it of items.filter((x) => !x.url)) await deleteTtPlace(`poster__${it.key}`);
  await upsertTtPlaces(items.filter((x) => x.url).map((it) => ({
    id: `poster__${it.key}`, venue_key: POSTERS, concert_id: null, origin: "manual" as const, updated_at: now,
    data: {
      id: `poster__${it.key}`, concert_ids: [], name: it.key, category: "photo" as const, lat: null, lng: null, address: "", walk_min_from_venue: null,
      tags: [], fan_type: "none" as const, description_ko: "공연 포스터", evidence_urls: [], source: "user_input" as const, updated_at: now, concertrip_url: "", link_url: it.url!,
    },
  })));
}
/** 공연 포스터: 공연 id로 넣은 게 있으면 그것, 없으면 가수 이름으로 넣은 것 */
export function posterFor(map: Record<string, string>, c: { id?: string | null; artist_display?: string }): string | null {
  return (c.id && map[c.id]) || (c.artist_display && map[c.artist_display]) || null;
}

/** 전체 tt_places (평점 붙여넣기 매칭용, 수백 건 규모) */
export async function listAllTtPlaces(): Promise<TtPlaceRow[]> {
  const s = supa();
  if (s) return must(await s.from("tt_places").select("*").limit(5000)) as TtPlaceRow[];
  return (await local()).tt_places ?? [];
}

export async function upsertTtPlaces(rows: TtPlaceRow[]): Promise<void> {
  if (!rows.length) return;
  const s = supa();
  if (s) { must(await s.from("tt_places").upsert(rows)); return; }
  const db = await local();
  const list = (db.tt_places ??= []);
  for (const r of rows) {
    const i = list.findIndex((x) => x.id === r.id);
    if (i >= 0) list[i] = r; else list.push(r);
  }
  await flush();
}

export async function deleteTtPlace(id: string): Promise<void> {
  const s = supa();
  if (s) { must(await s.from("tt_places").delete().eq("id", id)); return; }
  const db = await local();
  db.tt_places = (db.tt_places ?? []).filter((r) => r.id !== id);
  await flush();
}

/** 카카오 다시 불러오기 등: 한 범위·출처의 장소를 통째로 바꾼다(운영자 입력 장소는 건드리지 않음) */
export async function replaceTtPlacesByOrigin(venue_key: string, origin: TtPlaceRow["origin"], rows: TtPlaceRow[]): Promise<void> {
  const s = supa();
  if (s) {
    must(await s.from("tt_places").delete().eq("venue_key", venue_key).eq("origin", origin));
    if (rows.length) must(await s.from("tt_places").upsert(rows));
    return;
  }
  const db = await local();
  db.tt_places = (db.tt_places ?? []).filter((r) => !(r.venue_key === venue_key && r.origin === origin)).concat(rows);
  await flush();
}

export async function replacePlaces(concertId: string, places: Place[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = places.map((p) => ({ id: p.id, concert_id: concertId, data: p, synced_at: now }));
  const s = supa();
  if (s) {
    must(await s.from("places_cache").delete().eq("concert_id", concertId));
    if (rows.length) must(await s.from("places_cache").insert(rows));
    return;
  }
  const db = await local();
  db.places_cache = db.places_cache.filter((p) => p.concert_id !== concertId).concat(rows);
  await flush();
}

export async function placeCounts(): Promise<Record<string, { count: number; synced_at: string | null }>> {
  const s = supa();
  const rows: { concert_id: string; synced_at: string }[] = s
    ? (must(await s.from("places_cache").select("concert_id,synced_at")) as { concert_id: string; synced_at: string }[])
    : (await local()).places_cache;
  const out: Record<string, { count: number; synced_at: string | null }> = {};
  for (const r of rows) {
    const o = (out[r.concert_id] ??= { count: 0, synced_at: null });
    o.count++;
    if (!o.synced_at || r.synced_at > o.synced_at) o.synced_at = r.synced_at;
  }
  return out;
}

// ---------- trips ----------
export async function createTrip(t: Omit<Trip, "id" | "created_at">): Promise<Trip> {
  const trip: Trip = { ...t, id: randomUUID(), created_at: new Date().toISOString() };
  const s = supa();
  if (s) return must(await s.from("trips").insert(trip).select().single()) as Trip;
  const db = await local();
  db.trips.push(trip);
  await flush();
  return trip;
}

export async function getTripBy(field: "parent_token" | "kid_token" | "id", value: string): Promise<Trip | null> {
  if (!value) return null;
  const s = supa();
  if (s) return (must(await s.from("trips").select("*").eq(field, value).maybeSingle()) as Trip) ?? null;
  return (await local()).trips.find((t) => t[field] === value) ?? null;
}

export async function updateTrip(id: string, patch: Partial<Trip>): Promise<Trip> {
  const s = supa();
  if (s) return must(await s.from("trips").update(patch).eq("id", id).select().single()) as Trip;
  const db = await local();
  const t = db.trips.find((x) => x.id === id);
  if (!t) throw new Error("trip not found");
  Object.assign(t, patch);
  await flush();
  return t;
}

export async function listTripsLite(): Promise<Pick<Trip, "id" | "src" | "created_at" | "plan_version" | "concert_id">[]> {
  const s = supa();
  if (s) return must(await s.from("trips").select("id,src,created_at,plan_version,concert_id")) as Trip[];
  return (await local()).trips.map(({ id, src, created_at, plan_version, concert_id }) => ({ id, src, created_at, plan_version, concert_id }));
}

// ---------- trip_events ----------
export async function addEvent(trip_id: string | null, type: EventType, item_id: string | null = null, payload: Record<string, unknown> = {}): Promise<TripEvent> {
  const e: TripEvent = { id: randomUUID(), trip_id, type, item_id, payload, created_at: new Date().toISOString() };
  const s = supa();
  if (s) { must(await s.from("trip_events").insert(e)); return e; }
  const db = await local();
  db.trip_events.push(e);
  await flush();
  return e;
}

export async function listEvents(tripId: string): Promise<TripEvent[]> {
  const s = supa();
  if (s) return must(await s.from("trip_events").select("*").eq("trip_id", tripId).order("created_at")) as TripEvent[];
  return (await local()).trip_events.filter((e) => e.trip_id === tripId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listAllEvents(): Promise<Pick<TripEvent, "trip_id" | "type" | "payload" | "created_at">[]> {
  const s = supa();
  if (s) {
    // 해커톤 규모 기준. 1000행 넘으면 페이지로 나눠 읽는다.
    const out: TripEvent[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(await s.from("trip_events").select("trip_id,type,payload,created_at").range(from, from + 999)) as TripEvent[];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }
  return (await local()).trip_events;
}

// ---------- chats ----------
export async function addChat(trip_id: string, role: "parent" | "ai", text: string): Promise<ChatRow> {
  const c: ChatRow = { id: randomUUID(), trip_id, role, text, created_at: new Date().toISOString() };
  const s = supa();
  if (s) { must(await s.from("chats").insert(c)); return c; }
  const db = await local();
  db.chats.push(c);
  await flush();
  return c;
}

export async function listChats(tripId: string): Promise<ChatRow[]> {
  const s = supa();
  if (s) return must(await s.from("chats").select("*").eq("trip_id", tripId).order("created_at")) as ChatRow[];
  return (await local()).chats.filter((c) => c.trip_id === tripId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// ---------- plan_cache (같은 입력이면 같은 일정) ----------
export async function getCachedPlan(hash: string): Promise<Plan | null> {
  const s = supa();
  if (s) return ((must(await s.from("plan_cache").select("plan").eq("hash", hash).maybeSingle()) as { plan: Plan } | null)?.plan) ?? null;
  return (await local()).plan_cache?.find((r) => r.hash === hash)?.plan ?? null;
}

export async function setCachedPlan(hash: string, plan: Plan): Promise<void> {
  const row = { hash, plan, created_at: new Date().toISOString() };
  const s = supa();
  if (s) { must(await s.from("plan_cache").upsert(row)); return; }
  const db = await local();
  db.plan_cache = (db.plan_cache ?? []).filter((r) => r.hash !== hash).concat(row);
  await flush();
}

// ---------- api_usage ----------
export async function addUsage(u: Omit<UsageRow, "id" | "created_at">): Promise<void> {
  const row: UsageRow = { ...u, id: randomUUID(), created_at: new Date().toISOString() };
  const s = supa();
  if (s) { must(await s.from("api_usage").insert(row)); return; }
  const db = await local();
  (db.api_usage ??= []).push(row);
  await flush();
}

export async function listUsage(): Promise<UsageRow[]> {
  const s = supa();
  if (s) return must(await s.from("api_usage").select("*").order("created_at")) as UsageRow[];
  return (await local()).api_usage ?? [];
}

export async function sumUsage(): Promise<number> {
  return (await listUsage()).reduce((a, r) => a + Number(r.cost_usd), 0);
}

// ---------- 팬 라운지 (community_*) ----------
/** 글 목록: artist(slug)가 없으면 전체, 최신순 */
export async function listFanPosts(o: { artist?: string; limit?: number; withHidden?: boolean } = {}): Promise<FanPost[]> {
  const limit = o.limit ?? 50;
  const s = supa();
  if (s) {
    let q = s.from("community_posts").select("*").order("created_at", { ascending: false }).limit(limit);
    if (o.artist) q = q.eq("artist", o.artist);
    if (!o.withHidden) q = q.eq("hidden", false);
    let r = await q;
    // 0008 SQL(숨김 칸) 실행 전이면 숨김 조건 없이 다시 읽는다
    if (r.error && /hidden/.test(r.error.message)) {
      let q2 = s.from("community_posts").select("*").order("created_at", { ascending: false }).limit(limit);
      if (o.artist) q2 = q2.eq("artist", o.artist);
      r = await q2;
    }
    if (r.error) { console.warn("[community] 목록 실패(0007 SQL 실행 전일 수 있어요):", r.error.message); return []; }
    return r.data as FanPost[];
  }
  return ((await local()).community_posts ?? []).filter((p) => (!o.artist || p.artist === o.artist) && (o.withHidden || !p.hidden)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}
export async function getFanPost(id: string): Promise<FanPost | null> {
  const s = supa();
  if (s) { const r = await s.from("community_posts").select("*").eq("id", id).maybeSingle(); return r.error ? null : (r.data as FanPost | null); }
  return ((await local()).community_posts ?? []).find((p) => p.id === id) ?? null;
}
export async function createFanPost(p: Omit<FanPost, "id" | "likes" | "comments" | "created_at">): Promise<FanPost> {
  const row: FanPost = { ...p, images: p.images ?? [], id: randomUUID(), likes: 0, comments: 0, created_at: new Date().toISOString() };
  const s = supa();
  if (s) { must(await s.from("community_posts").insert(row), "poll"); return row; }
  const db = await local();
  (db.community_posts ??= []).push(row);
  await flush();
  return row;
}
export async function listFanComments(postId: string): Promise<FanComment[]> {
  const s = supa();
  if (s) { const r = await s.from("community_comments").select("*").eq("post_id", postId).order("created_at"); return r.error ? [] : (r.data as FanComment[]); }
  return ((await local()).community_comments ?? []).filter((c) => c.post_id === postId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function addFanComment(c: Omit<FanComment, "id" | "created_at">): Promise<FanComment> {
  const row: FanComment = { ...c, id: randomUUID(), created_at: new Date().toISOString() };
  const s = supa();
  if (s) {
    must(await s.from("community_comments").insert(row), "images");
    const p = await getFanPost(c.post_id);
    if (p) await s.from("community_posts").update({ comments: p.comments + 1 }).eq("id", p.id);
    return row;
  }
  const db = await local();
  (db.community_comments ??= []).push(row);
  const p = (db.community_posts ?? []).find((x) => x.id === c.post_id);
  if (p) p.comments += 1;
  await flush();
  return row;
}
/** 좋아요 누르기/취소. 반환: 지금 좋아요 상태, 이번에 더해진 수(+1/-1) */
export async function toggleFanLike(postId: string, authorId: string): Promise<{ liked: boolean; delta: number }> {
  const s = supa();
  if (s) {
    const has = await s.from("community_likes").select("post_id").eq("post_id", postId).eq("author_id", authorId).maybeSingle();
    const liked = !has.data;
    if (liked) must(await s.from("community_likes").insert({ post_id: postId, author_id: authorId }));
    else must(await s.from("community_likes").delete().eq("post_id", postId).eq("author_id", authorId));
    const p = await getFanPost(postId);
    if (p) await s.from("community_posts").update({ likes: Math.max(0, p.likes + (liked ? 1 : -1)) }).eq("id", p.id);
    return { liked, delta: liked ? 1 : -1 };
  }
  const db = await local();
  const list = (db.community_likes ??= []);
  const i = list.findIndex((l) => l.post_id === postId && l.author_id === authorId);
  const liked = i < 0;
  if (liked) list.push({ post_id: postId, author_id: authorId }); else list.splice(i, 1);
  const p = (db.community_posts ?? []).find((x) => x.id === postId);
  if (p) p.likes = Math.max(0, p.likes + (liked ? 1 : -1));
  await flush();
  return { liked, delta: liked ? 1 : -1 };
}
export async function likedFanPosts(authorId: string): Promise<Set<string>> {
  const s = supa();
  if (s) { const r = await s.from("community_likes").select("post_id").eq("author_id", authorId); return new Set(r.error ? [] : (r.data as { post_id: string }[]).map((x) => x.post_id)); }
  return new Set(((await local()).community_likes ?? []).filter((l) => l.author_id === authorId).map((l) => l.post_id));
}

/** 사진 올리기: Supabase Storage(community 버킷), 로컬은 .data/uploads에 저장하고 /api/community/file로 보여 준다 */
export async function uploadFanImage(name: string, data: Buffer, contentType: string): Promise<string> {
  const s = supa();
  if (s) {
    const r = await s.storage.from("community").upload(name, data, { contentType, upsert: false });
    if (r.error) throw new Error(`사진을 올리지 못했어요: ${r.error.message}`);
    return s.storage.from("community").getPublicUrl(name).data.publicUrl;
  }
  const dir = path.join(path.dirname(LOCAL_PATH), "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name.replace(/\//g, "_")), data);
  return `/api/community/file?n=${encodeURIComponent(name.replace(/\//g, "_"))}`;
}
export async function readLocalUpload(n: string): Promise<Buffer | null> {
  if (!/^[\w.-]+$/.test(n)) return null;
  try { return await fs.readFile(path.join(path.dirname(LOCAL_PATH), "uploads", n)); } catch { return null; }
}

/** 신고: 한 사람당 한 번. 3건이 쌓이면 자동으로 숨긴다 */
export async function reportFanPost(postId: string, reporterId: string, reason: string): Promise<{ reports: number; hidden: boolean }> {
  const s = supa();
  if (s) {
    const ins = await s.from("community_reports").insert({ post_id: postId, reporter_id: reporterId, reason });
    if (ins.error && !/duplicate|unique/i.test(ins.error.message)) throw new Error(ins.error.message);
    const cnt = await s.from("community_reports").select("post_id", { count: "exact", head: true }).eq("post_id", postId);
    const reports = cnt.count ?? 0;
    const hidden = reports >= 3;
    if (!postId.startsWith("mock-")) await s.from("community_posts").update({ reports, ...(hidden ? { hidden: true } : {}) }).eq("id", postId);
    return { reports, hidden };
  }
  const db = await local();
  const p = (db.community_posts ?? []).find((x) => x.id === postId);
  const key = `${postId}|${reporterId}`;
  const list = ((db as unknown as { community_reports?: string[] }).community_reports ??= []);
  if (!list.includes(key)) list.push(key);
  const reports = list.filter((k) => k.startsWith(`${postId}|`)).length;
  if (p) { p.reports = reports; if (reports >= 3) p.hidden = true; }
  await flush();
  return { reports, hidden: reports >= 3 };
}

/** 관리자: 숨기기·다시 보이기 */
export async function setFanPostHidden(postId: string, hidden: boolean): Promise<void> {
  const s = supa();
  if (s) { must(await s.from("community_posts").update({ hidden }).eq("id", postId)); return; }
  const db = await local();
  const p = (db.community_posts ?? []).find((x) => x.id === postId);
  if (p) { p.hidden = hidden; await flush(); }
}

// ---------- 팬 라운지 투표 ----------
// 새 표를 만들지 않으려고 community_likes에 post_id "{글}#v{보기 번호}"로 한 표씩 저장한다(한 사람 한 표, 다시 누르면 바꾸기)
const voteKey = (postId: string, i: number) => `${postId}#v${i}`;
const voteIdx = (key: string) => Number(key.split("#v")[1]);

/** 보기별 실제 표 수와 내 표 */
export async function pollVotes(postId: string, authorId?: string | null): Promise<{ counts: Record<number, number>; mine: number | null }> {
  const s = supa();
  let rows: { post_id: string; author_id: string }[];
  if (s) {
    const r = await s.from("community_likes").select("post_id, author_id").like("post_id", `${postId}#v%`);
    rows = r.error ? [] : (r.data as typeof rows);
  } else rows = ((await local()).community_likes ?? []).filter((l) => l.post_id.startsWith(`${postId}#v`));
  const counts: Record<number, number> = {};
  let mine: number | null = null;
  for (const r of rows) {
    const i = voteIdx(r.post_id);
    counts[i] = (counts[i] ?? 0) + 1;
    if (authorId && r.author_id === authorId) mine = i;
  }
  return { counts, mine };
}

/** 투표하기(이미 했으면 다른 보기로 바꾼다) */
export async function votePoll(postId: string, authorId: string, i: number): Promise<{ counts: Record<number, number>; mine: number | null }> {
  const prev = await pollVotes(postId, authorId);
  const s = supa();
  if (s) {
    if (prev.mine != null) must(await s.from("community_likes").delete().eq("post_id", voteKey(postId, prev.mine)).eq("author_id", authorId));
    must(await s.from("community_likes").insert({ post_id: voteKey(postId, i), author_id: authorId }));
  } else {
    const db = await local();
    const list = (db.community_likes ??= []);
    db.community_likes = list.filter((l) => !(l.author_id === authorId && l.post_id.startsWith(`${postId}#v`)));
    db.community_likes.push({ post_id: voteKey(postId, i), author_id: authorId });
    await flush();
  }
  return pollVotes(postId, authorId);
}
