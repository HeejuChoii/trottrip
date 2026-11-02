// 챗봇 도구가 실제로 하는 일(순수 함수). Croche와 무관하게 테스트할 수 있다.
import type { AgentItem, AgentPlace, ChatAction, ChatRequest } from "./protocol.ts";

export const CATEGORIES = [
  "restaurant", "cafe", "rest", "goods", "photo", "toilet", "elevator",
  "gate", "info_desk", "locker", "bus_stop", "sight",
] as const;

const KO: Record<string, string> = {
  restaurant: "식당", cafe: "카페", rest: "쉼터", goods: "굿즈 부스", photo: "포토존", toilet: "화장실",
  elevator: "엘리베이터", gate: "입구", info_desk: "안내소", locker: "물품 보관", bus_stop: "버스 승하차", sight: "관광지",
};

function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** 종류별로 가까운 곳 최대 limit개. 없으면 빈 배열(지어내지 않게) */
export function findPlaces(req: Pick<ChatRequest, "places">, category: string, limit = 2) {
  const found = req.places
    .filter((p) => p.category === category)
    .sort((a, b) => (a.walk_min ?? 99) - (b.walk_min ?? 99))
    .slice(0, Math.max(1, Math.min(limit, 3)))
    .map((p: AgentPlace) => ({
      id: p.id, name: p.name, kind: KO[p.category] ?? p.category,
      walk_min_from_venue: p.walk_min, how_to_get_there: p.description, tags: p.tags,
    }));
  return found.length
    ? { found }
    : { found: [], note: `이 공연의 ${KO[category] ?? category} 정보는 아직 없어요. 지어내지 말고 확인이 필요하다고 답하세요.` };
}

/** 지금 할 일과 남은 일정 */
export function schedule(req: Pick<ChatRequest, "items" | "now">) {
  const now = toMin(req.now);
  const remaining = req.items
    .filter((i: AgentItem) => !i.done && (isNaN(now) || toMin(i.end) > now || i.type === "return"))
    .map((i) => ({ id: i.id, start: i.start, end: i.end, title: i.title, what_to_do: i.parent_text, place_id: i.place_id }));
  return { now: req.now, current: remaining[0] ?? null, remaining };
}

/** 내 좌석과 입구, 입장 시각 */
export function gateInfo(req: Pick<ChatRequest, "seat" | "gate" | "items" | "concert">) {
  const enter = req.items.find((i) => i.type === "enter");
  return {
    seat: req.seat || null,
    gate: req.gate ?? null,
    enter_from: enter?.start ?? null,
    concert_start: req.concert.start_time,
    note: req.gate ? undefined : "입구는 아직 공지 전이에요. 공지가 나오면 업데이트돼요.",
  };
}

/** 답에서 마커(:unknown: 등)를 느슨하게 지운다. 공백·전각 콜론·대소문자 허용 */
export function stripMarkers(text: string): { text: string; markers: string[] } {
  const markers: string[] = [];
  const out = text.replace(/[:：]\s*([a-z_]+)\s*[:：]/gi, (_m, name: string) => { markers.push(name.toLowerCase()); return ""; });
  return { text: out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim(), markers };
}

/** 버튼 추가. 목록에 있는 id만, 같은 버튼은 한 번만, 최대 3개 */
export function addAction(actions: ChatAction[], req: Pick<ChatRequest, "items" | "places">, type: "schedule" | "map", id: string): { shown: boolean; reason?: string } {
  if (actions.length >= 3) return { shown: false, reason: "버튼은 3개까지예요" };
  if (type === "schedule") {
    const it = req.items.find((i) => i.id === id);
    if (!it) return { shown: false, reason: `일정에 없는 item-id예요: ${id}. venue schedule로 id를 확인하세요` };
    if (!actions.some((a) => a.type === "schedule" && a.item_id === id)) actions.push({ type: "schedule", item_id: id, label: `일정에서 보기 · ${it.title.split(" · ")[0]}` });
    return { shown: true };
  }
  const p = req.places.find((x) => x.id === id);
  if (!p) return { shown: false, reason: `장소 목록에 없는 place-id예요: ${id}. venue find로 id를 확인하세요` };
  if (!actions.some((a) => a.type === "map" && a.place_id === id)) actions.push({ type: "map", place_id: id, label: `지도에서 길찾기 · ${p.name}` });
  return { shown: true };
}
