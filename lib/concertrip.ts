// 콘서트립(concertrip.kr) 장소 연동 어댑터 (PRD 5장, F16)
//
// 콘서트립의 실제 응답 구조를 아직 확인하지 못했기 때문에, 흔히 쓰는 필드 이름을
// 넓게 받아서 PRD 5.3 형태(Place)로 맞춘다. 실제 구조가 확인되면 FIELD_ALIASES와
// CATEGORY_ALIASES만 고치면 된다.
//
// 연결 우선순위
//   1. 공개 읽기 API: GET {CONCERTRIP_API_URL}/concerts/{concertrip_id}/places
//   2. (같은 Supabase면) 읽기 전용 뷰 → 같은 normalizePlaces()에 넣으면 된다
//   3. 관리 화면에서 JSON 내보내기 → /admin 업로드 → parsePlacesUpload()

import {
  FAN_TYPES, PLACE_CATEGORIES, PLACE_TAGS,
  type FanType, type Place, type PlaceCategory, type PlaceSource, type PlaceTag,
} from "./types.ts";

type Raw = Record<string, unknown>;

const FIELD_ALIASES: Record<string, string[]> = {
  id: ["id", "place_id", "uuid", "slug"],
  concert_ids: ["concert_ids", "concerts", "concert_id", "concertIds"],
  name: ["name_ko", "name", "title_ko", "title", "place_name"],
  category: ["category", "type", "kind", "place_type"],
  lat: ["lat", "latitude", "y"],
  lng: ["lng", "lon", "long", "longitude", "x"],
  address: ["address_ko", "address", "addr", "road_address"],
  walk_min_from_venue: ["walk_min_from_venue", "walk_min", "walking_minutes", "walk_minutes"],
  tags: ["tags", "tag_list", "labels"],
  fan_type: ["fan_type", "fandom_type", "fan_category"],
  description: ["description_ko", "desc_ko", "summary_ko", "description", "desc", "summary"],
  evidence_urls: ["evidence_urls", "sources", "source_urls", "evidence", "references"],
  source: ["source", "verification", "status", "verified"],
  updated_at: ["updated_at", "updatedAt", "modified_at"],
  url: ["concertrip_url", "url", "permalink", "link"],
};

const CATEGORY_ALIASES: Record<string, PlaceCategory> = {
  restaurant: "restaurant", food: "restaurant", meal: "restaurant", 식당: "restaurant", 맛집: "restaurant", 음식점: "restaurant",
  cafe: "cafe", coffee: "cafe", 카페: "cafe",
  rest: "rest", lounge: "rest", rest_area: "rest", 쉼터: "rest", 휴게: "rest", 휴게실: "rest",
  goods: "goods", md: "goods", merch: "goods", merchandise: "goods", 굿즈: "goods", md부스: "goods",
  photo: "photo", photozone: "photo", photo_zone: "photo", 포토존: "photo",
  toilet: "toilet", restroom: "toilet", wc: "toilet", 화장실: "toilet",
  elevator: "elevator", ev: "elevator", lift: "elevator", 엘리베이터: "elevator",
  gate: "gate", entrance: "gate", entry: "gate", 입구: "gate", 게이트: "gate",
  info_desk: "info_desk", info: "info_desk", information: "info_desk", 안내소: "info_desk", 안내데스크: "info_desk",
  locker: "locker", storage: "locker", cloakroom: "locker", 물품보관: "locker", 보관함: "locker",
  bus_stop: "bus_stop", bus: "bus_stop", parking: "bus_stop", 버스: "bus_stop", 승하차: "bus_stop", 주차장: "bus_stop",
  sight: "sight", attraction: "sight", tour: "sight", spot: "sight", landmark: "sight", 관광: "sight", 명소: "sight",
};

const FAN_ALIASES: Record<string, FanType> = {
  artist_visited: "artist_visited", visited: "artist_visited", artist: "artist_visited", 가수방문: "artist_visited",
  fan_made: "fan_made", fan: "fan_made", fandom: "fan_made", 팬명소: "fan_made",
  official: "official", 공식: "official",
  none: "none", "": "none",
};

const TAG_ALIASES: Record<string, PlaceTag> = {
  korean: "korean", 한식: "korean",
  mild: "mild", not_spicy: "mild", 안매운: "mild", 순한: "mild",
  seafood: "seafood", 해산물: "seafood",
  quick: "quick", fast: "quick", 빠른: "quick",
  indoor: "indoor", 실내: "indoor",
  elevator: "elevator", ev: "elevator", 엘리베이터: "elevator",
  seating: "seating", seats: "seating", 좌석: "seating", 의자: "seating",
  accessible: "accessible", wheelchair: "accessible", barrier_free: "accessible", 무장애: "accessible",
};

function pick(raw: Raw, key: string): unknown {
  for (const k of FIELD_ALIASES[key] ?? [key]) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  // 중첩 location { lat, lng }
  if ((key === "lat" || key === "lng") && raw.location && typeof raw.location === "object") {
    return pick(raw.location as Raw, key);
  }
  // 다국어 객체 { ko, en }
  if (key === "name" || key === "description" || key === "address") {
    for (const k of FIELD_ALIASES[key]) {
      const v = raw[k];
      if (v && typeof v === "object" && "ko" in (v as Raw)) return (v as Raw).ko;
    }
  }
  return undefined;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object" && v && "ko" in (v as Raw)) return String((v as Raw).ko ?? "");
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-·]/g, "");
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  if (v === undefined || v === null) return [];
  return [v];
}

export function normalizeCategory(v: unknown): PlaceCategory | null {
  const s = norm(str(v));
  if ((PLACE_CATEGORIES as readonly string[]).includes(s)) return s as PlaceCategory;
  return CATEGORY_ALIASES[s] ?? null;
}

export function normalizePlace(raw: Raw, fallbackConcertId?: string): Place | null {
  const id = str(pick(raw, "id"));
  const name = str(pick(raw, "name"));
  const category = normalizeCategory(pick(raw, "category"));
  if (!id || !name || !category) return null;

  const concertIds = arr(pick(raw, "concert_ids"))
    .map((c) => (c && typeof c === "object" ? str((c as Raw).id) : str(c)))
    .filter(Boolean);
  if (fallbackConcertId && !concertIds.includes(fallbackConcertId)) concertIds.push(fallbackConcertId);

  const tags = Array.from(new Set(
    arr(pick(raw, "tags")).map((t) => TAG_ALIASES[norm(str(t))] ?? null).filter((t): t is PlaceTag => !!t),
  )).filter((t) => (PLACE_TAGS as readonly string[]).includes(t));

  const fanRaw = norm(str(pick(raw, "fan_type")));
  let fan_type: FanType = FAN_ALIASES[fanRaw] ?? "none";
  if (!(FAN_TYPES as readonly string[]).includes(fan_type)) fan_type = "none";

  const srcRaw = pick(raw, "source");
  let source: PlaceSource = "needs_check";
  if (srcRaw === true || norm(str(srcRaw)) === "verified" || norm(str(srcRaw)) === "official") source = "verified";
  else if (norm(str(srcRaw)) === "userinput" || norm(str(srcRaw)) === "user_input") source = "user_input";

  const evidence = arr(pick(raw, "evidence_urls"))
    .map((e) => (e && typeof e === "object" ? str((e as Raw).url) : str(e)))
    .filter((u) => /^https?:\/\//.test(u));

  let url = str(pick(raw, "url"));
  if (url && !/^https?:\/\//.test(url)) url = `https://concertrip.kr${url.startsWith("/") ? "" : "/"}${url}`;

  return {
    id,
    concert_ids: concertIds,
    name,
    category,
    lat: num(pick(raw, "lat")),
    lng: num(pick(raw, "lng")),
    address: str(pick(raw, "address")),
    walk_min_from_venue: num(pick(raw, "walk_min_from_venue")),
    tags,
    fan_type,
    description_ko: str(pick(raw, "description")),
    evidence_urls: evidence,
    source,
    updated_at: str(pick(raw, "updated_at")) || new Date().toISOString(),
    concertrip_url: url,
  };
}

/** 배열, {places:[...]}, {data:[...]}, {items:[...]} 어떤 형태든 받는다 */
export function normalizePlaces(input: unknown, fallbackConcertId?: string): { places: Place[]; skipped: number } {
  let list: unknown[] = [];
  if (Array.isArray(input)) list = input;
  else if (input && typeof input === "object") {
    const o = input as Raw;
    const inner = o.places ?? o.data ?? o.items ?? o.results;
    if (Array.isArray(inner)) list = inner;
    else if (inner && typeof inner === "object" && Array.isArray((inner as Raw).places)) list = (inner as Raw).places as unknown[];
  }
  const places: Place[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of list) {
    const p = r && typeof r === "object" ? normalizePlace(r as Raw, fallbackConcertId) : null;
    if (!p || seen.has(p.id)) { skipped++; continue; }
    seen.add(p.id);
    places.push(p);
  }
  return { places, skipped };
}

export function concertripConfigured(): boolean {
  return !!process.env.CONCERTRIP_API_URL;
}

/** 1번 방식: 공개 읽기 API */
export async function fetchConcertPlaces(concertripId: string): Promise<{ places: Place[]; skipped: number }> {
  const base = process.env.CONCERTRIP_API_URL;
  if (!base) throw new Error("CONCERTRIP_API_URL이 설정되지 않았어요. JSON 업로드를 이용해 주세요.");
  const url = `${base.replace(/\/$/, "")}/concerts/${encodeURIComponent(concertripId)}/places`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.CONCERTRIP_API_TOKEN) headers.authorization = `Bearer ${process.env.CONCERTRIP_API_TOKEN}`;
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`콘서트립 응답 오류 ${res.status}`);
  return normalizePlaces(await res.json(), concertripId);
}

/** 3번 방식: 관리 화면 JSON 업로드 */
export function parsePlacesUpload(text: string, concertripId?: string) {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("JSON 형식이 아니에요."); }
  return normalizePlaces(json, concertripId);
}

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  restaurant: "식당", cafe: "카페", rest: "쉼터", goods: "굿즈 부스", photo: "포토존", toilet: "화장실",
  elevator: "엘리베이터", gate: "입구", info_desk: "안내소", locker: "물품 보관", bus_stop: "버스 승하차", sight: "관광지",
};

export const FAN_LABEL: Record<FanType, string> = {
  artist_visited: "가수 방문", fan_made: "팬 명소", official: "공식 장소", none: "",
};
