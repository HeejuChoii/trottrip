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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = "";
    try { msg = (JSON.parse(body) as { message?: string }).message ?? ""; } catch { msg = body.slice(0, 200); }
    const hint = /OPEN_MAP_AND_LOCAL|disabled/i.test(msg)
      ? " → 카카오 디벨로퍼스 [제품 설정 → 카카오맵]에서 '사용 설정'을 켜 주세요(로컬 검색도 여기에 포함)."
      : res.status === 401 ? " → KAKAO_REST_API_KEY가 REST API 키가 맞는지 확인해 주세요." : "";
    throw new Error(`카카오 로컬 오류 ${res.status}: ${msg}${hint}`);
  }
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
  if (/중식|중국/.test(category)) t.add("chinese");
  if (/일식|초밥|돈까스|우동|라멘|일본/.test(category)) t.add("japanese");
  if (/양식|이탈리안|피자|파스타|스테이크|햄버거|패밀리레스토랑|프랑스/.test(category)) t.add("western");
  if (/분식|김밥|떡볶이/.test(category)) t.add("snack");
  if (/아시아|베트남|태국|인도/.test(category)) t.add("asian");
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

/** 관광지 성격: 카카오 분류 → 전시·산책·시장·역사·바다·실내 */
export function likesFromCategory(cat: string, name: string): string[] {
  const t = `${cat} ${name}`;
  const out = new Set<string>();
  if (/미술관|박물관|전시|갤러리|기념관|과학관|문화원|아트/.test(t)) { out.add("전시"); out.add("실내"); }
  if (/공원|산책|둘레길|호수|숲|정원|수목원|전망|길$|거리/.test(t)) out.add("산책");
  if (/시장/.test(t)) out.add("시장");
  if (/궁|사찰|절|문화재|유적|향교|고택|한옥|성곽|서원|역사/.test(t)) out.add("역사");
  if (/해수욕장|해변|바다|해안|항구|섬/.test(t)) out.add("바다");
  if (/도서관|쇼핑|몰|백화점|아쿠아리움/.test(t)) out.add("실내");
  return [...out];
}

/** 공연장 반경 radius(m) 안 관광명소(AT4)·문화시설(CT1) — 1박 둘째 날 가볼 만한 곳 */
export async function importSights(lat: number, lng: number, radius = 6000): Promise<Place[]> {
  const out: Place[] = [];
  for (const [code, pages] of [["AT4", 2], ["CT1", 1]] as const) {
    for (let page = 1; page <= pages; page++) {
      const r = await kakaoGet("category.json", { category_group_code: code, x: lng, y: lat, radius: Math.min(radius, 20000), sort: "accuracy", page, size: 15 });
      for (const d of r.documents) {
        if (/영화관|공연장|극장|노래방|PC방|모텔|호텔/.test(d.category_name)) continue;
        const likes = likesFromCategory(d.category_name, d.place_name);
        out.push({
          id: `ks_${d.id}`, concert_ids: [], name: d.place_name, category: "sight", lat: Number(d.y), lng: Number(d.x),
          address: d.road_address_name || d.address_name, walk_min_from_venue: null, tags: likes.includes("실내") ? ["indoor"] : [],
          fan_type: "none", description_ko: d.category_name.split(" > ").slice(-1)[0], evidence_urls: d.place_url ? [d.place_url] : [],
          source: "needs_check", updated_at: new Date().toISOString(), concertrip_url: "", origin: "research",
          category_detail: d.category_name, link_url: d.place_url || undefined, likes,
        });
      }
      if (r.meta.is_end) break;
    }
  }
  return out;
}

/** 자동차 길찾기(카카오모빌리티). 카카오 디벨로퍼스에서 '카카오내비'를 켜야 쓸 수 있다 */
export async function carRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<{ km: number; min: number; path: [number, number][] } | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ origin: `${from.lng},${from.lat}`, destination: `${to.lng},${to.lat}`, priority: "RECOMMEND" });
  const res = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?${qs}`, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`카카오내비 ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const j = await res.json() as { routes?: { result_code: number; summary?: { distance: number; duration: number }; sections?: { roads: { vertexes: number[] }[] }[] }[] };
  const r = j.routes?.[0];
  if (!r || r.result_code !== 0 || !r.summary) return null;
  const path: [number, number][] = [];
  for (const s of r.sections ?? []) for (const road of s.roads) for (let i = 0; i + 1 < road.vertexes.length; i += 2) path.push([road.vertexes[i + 1], road.vertexes[i]]);
  const step = Math.max(1, Math.floor(path.length / 400)); // 지도에 그리기 충분한 만큼만
  return { km: r.summary.distance / 1000, min: Math.round(r.summary.duration / 60), path: path.filter((_, i) => i % step === 0 || i === path.length - 1) };
}
