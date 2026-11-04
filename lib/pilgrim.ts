// 공연 없이 떠나는 "성지순례 여행" (팬덤트립).
// 가수가 다녀간 곳·팬들이 찾는 곳을 코스로 묶어 두고, 부모님 걷기·식성에 맞춰 하루 동선을 코드로 짠다.
// - 장소 순서: 출발점에서 가까운 곳부터(최근접 이웃) → 점심은 11:40에 가장 가깝게 끼워 넣는다
// - 구간마다 거리로 도보/택시를 정한다(걷기 기준을 넘으면 택시)
// - 식당: 코스 안 팬덤 식당 중 식성에 맞는 곳 → 없으면 근처 카카오 식당 → 없으면 일반 안내
import data from "../data/pilgrimage.json" with { type: "json" };
import type { ConcertView, ParentProfile, Place, Plan, PlanItem, Transport } from "./types.ts";
import { honorificOf, maxWalkFor, restaurantMatches, isSpicyByName } from "./planner.ts";
import { isHHMM, toHHMM, toMin } from "./time.ts";

export interface PilgrimArtist { name: string; fandom: string; color: string; blurb: string }
export interface PilgrimCourse {
  id: string;
  artist: string;
  title: string;
  region: string;
  blurb: string;
  start: { name: string; lat: number; lng: number };
  place_ids: string[];
  /** 출발점까지 오는 법 (예: 마라도 배편) */
  arrive_note?: string;
}
type RawPlace = Partial<Place> & {
  id: string; name: string; category: Place["category"]; lat: number | null; lng: number | null; region?: string; status_note?: string;
  /** 영업시간 "11:00-21:00" (모르면 없음) */
  hours?: string;
  /** 쉬는 요일 ["월"] */
  closed?: string[];
};

const D = data as unknown as { provider: string; artists: PilgrimArtist[]; courses: PilgrimCourse[]; places: RawPlace[] };

export const PILGRIM_PROVIDER = D.provider; // "concertrip": 콘서트립 팬덤 장소 DB 형식
/** 데이터 버전(내용이 바뀌면 달라짐) — 일정 캐시 키에 넣어 고친 데이터가 바로 반영되게 한다 */
export const PILGRIM_REV = (() => { const t = JSON.stringify(data); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); })();

export function pilgrimArtists(): PilgrimArtist[] { return D.artists; }
export function pilgrimCourses(artist?: string): PilgrimCourse[] {
  return D.courses.filter((c) => !artist || c.artist === artist);
}
export function getCourse(id: string): PilgrimCourse | null { return D.courses.find((c) => c.id === id) ?? null; }

function toPlace(r: RawPlace): Place {
  return {
    concert_ids: [], address: "", walk_min_from_venue: null, tags: [], fan_type: "artist_visited", description_ko: "",
    evidence_urls: [], source: "needs_check", updated_at: "2026-11-04T00:00:00+09:00", concertrip_url: "",
    ...r, origin: "concertrip",
  } as Place;
}

/** 좌표 검색어: 주소 → 대체 검색어(geo_query) → 이름 순서로 카카오에서 찾는다 */
export function geoQueries(p: Place): string[] {
  const raw = D.places.find((x) => x.id === p.id) as (RawPlace & { geo_query?: string[] }) | undefined;
  const addr = p.address && !/미확인|일대|단일 주소|출구 앞/.test(p.address) ? p.address.replace(/\s*\(.*\)$/, "") : "";
  return [addr, ...(raw?.geo_query ?? []), p.name.replace(/\s*\(([^)]*)\)$/, " $1"), p.name.replace(/\s*\(.*\)$/, "")].filter((q, i, a) => q && a.indexOf(q) === i);
}

/** 모든 성지 (관리자 좌표·평점 붙여넣기용) */
export function allSpots(): Place[] {
  return D.places.map(toPlace);
}

/** 코스의 팬덤 장소 (콘서트립 형식) */
export function courseSpots(c: PilgrimCourse): Place[] {
  const byId = new Map(D.places.map((p) => [p.id, p]));
  return c.place_ids.map((id) => byId.get(id)).filter((p): p is RawPlace => !!p).map(toPlace);
}

/** 장소의 영업시간·휴무 메모 (자녀 화면) */
export function statusNote(p: Pick<Place, "hours" | "closed">): string {
  return [p.hours ? `영업 ${p.hours.replace("-", "~")}` : "", p.closed?.length ? `${p.closed.join("·")} 휴무` : ""].filter(Boolean).join(" · ");
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** 그 날짜·시각에 열려 있나 (영업시간·휴무일 정보가 없으면 연 것으로 본다). id만 주면 데이터 파일 값으로 본다 */
export function openAt(place: string | Pick<Place, "id" | "hours" | "closed">, date: string, startMin: number, endMin = startMin + 30): boolean {
  const p = typeof place === "string" ? D.places.find((x) => x.id === place.replace(/^geo__/, "")) : place;
  if (!p) return true;
  const d = new Date(`${date}T12:00:00+09:00`);
  if (p.closed?.length && !isNaN(d.getTime()) && p.closed.includes(DOW[d.getUTCDay()])) return false;
  const m = p.hours?.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return true;
  const o = toMin(m[1]);
  let c = toMin(m[2]); if (c <= o) c += 24 * 60;
  return startMin >= o && endMin <= c;
}

export function pilgrimView(c: PilgrimCourse, date: string, start_time: string): ConcertView {
  const a = D.artists.find((x) => x.name === c.artist);
  return {
    id: null, title: c.title, artist_display: c.artist, color: a?.color ?? "#14C1AD", city: c.region,
    venue_name: c.start.name, venue_lat: c.start.lat, venue_lng: c.start.lng, date, start_time, est_end_time: null,
    notice_text: "", gate_map: {}, zone_image_url: null, official_map_url: null, info_desk_place_id: null, custom: false,
    pilgrim: { course_id: c.id, region: c.region, provider: PILGRIM_PROVIDER, arrive_note: c.arrive_note },
  };
}

// ---------- 거리 ----------
type LL = { lat: number; lng: number };
export function km(a: LL, b: LL): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** 구간 이동: 걷기 기준 안이면 도보, 넘으면 택시(시내 평균 22km/h + 잡는 시간 5분). 도로는 직선의 1.3배로 본다 */
export function leg(a: LL, b: LL, maxWalk: number): { mode: "walk" | "taxi"; min: number; km: number } {
  const d = km(a, b) * 1.3;
  const walk = Math.max(1, Math.round((d / 4) * 60));
  if (walk <= maxWalk) return { mode: "walk", min: walk, km: d };
  return { mode: "taxi", min: Math.max(8, Math.round(5 + (d / (d > 30 ? 60 : 22)) * 60)), km: d };
}
const hasLL = (p: Place): p is Place & { lat: number; lng: number } => p.lat != null && p.lng != null;

function nearestOrder(from: LL, list: (Place & LL)[]): (Place & LL)[] {
  const left = [...list];
  const out: (Place & LL)[] = [];
  let cur = from;
  while (left.length) {
    left.sort((a, b) => km(cur, a) - km(cur, b));
    const n = left.shift()!;
    out.push(n);
    cur = n;
  }
  return out;
}

export interface PilgrimInput {
  view: ConcertView;
  parent: ParentProfile;
  transport: Transport;
  /** 코스 팬덤 장소 + 근처 식당·카페(카카오) */
  places: Place[];
  lessWalk?: boolean;
  /** 자가용·택시로 집에서 출발할 때 출발지 좌표(카카오로 찾음). 없으면 출발지 이름만 쓴다 */
  originLL?: { lat: number; lng: number } | null;
}

/** 자가용 이동 시간(분): 도로는 직선의 1.3배, 시내 35km/h·장거리 70km/h, 주차·여유 10분 */
export function driveMin(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const d = km(a, b) * 1.3;
  return Math.round((d / (d > 30 ? 70 : 35)) * 60) + 10;
}

/** 숙소 길찾기 링크: 자녀가 넣은 카카오맵 링크가 있으면 그것, 없으면 이름으로 카카오맵 검색 */
export function stayLink(t: Pick<Transport, "stay_name" | "stay_link">): string | null {
  if (t.stay_link && /^https?:\/\//.test(t.stay_link)) return t.stay_link;
  const q = (t.stay_link || t.stay_name || "").trim();
  return q ? `https://map.kakao.com/link/search/${encodeURIComponent(q)}` : null;
}

const SPOT_MIN = 35;
const LUNCH_AT = 11 * 60 + 40;

export function spotsFor(walk: ParentProfile["walk"], lessWalk = false) {
  if (lessWalk) return 2;
  return walk === "15-" ? 3 : walk === "15-30" ? 4 : 5;
}

export function buildPilgrimPlan(input: PilgrimInput): Plan {
  const { view, parent, transport: t } = input;
  const who = honorificOf(parent);
  const maxWalk = input.lessWalk ? Math.min(5, maxWalkFor(parent.walk)) : maxWalkFor(parent.walk);
  const start: LL = { lat: view.venue_lat!, lng: view.venue_lng! };
  // 좌표를 아직 못 찾은 성지는 코스 순서대로 출발점 근처에 임시로 두고, 이동 시간은 "확인 필요"로 표시한다
  const approx = new Set<string>();
  const fan = input.places.filter((p) => p.origin === "concertrip").map((p, i) => {
    if (hasLL(p)) return p;
    approx.add(p.id);
    return { ...p, lat: start.lat + 0.008 * (i + 1), lng: start.lng + 0.006 * ((i % 3) - 1) };
  }) as (Place & LL)[];
  const others = input.places.filter((p) => p.origin !== "concertrip" && hasLL(p)) as (Place & LL)[];

  // 1) 둘러볼 곳(식당이 아닌 곳)과 식당 후보
  const date = view.date;
  const sights = fan.filter((p) => p.category !== "restaurant" && openAt(p, date, 10 * 60, 17 * 60) || (p.category !== "restaurant" && openAt(p, date, 14 * 60)));
  const lunchOpen = (p: Place) => openAt(p, date, 11 * 60 + 30, 13 * 60);
  const fanFood = fan.filter((p) => p.category === "restaurant" && lunchOpen(p));
  const dinnerFood = fan.filter((p) => p.category === "restaurant" && !lunchOpen(p) && openAt(p, date, 17 * 60 + 30, 18 * 60 + 30) && (restaurantMatches(p, parent) || parent.food.includes("any")));
  const okFood = fanFood.filter((p) => restaurantMatches(p, parent) || (parent.food.includes("any") && !isSpicyByName(p)));
  const nSpots = spotsFor(parent.walk, input.lessWalk);
  // 점심 먼저: 식성에 맞는 가수 단골집 → 근처 식당(카카오) → 단골집(식성 확인 필요)
  const sightsNear = nearestOrder(start, sights).slice(0, nSpots);
  const lunchPick = okFood[0] ? nearestOrder(sightsNear[Math.min(1, sightsNear.length - 1)] ?? start, okFood)[0] : null;
  const lunchAlt = !lunchPick
    ? nearestOrder(sightsNear[Math.min(1, sightsNear.length - 1)] ?? start, others.filter((p) => p.category === "restaurant" && restaurantMatches(p, parent)))[0] ?? null
    : null;
  const lunch = lunchPick ?? lunchAlt;
  const lunchFanUnfit = !lunch && fanFood.length ? nearestOrder(start, fanFood)[0] : null;
  // 둘러볼 곳이 모자라면(단골집 순례 코스) 남은 단골집도 들르는 곳으로 쓴다
  let visit = sightsNear;
  if (visit.length < nSpots) {
    const extra = nearestOrder(start, fanFood.filter((p) => p.id !== (lunch ?? lunchFanUnfit)?.id)).slice(0, nSpots - visit.length);
    visit = nearestOrder(start, [...visit, ...extra]);
  }
  const lunchPlace = lunch ?? lunchFanUnfit;

  // 2) 시작 시각
  // 자녀가 넣은 시각은 "집에서 출발하는 시각" — 자가용이면 출발지에서 첫 장소까지 운전 시간을 더한다
  const departAt = isHHMM(view.start_time) ? toMin(view.start_time) : 9 * 60;
  const origin = t.origin.trim();
  const drive = t.mode !== "train" && origin && !view.pilgrim?.arrive_note
    ? (input.originLL ? { min: driveMin(input.originLL, start), rough: false } : { min: 60, rough: true })
    : null;
  let T0 = drive ? departAt + drive.min : departAt;
  if (t.mode === "train" && isHHMM(t.train_arrive)) T0 = toMin(t.train_arrive) + 10;

  // 3) 점심을 몇 번째에 넣을지: 11:40에 가장 가깝고 덜 돌아가는 자리
  type Stop = { kind: "spot" | "meal" | "rest" | "dinner"; p: (Place & LL) | null };
  const schedule = (stops: Stop[]) => {
    let cur: LL = start, c = T0 + 10;
    const out: { stop: Stop; start: number; end: number; leg: ReturnType<typeof leg> | null }[] = [];
    for (const s of stops) {
      const lg = s.p ? leg(cur, s.p, maxWalk) : null;
      c += lg ? lg.min : 10;
      if (s.kind === "dinner") c = Math.max(c, 17 * 60 + 30);
      const len = s.kind === "meal" || s.kind === "dinner" ? (parent.food.includes("quick") ? 45 : 60) : s.kind === "rest" ? (parent.rest_often ? 40 : 30) : SPOT_MIN;
      out.push({ stop: s, start: c, end: c + len, leg: lg });
      c += len + 5;
      if (s.p) cur = s.p;
    }
    return { out, end: c, last: cur };
  };
  let best: Stop[] = visit.map((p) => ({ kind: "spot" as const, p }));
  if (lunchPlace || true) {
    let bestCost = Infinity;
    for (let i = 0; i <= visit.length; i++) {
      const stops: Stop[] = [...visit.slice(0, i).map((p) => ({ kind: "spot" as const, p })), { kind: "meal", p: lunchPlace as (Place & LL) | null }, ...visit.slice(i).map((p) => ({ kind: "spot" as const, p }))];
      const s = schedule(stops);
      const m = s.out.find((x) => x.stop.kind === "meal")!;
      const late = m.start < 11 * 60 ? (11 * 60 - m.start) * 2 : m.start > 13 * 60 ? (m.start - 13 * 60) * 2 : 0;
      const cost = Math.abs(m.start - LUNCH_AT) / 4 + late + s.end / 30;
      if (cost < bestCost) { bestCost = cost; best = stops; }
    }
  }
  // 쉬는 시간: 여유롭게 걷기·자주 쉬기면 점심 뒤 한 곳 다음에 카페
  if (parent.rest_often || parent.walk === "15-") {
    const mi = best.findIndex((s) => s.kind === "meal");
    const at = Math.min(best.length, mi + 2);
    const near = best[at - 1]?.p ?? start;
    const cafe = nearestOrder(near, [...fan, ...others].filter((p) => p.category === "cafe" && !best.some((s) => s.p?.id === p.id)))[0] ?? null;
    if (!cafe || km(near, cafe) < 3) best.splice(at, 0, { kind: "rest", p: cafe });
  }
  // 저녁에만 여는 가수 단골집: 낮 일정이 15:30 넘어 끝나고 돌아갈 시간이 넉넉하면 이른 저녁으로
  let sch = schedule(best);
  const lateOk = t.mode !== "train" || !isHHMM(t.train_return_depart) || toMin(t.train_return_depart) >= 19 * 60 + 30;
  if (!input.lessWalk && dinnerFood.length && lateOk && sch.end >= 15 * 60 + 30) {
    const d = nearestOrder(sch.last, dinnerFood as (Place & LL)[])[0];
    if (d && leg(sch.last, d, maxWalk).min <= 45) { best.push({ kind: "dinner", p: d }); sch = schedule(best); }
  }

  // 4) 일정 항목
  let seq = 0;
  const nid = () => `i${++seq}`;
  const items: PlanItem[] = [];
  const arriveText = t.mode === "train" ? `${t.train_to || view.venue_name}에 내리세요. ${view.venue_name}에서 시작해요.`
    : t.mode === "car" ? `${view.venue_name} 근처에 차를 두고 시작하세요.`
    : `${view.venue_name}에서 시작해요.`;
  const boat = view.pilgrim?.arrive_note;
  const arriveFull = boat ? `${boat} ${view.venue_name}에서 시작해요.` : arriveText;
  if (drive) {
    items.push({
      id: nid(), start: toHHMM(departAt), end: toHHMM(departAt + 10), type: "arrive", title: `출발 · ${origin}`,
      place_id: null, walk_min: null,
      parent_text: `${origin}에서 출발해요. ${view.venue_name}까지 차로 ${drive.rough ? "1시간쯤" : `${drive.min}분쯤`} 걸려요.`,
      done_label: "출발했어요", kid_note: drive.rough ? "이동 시간 추정(출발지 좌표 확인 필요)" : `차로 약 ${drive.min}분`, source: "user_input",
    });
  }
  items.push({
    id: nid(), start: toHHMM(T0), end: toHHMM(T0 + 10), type: "arrive", title: `${view.venue_name} 도착`,
    place_id: null, walk_min: null, parent_text: arriveFull, done_label: "도착했어요",
    kid_note: t.mode === "train" && t.train_depart ? `${t.train_from} ${t.train_depart} 출발` : "", source: "user_input",
  });
  const legText = (lg: ReturnType<typeof leg> | null, from: string, rough = false) => !lg ? "" : rough ? ` ${from}에서 택시나 차로 이동하세요.` : lg.mode === "walk"
    ? ` ${from}에서 걸어서 ${lg.min}분이에요.`
    : ` ${from}에서 ${lg.km >= 1 ? `약 ${Math.round(lg.km)}km라` : ""} 택시로 ${lg.min}분쯤 걸려요.`;
  let prevName = view.venue_name;
  for (const x of sch.out) {
    const p = x.stop.p;
    const lg = x.leg;
    const rough = !!p && approx.has(p.id);
    const moveNote = lg ? (rough ? "이동 시간 확인 필요" : lg.mode === "walk" ? `도보 ${lg.min}분` : `택시 약 ${lg.min}분`) : "";
    const status = p ? statusNote(p) : "";
    if (x.stop.kind === "spot" && p) {
      items.push({
        id: nid(), start: toHHMM(x.start), end: toHHMM(x.end), type: "photo", title: `${view.artist_display} 스팟 · ${p.name}`,
        place_id: p.id, walk_min: lg?.mode === "walk" ? lg.min : null,
        parent_text: `${p.description_ko || p.name}.${legText(lg, prevName, rough)} ${p.category === "restaurant" ? "가게 앞에서 사진 한 장 남기세요. 출출하시면 간단히 드셔도 좋아요." : p.category === "cafe" ? "앉아서 차 한잔하며 쉬어 가세요." : "사진 한 장 남기세요."}`,
        done_label: "다녀왔어요", kid_note: ["팬덤 장소", moveNote, status].filter(Boolean).join(" · "), source: p.source,
      });
    } else if (x.stop.kind === "meal" || x.stop.kind === "dinner") {
      const word = x.start >= 16 * 60 ? "이른 저녁" : "점심";
      const unfit = p && p === lunchFanUnfit;
      items.push({
        id: nid(), start: toHHMM(x.start), end: toHHMM(x.end), type: "meal", title: p ? `${word} · ${p.name}` : `${word} 식사`,
        place_id: p?.id ?? null, walk_min: lg?.mode === "walk" ? lg.min : null,
        parent_text: p ? `${p.description_ko || p.name}.${legText(lg, prevName, rough)} 붐비기 전에 드세요.` : "근처 식당에서 붐비기 전에 드세요.",
        done_label: "다 먹었어요",
        kid_note: [p?.fan_type && p.origin === "concertrip" ? "가수 단골집" : p ? "근처 식당" : "", moveNote, unfit ? "식성 확인 필요" : "", status].filter(Boolean).join(" · "),
        source: p?.source ?? "needs_check",
      });
    } else if (x.stop.kind === "rest") {
      items.push({
        id: nid(), start: toHHMM(x.start), end: toHHMM(x.end), type: "rest", title: p ? `쉬기 · ${p.name}` : "카페에서 쉬기",
        place_id: p?.id ?? null, walk_min: lg?.mode === "walk" ? lg.min : null,
        parent_text: `${p ? `${p.name}에서` : "가까운 카페에서"} 앉아서 쉬세요. 화장실도 다녀오세요.`,
        done_label: "잘 쉬었어요", kid_note: moveNote, source: p?.source ?? "needs_check",
      });
    }
    if (p) prevName = p.name.replace(/\s*\(.*\)$/, "");
  }
  // 약 시간
  if (isHHMM(parent.medicine_time)) {
    const m = toMin(parent.medicine_time);
    items.push({ id: nid(), start: toHHMM(m), end: toHHMM(m + 5), type: "medicine", title: "약 드실 시간", place_id: null, walk_min: null, parent_text: "챙겨 오신 약을 드세요.", done_label: "약 먹었어요", kid_note: "", source: "user_input" });
  }
  // 1박이고 숙소를 넣었으면: 마지막은 귀가 대신 숙소 체크인
  const stay = t.stay === "overnight" && (t.stay_name || t.stay_link) ? (t.stay_name || "숙소") : null;
  if (stay) {
    const at = Math.max(sch.end + 20, 15 * 60);
    const url = stayLink(t);
    items.push({
      id: nid(), start: toHHMM(at), end: toHHMM(at + 30), type: "return", title: `숙소 체크인 · ${stay}`,
      place_id: null, walk_min: null,
      parent_text: `${stay}에 가서 체크인하고 짐 푸세요. 오늘 푹 쉬세요.`,
      done_label: "체크인했어요", kid_note: "1박", source: "user_input",
      ...(url ? { link: { label: "🧭 숙소 길찾기 (카카오맵)", url } } : {}),
    });
  }
  // 귀가
  const back = leg(sch.last, start, maxWalk);
  const retStart = t.mode === "train" && isHHMM(t.train_return_depart) ? Math.max(sch.end + back.min, toMin(t.train_return_depart) - 20) : sch.end + back.min;
  if (!stay) items.push({
    id: nid(), start: toHHMM(retStart), end: toHHMM(retStart + 20), type: "return", title: t.mode === "train" ? `귀가 · ${t.train_to || view.venue_name}역` : "집으로",
    place_id: null, walk_min: back.mode === "walk" ? back.min : null,
    parent_text: t.mode === "train"
      ? `${t.train_return_depart ? `${t.train_return_depart} 열차예요. ` : ""}${back.mode === "taxi" ? `택시로 ${back.min}분쯤 걸려요. ` : ""}승차권을 꺼내 두세요.`
      : boat ? `오늘 일정 끝! ${view.venue_name}으로 돌아가 나가는 배를 타세요. 마지막 배 시간을 꼭 확인하세요.`
      : drive && input.originLL ? `오늘 일정 끝! ${origin}까지 차로 ${driveMin(sch.last, input.originLL)}분쯤 걸려요. 조심히 들어가세요.`
      : `오늘 일정 끝! ${back.mode === "taxi" ? `${view.venue_name}까지 택시로 ${back.min}분쯤 걸려요.` : "조심히 들어가세요."}`,
    done_label: t.mode === "train" ? "열차 탔어요" : "출발했어요", kid_note: "", source: "user_input",
  });
  items.sort((a, b) => toMin(a.start) - toMin(b.start));

  const spots = items.filter((i) => i.type === "photo").length;
  const taxis = sch.out.filter((x) => x.leg?.mode === "taxi").length;
  const extra = fan.filter((p) => !items.some((i) => i.place_id === p.id)).map((p) => p.id);
  return {
    title: `${who}의 ${view.artist_display} 팬덤 스팟 여행 · ${view.city}`,
    summary: [`팬덤 스팟 ${spots}곳`, lunch ? (lunchPick ? "가수 단골집에서 식사" : "식성 맞춘 식당") : "식사 시간 확보", taxis ? `먼 구간 ${taxis}번은 택시` : "걸어서 다녀요"].join(" · "),
    items,
    extra_day: extra.length ? { title: "시간이 남으면 더 들러 볼 곳", place_ids: extra } : null,
    generated_by: "rules",
    pilgrim: true,
  };
}
