// 이동 구간 카드(기차·버스 탑승, 역 → 공연장/첫 장소)와 1박 둘째 날 일정.
// 코드가 시각·순서를 정한다(AI는 문장만 다듬음). 공연 날·팬덤 스팟 여행이 같이 쓴다.
import type { Place, PlanItem, Transport, ParentProfile } from "./types.ts";
import { isHHMM, toHHMM, toMin } from "./time.ts";
import { restaurantMatches } from "./planner.ts";

type LL = { lat: number; lng: number };

export function kmBetween(a: LL, b: LL): number {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 역 → 목적지: 택시 분, 대중교통 분(근사). 도로는 직선의 1.3배, 시내 택시 22km/h·지하철 버스는 그보다 1.5배 + 갈아타기 10분 */
export function cityLeg(a: LL, b: LL): { taxi: number; transit: number; km: number } {
  const d = kmBetween(a, b) * 1.3;
  const taxi = Math.max(8, Math.round(5 + (d / 22) * 60));
  return { taxi, transit: Math.round(taxi * 1.5 + 10), km: d };
}

export function routeLink(from: { name: string } & LL, to: { name: string } & LL): string {
  return `https://map.kakao.com/link/by/traffic/${encodeURIComponent(from.name)},${from.lat},${from.lng}/${encodeURIComponent(to.name)},${to.lat},${to.lng}`;
}

const stationName = (s: string) => (/역$/.test(s.trim()) ? s.trim() : `${s.trim()}역`);

/** 가는 길 탑승 카드: 기차(출발→도착) 또는 팬 모임 버스(집결) */
export function rideOut(t: Transport, nid: () => string): PlanItem[] {
  if (t.mode === "train" && isHHMM(t.train_depart)) {
    const end = isHHMM(t.train_arrive) ? t.train_arrive : toHHMM(toMin(t.train_depart) + 120);
    const dur = toMin(end) - toMin(t.train_depart);
    return [{
      id: nid(), start: t.train_depart, end, type: "arrive", title: `🚄 열차 · ${stationName(t.train_from || "출발역")} → ${stationName(t.train_to || "도착역")}`,
      place_id: null, walk_min: null,
      parent_text: `${stationName(t.train_from || "출발역")}에서 ${t.train_depart} 열차를 타세요. ${stationName(t.train_to || "도착역")}에 ${end} 도착해요${dur > 0 ? `(약 ${Math.floor(dur / 60) ? `${Math.floor(dur / 60)}시간 ` : ""}${dur % 60 ? `${dur % 60}분` : ""})` : ""}.`,
      done_label: "열차 탔어요", kid_note: "열차", source: "user_input",
    }];
  }
  if (t.mode === "fan_bus" && isHHMM(t.meet_time)) {
    return [{
      id: nid(), start: t.meet_time, end: toHHMM(toMin(t.meet_time) + 15), type: "arrive", title: `🚌 버스 탑승 · ${t.meet_place || "집결 장소"}`,
      place_id: null, walk_min: null,
      parent_text: `${t.meet_place || "집결 장소"}에서 ${t.meet_time}까지 모여 팬 모임 버스를 타세요.`,
      done_label: "버스 탔어요", kid_note: "팬 모임 버스", source: "user_input",
    }];
  }
  return [];
}

/** 역 → 목적지 이동 문장·링크. 역 좌표가 없으면 길찾기 링크만 */
export function stationLegText(t: Transport, dest: { name: string; lat: number | null; lng: number | null }, stationLL?: LL | null): { text: string; note: string; min: number; link?: { label: string; url: string } } {
  const st = stationName(t.train_to || "도착역");
  if (stationLL && dest.lat != null && dest.lng != null) {
    const lg = cityLeg(stationLL, { lat: dest.lat, lng: dest.lng });
    return {
      text: `${st}에서 ${dest.name}까지 택시로 약 ${lg.taxi}분, 지하철·버스로 약 ${lg.transit}분이에요.`,
      note: `${st} → 택시 약 ${lg.taxi}분 · 대중교통 약 ${lg.transit}분`, min: lg.taxi + 10,
      link: { label: "🚇 역에서 가는 길 (카카오맵)", url: routeLink({ name: st, ...stationLL }, { name: dest.name, lat: dest.lat, lng: dest.lng }) },
    };
  }
  return {
    text: `${st}에서 ${dest.name}까지 택시나 지하철로 오세요.`, note: `${st} → 이동 시간 확인 필요`, min: 40,
    ...(dest.lat != null && dest.lng != null ? { link: { label: "🚇 가는 길 (카카오맵)", url: `https://map.kakao.com/link/to/${encodeURIComponent(dest.name)},${dest.lat},${dest.lng}` } } : {}),
  };
}

export interface DayTwoInput {
  transport: Transport;
  parent: ParentProfile;
  places: Place[];
  used: Set<string>;
  /** 둘째 날 들를 곳 후보(팬덤 장소 등) — 가까운 순서로 넣는다 */
  spots: Place[];
  /** 숙소 근처 기준 좌표(없으면 공연장/코스 출발점) */
  base: { name: string; lat: number | null; lng: number | null };
  stationLL?: LL | null;
  stayName: string;
  stayUrl: string | null;
}

/** 1박 둘째 날: 체크아웃 → (팬덤 장소) → 점심 → 역으로 이동 → 귀가 열차 (자가용이면 집으로) */
export function buildDayTwo(o: DayTwoInput, nid: () => string): PlanItem[] {
  const t = o.transport;
  const out: PlanItem[] = [];
  const add = (it: Omit<PlanItem, "id" | "day">) => out.push({ id: nid(), day: 2, ...it });
  // 귀가 시각: 열차는 입력한 돌아오는 열차(둘째 날), 버스는 귀가 시각, 자가용은 14:00 출발
  const ret = t.mode === "train" && isHHMM(t.train_return_depart) ? toMin(t.train_return_depart)
    : t.mode === "fan_bus" && isHHMM(t.return_time) ? toMin(t.return_time) : 14 * 60;
  // 숙소(또는 공연장) 근처 → 역
  const st0 = stationName(t.train_to || "역");
  const toStation = t.mode !== "train" ? null
    : o.stationLL && o.base.lat != null && o.base.lng != null
      ? (() => {
          const lg = cityLeg({ lat: o.base.lat!, lng: o.base.lng! }, o.stationLL!);
          return { text: `${st0}까지 택시로 약 ${lg.taxi}분, 지하철·버스로 약 ${lg.transit}분이에요. 열차 20분 전에는 도착하세요.`, note: `→ ${st0} 택시 약 ${lg.taxi}분 · 대중교통 약 ${lg.transit}분`, min: lg.taxi + 10,
            link: { label: "🚇 역 가는 길 (카카오맵)", url: routeLink({ name: o.base.name, lat: o.base.lat!, lng: o.base.lng! }, { name: st0, ...o.stationLL! }) } };
        })()
      : { text: `${st0}까지 택시나 지하철로 가세요. 열차 20분 전에는 도착하세요.`, note: `→ ${st0} 이동 시간 확인 필요`, min: 50, link: undefined as { label: string; url: string } | undefined };
  const moveMin = toStation ? toStation.min : 0;
  const leaveBy = ret - (t.mode === "train" ? moveMin + 20 : 0); // 역에 20분 전 도착
  let c = 10 * 60;
  add({ start: toHHMM(c), end: toHHMM(c + 30), type: "extra", title: `체크아웃 · ${o.stayName}`, place_id: null, walk_min: null,
    parent_text: "짐 챙겨서 체크아웃하세요. 짐이 무거우면 숙소에 맡겨 두고 다녀오셔도 돼요.", done_label: "체크아웃했어요", kid_note: "둘째 날", source: "user_input",
    ...(o.stayUrl ? { link: { label: "🧭 숙소 위치 (카카오맵)", url: o.stayUrl } } : {}) });
  c += 45;
  // 점심 전·후로 팬덤 장소 1~2곳(시간이 되면)
  const lunchLen = o.parent.food.includes("quick") ? 45 : 60;
  const spots = o.spots.filter((p) => !o.used.has(p.id) && p.lat != null).slice(0, 2);
  for (const p of spots) {
    if (c + 40 + lunchLen + 30 > leaveBy) break;
    o.used.add(p.id);
    add({ start: toHHMM(c), end: toHHMM(c + 40), type: "photo", title: `최애 장소 · ${p.name}`, place_id: p.id, walk_min: null,
      parent_text: `${p.description_ko || p.name}. 들러서 사진 한 장 남기세요.`, done_label: "다녀왔어요", kid_note: "둘째 날 · 팬덤 장소", source: p.source });
    c += 55;
  }
  if (c + lunchLen <= leaveBy) {
    const r = o.places.find((p) => p.category === "restaurant" && !o.used.has(p.id) && restaurantMatches(p, o.parent));
    if (r) o.used.add(r.id);
    const start = Math.max(c, 11 * 60 + 30);
    if (start + lunchLen <= leaveBy) {
      add({ start: toHHMM(start), end: toHHMM(start + lunchLen), type: "meal", title: r ? `점심 · ${r.name}` : "점심 식사", place_id: r?.id ?? null, walk_min: r?.walk_min_from_venue ?? null,
        parent_text: r ? `${r.description_ko || r.name}. 붐비기 전에 드세요.` : "숙소나 역 근처에서 드시고 출발하세요.", done_label: "다 먹었어요", kid_note: "둘째 날", source: r?.source ?? "needs_check" });
      c = start + lunchLen + 10;
    }
  }
  if (t.mode === "train") {
    const st = stationName(t.train_to || "역");
    const s = Math.max(c, leaveBy);
    add({ start: toHHMM(s), end: toHHMM(s + moveMin), type: "extra", title: `🚕 ${st}으로 이동`, place_id: null, walk_min: null,
      parent_text: toStation!.text, done_label: "역에 왔어요", kid_note: toStation!.note, source: "user_input",
      ...(toStation!.link ? { link: toStation!.link } : {}) });
    add({ start: toHHMM(ret - 15), end: toHHMM(ret), type: "return", title: `귀가 열차 · ${st} ${toHHMM(ret)}`, place_id: null, walk_min: null,
      parent_text: `${st}에서 ${toHHMM(ret)} 열차를 타세요. 승차권을 꺼내 두세요.`, done_label: "열차 탔어요", kid_note: "둘째 날", source: "user_input" });
  } else {
    add({ start: toHHMM(Math.max(c, ret)), end: toHHMM(Math.max(c, ret) + 20), type: "return", title: t.mode === "fan_bus" ? "귀가 버스" : "집으로 출발", place_id: null, walk_min: null,
      parent_text: t.mode === "fan_bus" ? `${t.return_place || "버스 타는 곳"}에서 버스를 타세요.` : "오늘 일정 끝! 조심히 들어가세요.", done_label: "출발했어요", kid_note: "둘째 날", source: "user_input" });
  }
  return out;
}
