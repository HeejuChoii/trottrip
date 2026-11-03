// PATCH /api/k/{token} — 자녀: 일정 편집(시간 조정·삭제) 저장, 공유 정보(호칭·이름·연락처) 저장
// GET  /api/k/{token} — 진행 상황 새로고침용
import { getTripBy, listChats, listEvents, updateTrip } from "@/lib/db";
import { ShareInfoSchema, TicketSchema } from "@/lib/schemas";
import { z } from "zod";
import { validatePlan } from "@/lib/planner";
import { loadTrip } from "@/lib/trip";
import { bad, body, ok } from "@/lib/http";
import type { Plan } from "@/lib/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded) return bad("일정을 찾을 수 없어요", 404);
  const b = await body<{ plan?: Plan; share?: unknown; ticket?: unknown; checklist?: unknown }>(req);
  const patch: Record<string, unknown> = {};

  if (b.share) {
    const s = ShareInfoSchema.safeParse(b.share);
    if (!s.success) return bad(s.error.issues[0]?.message ?? "입력을 확인해 주세요");
    Object.assign(patch, s.data);
    if (!s.data.kid_label) patch.kid_label = "딸";
  }
  if (b.plan) {
    // 자녀 편집은 기존 항목의 시각 변경·삭제만 허용
    const cur = loaded.trip.plan!;
    const byId = new Map(cur.items.map((i) => [i.id, i]));
    const items = (Array.isArray(b.plan.items) ? b.plan.items : [])
      .filter((i) => byId.has(i.id))
      .map((i) => ({ ...byId.get(i.id)!, start: String(i.start), end: String(i.end) }));
    const v = validatePlan({ ...cur, items }, loaded.places);
    if (!v.ok) return bad("시각 형식을 확인해 주세요 (예: 13:40)");
    patch.plan = v.plan;
    patch.plan_version = loaded.trip.plan_version + 1;
  }
  if (b.ticket) {
    const t = TicketSchema.safeParse(b.ticket);
    if (!t.success) return bad(t.error.issues[0]?.message ?? "티켓 정보를 확인해 주세요");
    patch.ticket = t.data;
  }
  if (b.checklist) {
    const c = z.record(z.string().max(40), z.boolean()).safeParse(b.checklist);
    if (!c.success || Object.keys(c.data).length > 50) return bad("체크리스트 형식 오류");
    patch.checklist = { ...(loaded.trip.checklist ?? {}), ...c.data };
  }
  if (!Object.keys(patch).length) return bad("바꿀 내용이 없어요");
  const t = await updateTrip(loaded.trip.id, patch);
  return ok({ plan: t.plan, kid_label: t.kid_label, kid_name: t.kid_name, kid_phone: t.kid_phone, ticket: t.ticket, checklist: t.checklist });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await getTripBy("kid_token", token);
  if (!trip) return bad("일정을 찾을 수 없어요", 404);
  const [events, chats] = await Promise.all([listEvents(trip.id), listChats(trip.id)]);
  return ok({ plan: trip.plan, events, chats });
}
