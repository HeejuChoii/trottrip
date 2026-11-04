// POST /api/events — 부모님/자녀 화면의 행동 기록 (완료, 열람, 공유, 결제 의향, 시작)
import { addEvent, getTripBy } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";
import type { EventType } from "@/lib/types";

const PARENT_TYPES: EventType[] = ["parent_open", "done", "boarded", "feedback"];
const KID_TYPES: EventType[] = ["share_kakao", "share_email", "share_copy", "intent", "survey"];

export async function POST(req: Request) {
  const b = await body<{ type?: EventType; token?: string; item_id?: string; payload?: Record<string, unknown> }>(req);
  const type = b.type;
  const payload = b.payload && typeof b.payload === "object" ? JSON.parse(JSON.stringify(b.payload).slice(0, 2000)) : {};

  if (type === "start") {
    // 일정 생성을 시작한 자녀(가입 자녀 지표). 트립이 아직 없으므로 trip_id 없이 기록
    await addEvent(null, "start", null, { cid: String(payload.cid ?? "").slice(0, 64), src: String(payload.src ?? "").slice(0, 40) });
    return ok({ ok: true });
  }
  if (!type || !b.token) return bad("잘못된 요청");
  if (PARENT_TYPES.includes(type)) {
    const trip = await getTripBy("parent_token", b.token);
    if (!trip) return bad("링크를 찾을 수 없어요", 404);
    await addEvent(trip.id, type, b.item_id ? String(b.item_id).slice(0, 40) : null, payload);
    return ok({ ok: true });
  }
  if (KID_TYPES.includes(type)) {
    const trip = await getTripBy("kid_token", b.token);
    if (!trip) return bad("링크를 찾을 수 없어요", 404);
    await addEvent(trip.id, type, null, payload);
    return ok({ ok: true });
  }
  return bad("잘못된 요청");
}
