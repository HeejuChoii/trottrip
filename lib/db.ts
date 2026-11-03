// 저장소 계층. SUPABASE_URL/SUPABASE_SERVICE_KEY가 있으면 Supabase, 없으면 로컬 개발용 JSON 파일(.data/db.json).
// 서버에서만 import 한다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChatRow, Concert, EventType, Place, Plan, Trip, TripEvent, TtPlaceRow } from "./types.ts";
import { SEED_CONCERTS, SEED_TT_PLACES } from "./seed.ts";

interface LocalDB {
  concerts: Concert[];
  places_cache: { id: string; concert_id: string; data: Place; synced_at: string }[];
  trips: Trip[];
  trip_events: TripEvent[];
  chats: ChatRow[];
  tt_places?: TtPlaceRow[];
  plan_cache?: { hash: string; plan: Plan; created_at: string }[];
  api_usage?: UsageRow[];
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

function must<T>(r: { data: T; error: { message: string } | null }): T {
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
  for (const p of [...tt.map((r) => ({ ...r.data, origin: r.origin })), ...ct]) {
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
