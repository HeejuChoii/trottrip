// 물어보기 챗봇을 Render의 Croche 서버로 보낸다 (서버-서버 프록시, HMAC 서명).
// AGENT_URL/AGENT_SHARED_SECRET가 없으면 쓰지 않는다.
import "server-only";
import { createHmac, randomUUID } from "crypto";
import type { LoadedTrip } from "./trip.ts";
import { gateForSeat } from "./planner.ts";
import { kidHonorific, tipsFor } from "./text.ts";

export function agentEnabled() {
  return !!process.env.AGENT_URL && !!process.env.AGENT_SHARED_SECRET;
}

export type ChatAction =
  | { type: "schedule"; item_id: string; label: string }
  | { type: "map"; place_id: string; label: string };

export interface AgentAnswer { text: string; needs_check: boolean; place_id: string | null; actions: ChatAction[] }

export class AgentLimitError extends Error {}

export async function askAgent(loaded: LoadedTrip, q: string, now: string, done: Set<string>, infoDesk: string | null): Promise<AgentAnswer> {
  const { trip, concert, places } = loaded;
  // 챗봇 서버 스키마는 그대로 두고, 공지 칸에 교통편·(교통편에 맞는) 공연장 꿀팁을 덧붙여 근거로 준다
  const t = trip.transport;
  const ride = t.mode === "train" ? `기차: ${t.train_from} ${t.train_depart} 출발 → ${t.train_to} ${t.train_arrive} 도착, 돌아오는 기차 ${t.train_to}에서 ${t.train_return_depart || "시각 미정"} 출발. 버스가 아니라 기차로 다녀오세요.`
    : t.mode === "fan_bus" ? `팬 모임 버스: 집결 ${t.meet_place} ${t.meet_time}, 귀가 버스 ${t.return_place} ${t.return_time}.`
    : t.mode === "shuttle" ? `공연 셔틀: ${t.shuttle_info}` : "자가용·택시로 이동.";
  const notice = [concert.notice_text, `교통편 — ${ride}`, ...tipsFor(concert.tips, t.mode).map((x) => `꿀팁 — ${x}`)].filter(Boolean).join("\n");
  const payload = {
    trip_id: trip.id,
    message_id: randomUUID(),
    q,
    now,
    parent_honorific: trip.parent_profile.honorific,
    kid_honorific: kidHonorific(trip.kid_label),
    kid_phone: trip.kid_phone,
    concert: { title: concert.title, venue: concert.venue_name, date: concert.date, start_time: concert.start_time, est_end_time: concert.est_end_time, notice },
    seat: trip.seat,
    gate: gateForSeat(trip.seat, concert.gate_map),
    info_desk: infoDesk,
    items: trip.plan!.items.map((i) => ({ id: i.id, start: i.start, end: i.end, type: i.type, title: i.title, place_id: i.place_id, parent_text: i.parent_text, done: done.has(i.id) })),
    places: places.map((p) => ({ id: p.id, name: p.name, category: p.category, walk_min: p.walk_min_from_venue, description: p.description_ko, tags: p.tags, fan_type: p.fan_type })),
  };
  const body = JSON.stringify(payload);
  const ts = String(Date.now());
  const sig = createHmac("sha256", process.env.AGENT_SHARED_SECRET!).update(`${ts}.${body}`).digest("hex");
  const res = await fetch(`${process.env.AGENT_URL!.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-trottrip-timestamp": ts, "x-trottrip-signature": sig },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.AGENT_TIMEOUT_MS ?? 25000)),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<AgentAnswer> & { message?: string };
  if (res.status === 429) throw new AgentLimitError(json.message || "잠시 후 다시 물어봐 주세요.");
  if (!res.ok || typeof json.text !== "string" || !json.text) throw new Error(`agent ${res.status}`);
  const pid = json.place_id && places.some((p) => p.id === json.place_id) ? json.place_id : null;
  const itemIds = new Set(trip.plan!.items.map((i) => i.id));
  const placeIds = new Set(places.map((p) => p.id));
  // 버튼은 이 안내장에 실제로 있는 항목·장소만 통과
  const actions = (Array.isArray(json.actions) ? json.actions : []).filter((a): a is ChatAction =>
    !!a && typeof a.label === "string" &&
    ((a.type === "schedule" && itemIds.has(a.item_id)) || (a.type === "map" && placeIds.has(a.place_id)))).slice(0, 3);
  return { text: json.text, needs_check: !!json.needs_check, place_id: pid, actions };
}
