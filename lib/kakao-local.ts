// 카카오 로컬 API: 공연장 주변 식당·카페 불러오기, 장소 이름으로 좌표 찾기.
// KAKAO_REST_API_KEY(카카오 디벨로퍼스 같은 앱의 REST API 키)가 필요하다. 서버에서만 쓴다.
// 평점은 카카오가 공식 API로 주지 않아서 받지 않는다(긁어 오기는 약관 위반).
import type { Place, PlaceTag } from "./types.ts";

const BASE = "https://dapi.kakao.com/v2/local/search";

interface KakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
}

export function kakaoConfigured() {
  return !!process.env.KAKAO_REST_API_KEY;
}

async function kakaoGet(path: string, params: Record<string, string | number>): Promise<{ documents: KakaoDoc[]; meta: { is_end: boolean } }> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY가 설정되지 않았어요");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}/${path}?${qs}`, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`카카오 로컬 응답 오류 ${res.status}`);
  return res.json();
}

const BAR_RE = /술집|호프|요리주점|이자카야|포장마차|칵테일|와인바|바\(BAR\)/;
const QUICK_RE = /국밥|분식|국수|김밥|패스트푸드|햄버거|도시락|칼국수|해장국|설렁탕|곰탕|백반|샌드위치|죽/;
const SEAFOOD_RE = /해물|생선|회|조개|대게|초밥|해산물|장어|복어/;

/** 노년층 걸음(분당 약 50m) 기준 도보 분 */
export function walkMinFromDistance(m: number): number {
  return Math.max(1, Math.ceil(m / 50));
}

export function tagsFromCategory(category: string, group: string): PlaceTag[] {
  const t = new Set<PlaceTag>(["indoor"]);
  if (/한식/.test(category)) t.add("korean");
  if (SEAFOOD_RE.test(category)) t.add("seafood");
  if (group === "FD6" && QUICK_RE.test(category)) t.add("quick");
  return [...t];
}

export function kakaoDocToPlace(d: KakaoDoc): Place {
  const isCafe = d.category_group_code === "CE7";
  return {
    id: `kk_${d.id}`,
    concert_ids: [],
    name: d.place_name,
    category: isCafe ? "cafe" : "restaurant",
    lat: Number(d.y),
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    walk_min_from_venue: d.distance ? walkMinFromDistance(Number(d.distance)) : null,
    tags: tagsFromCategory(d.category_name, d.category_group_code),
    fan_type: "none",
    description_ko: `${d.category_name.split(" > ").slice(-1)[0]} · 공연장에서 약 ${d.distance}m`,
    evidence_urls: d.place_url ? [d.place_url] : [],
    source: "needs_check",
    updated_at: new Date().toISOString(),
    concertrip_url: "",
    origin: "kakao",
    category_detail: d.category_name,
    phone: d.phone || undefined,
    link_url: d.place_url || undefined,
  };
}

/** 공연장 반경 radius(m) 안 식당(최대 45곳)·카페(최대 15곳), 가까운 순 */
export async function importNearby(lat: number, lng: number, radius = 800): Promise<Place[]> {
  const out: Place[] = [];
  for (const [code, pages] of [["FD6", 3], ["CE7", 1]] as const) {
    for (let page = 1; page <= pages; page++) {
      const r = await kakaoGet("category.json", { category_group_code: code, x: lng, y: lat, radius, sort: "distance", page, size: 15 });
      for (const d of r.documents) if (!BAR_RE.test(d.category_name)) out.push(kakaoDocToPlace(d));
      if (r.meta.is_end) break;
    }
  }
  return out;
}

/** 장소 이름으로 좌표 찾기 (공연장 근처 우선) */
export async function geocode(query: string, near?: { lat: number; lng: number }): Promise<{ name: string; lat: number; lng: number; address: string; distance_m: number | null; url: string } | null> {
  const params: Record<string, string | number> = { query, size: 1 };
  if (near) Object.assign(params, { x: near.lng, y: near.lat, radius: 5000, sort: "distance" });
  const r = await kakaoGet("keyword.json", params);
  const d = r.documents[0];
  if (!d) return null;
  return { name: d.place_name, lat: Number(d.y), lng: Number(d.x), address: d.road_address_name || d.address_name, distance_m: d.distance ? Number(d.distance) : null, url: d.place_url };
}
