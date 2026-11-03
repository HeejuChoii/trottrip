// 규칙 기반 일정 엔진 (PRD F5 규칙 1~8, F11 재생성).
// - ANTHROPIC_API_KEY가 없을 때, AI가 두 번 실패했을 때, 장소가 없는 "일반 일정"일 때 쓴다.
// - AI 결과 검증(validatePlan)도 여기서 한다.
import type {
  ConcertView, ParentProfile, Place, PlaceCategory, Plan, PlanItem, Prefs, Transport,
} from "./types.ts";
import { ITEM_TYPES } from "./types.ts";
import { isHHMM, toHHMM, toMin } from "./time.ts";

export interface PlanInput {
  concert: ConcertView;
  parent: ParentProfile;
  prefs: Prefs;
  transport: Transport;
  seat: string;
  places: Place[];
}

export const ENTER_BEFORE_MIN = 40;
export const GOODS_WAIT_MIN = 70;
/** 1순위 팬덤 장소로 당일에 넣는 최대 거리(도보 기준 분). 넘으면 '하루 더' 카드 */
export const FAN_FIRST_MAX_MIN = 60;
const DEFAULT_SHOW_MIN = 150;

export function maxWalkFor(walk: ParentProfile["walk"]): number {
  return walk === "15-" ? 5 : walk === "15-30" ? 10 : 15;
}

export function honorificOf(p: ParentProfile): string {
  return p.honorific?.trim() || "부모님";
}

/** "B구역 12열" → gate_map["B"] */
export function gateForSeat(seat: string, gateMap: Record<string, string>): string | null {
  if (!seat || !gateMap) return null;
  const s = seat.replace(/\s/g, "").toUpperCase();
  const keys = Object.keys(gateMap).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const kk = k.replace(/\s/g, "").toUpperCase();
    if (kk && (s.startsWith(kk) || s.startsWith(kk.replace(/구역$/, "")))) return gateMap[k];
  }
  return null;
}

// ---------- 장소 고르기 ----------
function withinWalk(p: Place, max: number) {
  return p.walk_min_from_venue === null || p.walk_min_from_venue <= max;
}

function score(p: Place, prefer: string[]) {
  let s = 0;
  for (const t of prefer) if ((p.tags as string[]).includes(t)) s += 2;
  if (p.source === "verified") s += 1;
  if (p.walk_min_from_venue !== null) s += Math.max(0, 10 - p.walk_min_from_venue) / 10;
  return s;
}

// 카카오 등에서 온 식당은 "안 매운지" 알 수 없다. 메뉴 분류로 매운 집만 빼고 "확인 필요"로 표시한다.
const SPICY_RE = /마라|훠궈|짬뽕|매운|불닭|닭발|떡볶이|낙지|쭈꾸미|주꾸미|곱창|막창|양꼬치|탄탄|태국|베트남|멕시칸|인도|카레/;

export function isSpicyByName(p: Place): boolean {
  return SPICY_RE.test(`${p.name} ${p.category_detail ?? ""}`);
}

/** 안 매운 조건을 태그로 확인한 게 아니라 추정한 경우 */
export function mildUnverified(p: Place, parent: ParentProfile): boolean {
  return parent.food.includes("mild") && !(p.tags as string[]).includes("mild");
}

export function restaurantMatches(p: Place, parent: ParentProfile): boolean {
  if (p.category !== "restaurant") return false;
  const tags = p.tags as string[];
  if (parent.food.includes("korean") && !tags.includes("korean")) return false;
  if (parent.food.includes("mild") && !tags.includes("mild") && (isSpicyByName(p) || (!p.category_detail && p.origin !== "kakao"))) return false;
  if (!parent.food.includes("seafood") && tags.includes("seafood") && !tags.includes("korean")) return false;
  return true;
}

export function candidates(cat: PlaceCategory, input: PlanInput, extraPrefer: string[] = []): Place[] {
  const max = maxWalkFor(input.parent.walk);
  const prefer = [...extraPrefer];
  if (input.parent.elevator_first) prefer.push("elevator", "accessible");
  if (input.parent.rest_often) prefer.push("seating");
  if (input.parent.near_toilet) prefer.push("accessible");
  let list = input.places.filter((p) => p.category === cat && withinWalk(p, max));
  if (cat === "restaurant") {
    list = list.filter((p) => restaurantMatches(p, input.parent));
    if (input.parent.food.includes("quick")) prefer.push("quick");
    if (input.parent.food.includes("mild")) prefer.push("mild"); // 확인된 곳 우선
  }
  if (cat === "gate" && input.parent.elevator_first) {
    const ev = list.filter((p) => (p.tags as string[]).includes("elevator"));
    if (ev.length) list = ev;
  }
  return list.sort((a, b) => score(b, prefer) - score(a, prefer));
}

function walkOf(p: Place | undefined): number | null {
  return p?.walk_min_from_venue ?? null;
}

// ---------- 규칙 기반 생성 ----------
let seq = 0;
function nid() { seq += 1; return `i${seq}`; }

function item(partial: Omit<PlanItem, "id">): PlanItem {
  return { id: nid(), ...partial };
}

export function buildRulePlan(input: PlanInput): Plan {
  seq = 0;
  const { concert, parent, prefs, transport, seat } = input;
  const general = input.places.length === 0;
  const who = honorificOf(parent);
  const S = toMin(concert.start_time);
  const showEnd = concert.est_end_time && isHHMM(concert.est_end_time) ? toMin(concert.est_end_time) : S + DEFAULT_SHOW_MIN;
  const maxWalk = maxWalkFor(parent.walk);
  const gap = parent.walk === "30+" ? 10 : 15; // 장소 사이 이동·여유
  const items: PlanItem[] = [];
  const used = new Set<string>();
  const take = (list: Place[]) => list.find((p) => !used.has(p.id));

  // 도착 가능 시각(입력된 경우)
  let arriveAt: number | null = null;
  if (transport.mode === "train" && isHHMM(transport.train_arrive)) arriveAt = toMin(transport.train_arrive) + 30; // 역→공연장
  // 팬 모임 버스: 집결 시각만 알면 도착 시각은 모르므로 계획 기준으로 역산

  // 1) 입장
  const gatePlace = take(candidates("gate", input));
  if (gatePlace) used.add(gatePlace.id);
  const gateName = gateForSeat(seat, concert.gate_map) || gatePlace?.name || null;
  const enterStart = S - ENTER_BEFORE_MIN;
  const enter = item({
    start: toHHMM(enterStart), end: toHHMM(S), type: "enter",
    title: seat ? `입장 · ${seat}` : "공연장 입장",
    place_id: gatePlace?.id ?? null, walk_min: walkOf(gatePlace),
    parent_text: gateName
      ? `${gateName}로 들어가세요.${parent.elevator_first ? " 엘리베이터를 이용하세요." : ""} 티켓과 신분증을 꺼내 두세요.`
      : "입구는 공지가 나오면 업데이트돼요. 티켓과 신분증을 꺼내 두세요.",
    done_label: "자리에 앉았어요", kid_note: gateName ? `게이트: ${gateName}` : "게이트 공지 대기",
    source: gateName && gatePlace ? gatePlace.source : "needs_check",
  });
  const show = item({
    start: toHHMM(S), end: toHHMM(showEnd), type: "show", title: "공연 관람",
    place_id: null, walk_min: null,
    parent_text: "즐겁게 보세요! 끝나면 이 화면에서 귀가 안내를 보여 드려요.",
    done_label: "공연 다 봤어요", kid_note: "", source: "verified",
  });

  // 2) 역산: 입장 전 쉼터 → 굿즈/포토 → (최애 장소) → 점심 → 도착
  const before: PlanItem[] = [];
  let cursor = enterStart;

  const restLen = parent.rest_often || parent.walk !== "30+" ? 40 : 25;
  const restPlace = take(candidates("rest", input, ["indoor", "seating"])) ?? take(candidates("cafe", input, ["seating"]));
  if (restPlace) used.add(restPlace.id);
  before.unshift(item({
    start: toHHMM(cursor - restLen), end: toHHMM(cursor), type: "rest",
    title: restPlace ? `쉬기 · ${restPlace.name}` : "앉아서 쉬기",
    place_id: restPlace?.id ?? null, walk_min: walkOf(restPlace),
    parent_text: restPlace
      ? `${restPlace.description_ko || restPlace.name}에서 앉아 쉬세요. 화장실도 미리 다녀오세요.`
      : "입장 전에 앉아서 쉬세요. 화장실도 미리 다녀오세요.",
    done_label: "잘 쉬었어요", kid_note: restPlace ? "" : "쉼터 정보 확인 필요",
    source: restPlace?.source ?? "needs_check",
  }));
  cursor -= restLen + gap;

  const optional: PlanItem[] = [];
  if (prefs.goods) {
    const g = take(candidates("goods", input, ["indoor"]));
    if (g) used.add(g.id);
    const it = item({
      start: toHHMM(cursor - GOODS_WAIT_MIN), end: toHHMM(cursor), type: "goods",
      title: g ? `공식 굿즈 사기 · ${g.name}` : "공식 굿즈 사기",
      place_id: g?.id ?? null, walk_min: walkOf(g),
      parent_text: `${g?.description_ko || "굿즈 부스"}에서 줄을 서세요. 줄이 길면 건너뛰어도 돼요.`,
      done_label: "다 샀어요", kid_note: `대기 ${GOODS_WAIT_MIN}분 확보${g ? "" : " · MD 부스 위치 공지 대기"}`,
      source: g?.source ?? "needs_check", optional: true,
    });
    before.unshift(it); optional.push(it);
    cursor -= GOODS_WAIT_MIN + gap;
  }
  if (prefs.photo) {
    const ph = take(candidates("photo", input));
    if (ph) used.add(ph.id);
    if (ph || general) {
      const it = item({
        start: toHHMM(cursor - 20), end: toHHMM(cursor), type: "photo",
        title: ph ? `포토존 · ${ph.name}` : "포토존 사진 찍기",
        place_id: ph?.id ?? null, walk_min: walkOf(ph),
        parent_text: `${ph?.description_ko || "공연장 포토존"}에서 사진 찍으세요. 줄이 길면 건너뛰어도 돼요.`,
        done_label: "사진 찍었어요", kid_note: "", source: ph?.source ?? "needs_check", optional: true,
      });
      before.unshift(it); optional.push(it);
      cursor -= 20 + gap;
    }
  }
  // 가수가 다녀간 곳: "꼭 가고 싶어요"(fan_first)면 1순위 — 최대 2곳, 걷기 기준을 넘으면 택시, 시간이 모자라도 마지막에 뺀다.
  // "시간 나면"이면 걸어갈 수 있는 1곳만, 시간이 모자라면 먼저 뺀다.
  const fanPool = prefs.artist_places
    ? input.places
        .filter((p) => p.fan_type !== "none" && !["restaurant", "goods", "photo"].includes(p.category) && !used.has(p.id) && p.walk_min_from_venue !== null)
        .filter((p) => p.walk_min_from_venue! <= (prefs.fan_first ? FAN_FIRST_MAX_MIN : maxWalk))
        .sort((a, b) => (a.fan_type === "artist_visited" ? 0 : 1) - (b.fan_type === "artist_visited" ? 0 : 1) || a.walk_min_from_venue! - b.walk_min_from_venue!)
    : [];
  const fanItems: PlanItem[] = [];
  for (const f of fanPool.slice(0, prefs.fan_first ? 2 : 1)) {
    used.add(f.id);
    const taxi = f.walk_min_from_venue! > maxWalk;
    const len = taxi ? 45 : prefs.fan_first ? 30 : 20;
    const it = item({
      start: toHHMM(cursor - len), end: toHHMM(cursor), type: "photo",
      title: `최애 장소 · ${f.name}`, place_id: f.id, walk_min: walkOf(f),
      parent_text: taxi
        ? `${f.description_ko || f.name}. 공연장에서 걸어서 ${f.walk_min_from_venue}분이라 택시를 타세요. 사진 남기고 공연장으로 돌아오세요.`
        : `${f.description_ko || f.name}. 들러서 사진 한 장 남기세요.`,
      done_label: "다녀왔어요", kid_note: `팬덤 장소${prefs.fan_first ? " · 1순위" : ""}${taxi ? " · 택시 왕복" : ""}`,
      source: f.source, optional: !prefs.fan_first,
    });
    before.unshift(it);
    fanItems.push(it);
    cursor -= len + gap;
  }
  // 시간이 모자랄 때 빼는 순서: optional 배열의 뒤에서부터. fan_first면 팬덤 장소를 맨 앞(마지막에 뺌)
  if (prefs.fan_first) optional.unshift(...fanItems); else optional.push(...fanItems);

  // 점심(또는 이른 저녁): 붐비기 전
  const mealLen = parent.food.includes("quick") ? 40 : 55;
  let mealEnd = cursor;
  // 붐비는 12:00~13:00을 피한다: 식사 시작이 11:50~12:50 사이면 11:30 시작으로 당긴다
  const mealStartRaw = mealEnd - mealLen;
  let mealStart = mealStartRaw;
  if (mealStartRaw > 11 * 60 + 50 && mealStartRaw < 12 * 60 + 50 && arriveAt === null) {
    mealStart = 11 * 60 + 30; mealEnd = mealStart + mealLen;
  }
  const r = take(candidates("restaurant", input));
  if (r) used.add(r.id);
  const foodNote = [
    parent.food.includes("korean") && "한식", parent.food.includes("mild") && "안 매운 메뉴",
    parent.food.includes("seafood") && "해산물 가능", parent.food.includes("quick") && "빨리 드시는 편", parent.food_other,
  ].filter(Boolean).join("·");
  const mealWord = mealStart >= 16 * 60 ? "이른 저녁" : "점심";
  before.unshift(item({
    start: toHHMM(mealStart), end: toHHMM(mealEnd), type: "meal",
    title: r ? `${mealWord} · ${r.name}` : `${mealWord} 식사`,
    place_id: r?.id ?? null, walk_min: walkOf(r),
    parent_text: r
      ? `${r.description_ko || r.name}. 붐비기 전에 드세요.`
      : general ? "공연장 근처에서 붐비기 전에 드세요." : "근처 식당 정보를 확인하고 있어요. 붐비기 전에 드세요.",
    done_label: "다 먹었어요", kid_note: [foodNote, r && mildUnverified(r, parent) ? "안 매운 메뉴 확인 필요" : ""].filter(Boolean).join(" · "), source: r?.source ?? "needs_check",
  }));

  // 도착
  const arriveStart = mealStart - gap;
  const busStop = take(candidates("bus_stop", input));
  if (busStop) used.add(busStop.id);
  const arriveText =
    transport.mode === "fan_bus" ? `${transport.drop_point || busStop?.name || "공연장"}에서 내리세요.`
    : transport.mode === "train" ? `${transport.train_to || "도착역"}에서 공연장으로 오세요.${maxWalk <= 10 ? " 걷기 힘드시면 택시를 타세요." : ""}`
    : transport.mode === "shuttle" ? "공연 셔틀에서 내리세요."
    : "공연장 근처에 도착하세요. 주차장이 붐빌 수 있어요.";
  before.unshift(item({
    start: toHHMM(arriveStart), end: toHHMM(arriveStart + 10), type: "arrive",
    title: transport.mode === "fan_bus" ? "버스 하차" : "공연장 도착",
    place_id: transport.mode === "fan_bus" ? busStop?.id ?? null : null, walk_min: null,
    parent_text: arriveText, done_label: "도착했어요",
    kid_note: transport.mode === "fan_bus" && transport.meet_time ? `집결 ${transport.meet_place} ${transport.meet_time}` : "",
    source: "user_input",
  }));

  // 규칙 6: 도착 시각이 늦으면 취향 항목을 줄인다
  if (arriveAt !== null) {
    const firstStart = toMin(before[0].start);
    let short = arriveAt - firstStart;
    for (const o of [...optional].reverse()) {
      if (short <= 0) break;
      const i = before.indexOf(o);
      if (i >= 0) { before.splice(i, 1); short -= toMin(o.end) - toMin(o.start) + gap; }
    }
    // 도착 이후로 앞에서부터 다시 배치하고, 넘치면 쉼터 → 식사 순서로 줄인다
    const place = () => {
      let c = Math.max(arriveAt! - 10, toMin(before[0].start));
      for (const it of before) {
        const len = toMin(it.end) - toMin(it.start);
        if (toMin(it.start) < c) { it.start = toHHMM(c); it.end = toHHMM(c + len); }
        c = toMin(it.end) + (it.type === "arrive" ? 0 : gap);
      }
      return toMin(before[before.length - 1].end) - enterStart; // 넘친 분
    };
    let over = place();
    const rest = before.find((x) => x.type === "rest");
    if (over > 0 && rest) {
      const len = toMin(rest.end) - toMin(rest.start);
      const cut = Math.min(over, len - 15);
      if (cut > 0) { rest.end = toHHMM(toMin(rest.end) - cut); over = place(); }
    }
    const meal = before.find((x) => x.type === "meal");
    if (over > 0 && meal) {
      const len = toMin(meal.end) - toMin(meal.start);
      const cut = Math.min(over, len - 30);
      if (cut > 0) { meal.end = toHHMM(toMin(meal.end) - cut); meal.parent_text += " 시간이 빠듯하니 간단히 드세요."; over = place(); }
    }
    if (over > 0 && rest) { before.splice(before.indexOf(rest), 1); over = place(); }
    if (over > 0 && meal) { meal.end = toHHMM(Math.max(toMin(meal.start) + 15, enterStart - 5)); place(); }
    // 마지막 항목이 입장과 겹치지 않게 맞춘다
    const last = before[before.length - 1];
    if (toMin(last.end) > enterStart) last.end = toHHMM(enterStart);
  }

  items.push(...before, enter, show);

  // 귀가
  const ret = take(candidates("bus_stop", input)) ?? busStop;
  const retTime = transport.mode === "fan_bus" && isHHMM(transport.return_time) ? toMin(transport.return_time)
    : transport.mode === "train" && isHHMM(transport.train_return_depart) ? toMin(transport.train_return_depart) - 40
    : showEnd + 30;
  const retPlace = transport.mode === "fan_bus" ? transport.return_place || ret?.name || "" : transport.mode === "train" ? transport.train_to || transport.train_from : "";
  items.push(item({
    start: toHHMM(Math.max(retTime, showEnd + 10)), end: toHHMM(Math.max(retTime, showEnd + 10) + 20), type: "return",
    title: transport.mode === "fan_bus" ? "귀가 버스" : transport.mode === "train" ? "귀가 열차" : "귀가",
    place_id: transport.mode === "fan_bus" ? ret?.id ?? null : null, walk_min: walkOf(ret),
    parent_text: transport.mode === "fan_bus"
      ? `${retPlace || "버스 출발 장소"}에서 버스를 타세요.`
      : transport.mode === "train" ? `${retPlace || "역"}으로 가세요. 열차 ${transport.train_return_depart || ""} 출발이에요.`
      : "천천히 나오세요. 출구가 붐비면 잠시 기다렸다 나오셔도 돼요.",
    done_label: transport.mode === "fan_bus" ? "버스에 탔어요" : "출발했어요",
    kid_note: "", source: "user_input",
  }));

  // 규칙 8: 약 시간
  if (isHHMM(parent.medicine_time)) {
    const m = toMin(parent.medicine_time);
    const dayStart = toMin(items[0].start);
    const dayEnd = toMin(items[items.length - 1].end);
    if (m >= dayStart && m <= dayEnd) {
      items.push(item({
        start: toHHMM(m), end: toHHMM(m + 5), type: "medicine", title: "약 드실 시간",
        place_id: null, walk_min: null, parent_text: "물과 함께 약 드세요.",
        done_label: "약 먹었어요", kid_note: "", source: "user_input",
      }));
    }
  }

  // 규칙 7: 멀리 있는 팬덤 장소 → 하루 더
  const far = input.places.filter((p) => (p.fan_type !== "none" || (prefs.sightseeing && p.category === "sight")) && !used.has(p.id));
  const extra_day = far.length ? { title: "하루 더 머무신다면?", place_ids: far.slice(0, 4).map((p) => p.id) } : null;

  const sorted = items.sort((a, b) => toMin(a.start) - toMin(b.start) || ITEM_TYPES.indexOf(a.type) - ITEM_TYPES.indexOf(b.type));
  const summaryBits = [
    maxWalk <= 5 ? "여유로운 동선" : maxWalk <= 10 ? "적당히 걷는 동선" : "많이 걸어도 좋은 동선",
    prefs.goods && sorted.some((i) => i.type === "goods") ? "굿즈 시간 확보" : null,
    parent.elevator_first ? "엘리베이터 우선" : null,
    transport.companions === "friends" && transport.friends_count ? `친구 ${transport.friends_count}분 포함` : transport.companions === "fan_bus" ? "팬 모임 버스" : transport.companions === "family" ? "3대 가족 나들이" : null,
  ].filter(Boolean);
  return {
    title: `${who}의 〈${shortTitle(concert.title)}〉 ${concert.city || ""} 여행`.replace(/\s+여행$/, " 여행").replace(/\s{2,}/g, " "),
    summary: summaryBits.join(" · "),
    items: sorted,
    extra_day,
    general,
    generated_by: "rules",
  };
}

export function shortTitle(t: string): string {
  const m = /〈([^〉]+)〉/.exec(t);
  return m ? m[1] : t;
}

// ---------- 검증 (AI 출력용) ----------
export function validatePlan(plan: Plan, places: Place[]): { ok: true; plan: Plan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set(places.map((p) => p.id));
  if (!plan || !Array.isArray(plan.items) || plan.items.length === 0) return { ok: false, errors: ["items가 비어 있어요"] };
  const seen = new Set<string>();
  plan.items.forEach((it, i) => {
    if (!it.id || seen.has(it.id)) errors.push(`items[${i}].id 중복/누락`);
    seen.add(it.id);
    if (!isHHMM(it.start) || !isHHMM(it.end)) errors.push(`items[${i}] 시각 형식 오류`);
    if (!(ITEM_TYPES as readonly string[]).includes(it.type)) errors.push(`items[${i}].type 오류: ${it.type}`);
    if (it.place_id && !ids.has(it.place_id)) errors.push(`items[${i}].place_id가 장소 목록에 없음: ${it.place_id}`);
    if (!it.title) errors.push(`items[${i}].title 누락`);
  });
  if (plan.extra_day) {
    for (const pid of plan.extra_day.place_ids ?? []) if (!ids.has(pid)) errors.push(`extra_day.place_id가 목록에 없음: ${pid}`);
  }
  if (errors.length) return { ok: false, errors };
  const items = plan.items.map((it) => ({
    ...it,
    place_id: it.place_id || null,
    // 장소가 없으면 "확인 필요"
    source: it.place_id ? (places.find((p) => p.id === it.place_id)?.source ?? it.source) : it.type === "show" || it.type === "medicine" || it.type === "arrive" || it.type === "return" ? it.source : "needs_check",
  })) as PlanItem[];
  items.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { ok: true, plan: { ...plan, items, extra_day: plan.extra_day && plan.extra_day.place_ids?.length ? plan.extra_day : null } };
}

// ---------- 일정 바꾸기 (F11) ----------
export type ChangeReason = "leg_pain" | "long_line" | "late" | "free";

export interface ChangeResult {
  plan: Plan;
  message: string;
  changes: { before: string | null; after: string | null }[];
}

export function classifyReason(text: string): ChangeReason {
  if (/다리|무릎|아파|힘들|피곤|지쳐/.test(text)) return "leg_pain";
  if (/줄|대기|기다리|사람이 많/.test(text)) return "long_line";
  if (/늦|지각|막히|밀려/.test(text)) return "late";
  return "free";
}

export function label(it: PlanItem): string {
  return `${it.start} ${it.title}`;
}

const FIXED = new Set(["enter", "show", "return", "medicine"]);

/** 남은 항목만 다시 짠다. done: 완료한 item id 목록, nowMin: 현재 시각(분) */
export function rulesReplan(plan: Plan, input: PlanInput, reason: ChangeReason, nowMin: number, done: Set<string>): ChangeResult {
  const items = plan.items.map((i) => ({ ...i }));
  const remaining = items.filter((i) => !done.has(i.id) && toMin(i.end) > nowMin);
  const kept = items.filter((i) => !remaining.includes(i));
  const changes: ChangeResult["changes"] = [];
  const who = honorificOf(input.parent);
  const friends = input.transport.companions !== "alone";
  let message = "";
  const enter = remaining.find((i) => i.type === "enter");
  const enterStart = enter ? toMin(enter.start) : Infinity;
  const restPlace = candidates("rest", input, ["indoor", "seating"])[0] ?? candidates("cafe", input, ["seating"])[0];
  let out: PlanItem[] = [];
  let n = 0;
  const nid2 = () => `c${plan.items.length + ++n}`;

  if (reason === "leg_pain" || reason === "long_line") {
    // 지금부터 입장 전까지: 취향 항목(굿즈·포토)을 빼고 쉼터로
    const dropTypes = reason === "leg_pain" ? new Set(["goods", "photo", "extra"]) : new Set(["goods", "photo"]);
    const toDrop = remaining.filter((i) => dropTypes.has(i.type) && toMin(i.start) < enterStart);
    // 줄이 길어요: 지금 진행 중인 취향 항목 하나만 뺀다
    const target = reason === "long_line" ? toDrop.filter((i) => toMin(i.start) <= nowMin + 10).slice(0, 1) : toDrop;
    const drop = target.length ? target : reason === "long_line" ? toDrop.slice(0, 1) : [];
    out = remaining.filter((i) => !drop.includes(i));
    for (const d of drop) changes.push({ before: label(d), after: null });
    // 쉼터 시간 확보: 지금부터 다음 고정 항목/다음 남은 항목 전까지
    const nextAfter = out.filter((i) => toMin(i.start) > nowMin).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
    const restEnd = nextAfter ? toMin(nextAfter.start) : nowMin + 60;
    const len = Math.min(Math.max(restEnd - nowMin, 20), reason === "leg_pain" ? 60 : 45);
    const existingRest = out.find((i) => i.type === "rest" && toMin(i.start) <= nowMin + 15);
    if (!existingRest) {
      const r: PlanItem = {
        id: nid2(), start: toHHMM(nowMin), end: toHHMM(nowMin + len), type: "rest",
        title: restPlace ? `쉬기 · ${restPlace.name}` : "앉아서 쉬기",
        place_id: restPlace?.id ?? null, walk_min: restPlace?.walk_min_from_venue ?? null,
        parent_text: restPlace ? `${restPlace.description_ko || restPlace.name}에서 앉아 쉬세요.` : "가까운 곳에 앉아 쉬세요.",
        done_label: "잘 쉬었어요", kid_note: reason === "leg_pain" ? "다리 통증으로 휴식 추가" : "줄이 길어 휴식으로 변경",
        source: restPlace?.source ?? "needs_check",
      };
      out.push(r);
      changes.push({ before: null, after: `${r.start} ${r.title} (${len}분)` });
    }
    if (enter && input.parent.elevator_first === false && reason === "leg_pain") {
      const ev = candidates("gate", { ...input, parent: { ...input.parent, elevator_first: true } })[0];
      if (ev && ev.id !== enter.place_id && (ev.tags as string[]).includes("elevator")) {
        changes.push({ before: label(enter), after: `${enter.start} ${ev.name}(엘리베이터)로 입장` });
        enter.place_id = ev.id; enter.parent_text = `${ev.name}로 들어가서 엘리베이터를 타세요.`;
      }
    }
    const hadGoods = drop.some((d) => d.type === "goods");
    message = reason === "leg_pain"
      ? `${hadGoods && friends ? "굿즈 줄은 친구분께 부탁하시고, " : ""}${who}는 바로 쉼터로 가서 쉬세요.`
      : `${drop[0] ? `${drop[0].title.split(" · ")[0]}은 건너뛰고, ` : ""}앉아서 쉬다가 다음 일정으로 가세요.`;
  } else if (reason === "late") {
    const delay = 30;
    out = [];
    for (const it of remaining) {
      if (FIXED.has(it.type)) { out.push(it); continue; }
      const ns = toMin(it.start) + delay;
      const ne = toMin(it.end) + delay;
      if (ne > enterStart) {
        if (it.optional || it.type === "goods" || it.type === "photo" || it.type === "rest") {
          const shortened = enterStart - ns;
          if (it.type === "rest" && shortened >= 15) {
            out.push({ ...it, start: toHHMM(ns), end: toHHMM(enterStart) });
            changes.push({ before: label(it), after: `${toHHMM(ns)} ${it.title} (${shortened}분)` });
          } else changes.push({ before: label(it), after: null });
          continue;
        }
        const s2 = Math.min(ns, enterStart - 30);
        out.push({ ...it, start: toHHMM(s2), end: toHHMM(Math.min(ne, enterStart - 5)) });
        changes.push({ before: label(it), after: `${toHHMM(s2)} ${it.title}` });
        continue;
      }
      out.push({ ...it, start: toHHMM(ns), end: toHHMM(ne) });
      changes.push({ before: label(it), after: `${toHHMM(ns)} ${it.title}` });
    }
    message = "남은 일정을 30분씩 미뤘어요. 입장 시간은 그대로예요. 시간이 모자란 항목은 뺐어요.";
  } else {
    out = remaining;
    message = "말씀하신 내용은 바로 반영하기 어려워요. 일정은 그대로 두었어요. 물어보기에서 다시 말씀해 주세요.";
  }

  const newItems = [...kept, ...out].sort((a, b) => toMin(a.start) - toMin(b.start));
  return { plan: { ...plan, items: newItems }, message, changes };
}

// ---------- AI가 고를 칸별 후보 (코드가 조건을 거른 뒤 최대 4곳) ----------
export function fanCandidates(input: PlanInput): Place[] {
  const { prefs } = input;
  if (!prefs.artist_places) return [];
  const maxWalk = maxWalkFor(input.parent.walk);
  return input.places
    .filter((p) => p.fan_type !== "none" && !["restaurant", "goods", "photo"].includes(p.category) && p.walk_min_from_venue !== null)
    .filter((p) => p.walk_min_from_venue! <= (prefs.fan_first ? FAN_FIRST_MAX_MIN : maxWalk))
    .sort((a, b) => (a.fan_type === "artist_visited" ? 0 : 1) - (b.fan_type === "artist_visited" ? 0 : 1) || a.walk_min_from_venue! - b.walk_min_from_venue!);
}

export function slotCandidates(plan: Plan, input: PlanInput): Record<string, Place[]> {
  const out: Record<string, Place[]> = {};
  const byId = new Map(input.places.map((p) => [p.id, p]));
  for (const it of plan.items) {
    let list: Place[] = [];
    if (it.type === "meal") list = candidates("restaurant", input);
    else if (it.type === "rest") list = [...candidates("rest", input, ["indoor", "seating"]), ...candidates("cafe", input, ["seating"])];
    else if (it.type === "goods") list = candidates("goods", input, ["indoor"]);
    else if (it.type === "photo" && it.title.startsWith("최애 장소")) list = fanCandidates(input);
    else if (it.type === "photo") list = candidates("photo", input);
    else if (it.type === "enter") list = candidates("gate", input);
    else if ((it.type === "arrive" && input.transport.mode === "fan_bus") || (it.type === "return" && input.transport.mode === "fan_bus")) list = candidates("bus_stop", input);
    const cur = it.place_id ? byId.get(it.place_id) : undefined;
    const top = list.slice(0, 4);
    if (cur && !top.some((p) => p.id === cur.id)) top.unshift(cur);
    if (top.length) out[it.id] = top;
  }
  return out;
}

/** F17 "덜 걷게 바꾸기": 걷기 스타일 한 단계 여유롭게, 포토존·'시간 나면' 팬덤 장소 빼기 */
export function lessWalkInput(input: PlanInput): PlanInput {
  const walk: ParentProfile["walk"] = input.parent.walk === "30+" ? "15-30" : "15-";
  return {
    ...input,
    parent: { ...input.parent, walk, rest_often: true },
    prefs: { ...input.prefs, photo: false, artist_places: input.prefs.fan_first ? input.prefs.artist_places : false },
  };
}

