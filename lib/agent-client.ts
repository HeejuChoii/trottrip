// 물어보기 챗봇을 Render의 Croche 서버로 보낸다 (서버-서버 프록시, HMAC 서명).
// AGENT_URL/AGENT_SHARED_SECRET가 없으면 쓰지 않는다.
import "server-only";
import { createHmac, randomUUID } from "crypto";
import type { LoadedTrip } from "./trip.ts";
import { gateForSeat } from "./planner.ts";
import { kidHonorific } from "./text.ts";

export function agentEnabled() {
  return !!process.env.AGENT_URL && !!process.env.AGENT_SHARED_SECRET;
}

export interface AgentAnswer { text: string; needs_check: boolean; place_id: string | null }

export class AgentLimitError extends Error {}

export async function askAgent(loaded: LoadedTrip, q: string, now: string, done: Set<string>, infoDesk: string | null): Promise<AgentAnswer> {
  const { trip, concert, places } = loaded;
  const payload = {
    trip_id: trip.id,
    message_id: randomUUID(),
    q,
    now,
    parent_honorific: trip.parent_profile.honorific,
    kid_honorific: kidHonorific(trip.kid_label),
    kid_phone: trip.kid_phone,
    concert: { title: concert.title, venue: concert.venue_name, date: concert.date, start_time: concert.start_time, est_end_time: concert.est_end_time, notice: concert.notice_text },
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
  return { text: json.text, needs_check: !!json.needs_check, place_id: pid };
}
