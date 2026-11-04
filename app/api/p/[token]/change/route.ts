// POST /api/p/{token}/change — 부모님 "일정 바꾸기" (F11): 남은 항목만 다시 짠다
import { addEvent, listEvents, updateTrip } from "@/lib/db";
import { replan } from "@/lib/ai";
import { isExpired, loadTrip } from "@/lib/trip";
import { nowKST, toMin, isHHMM } from "@/lib/time";
import { bad, body, ok } from "@/lib/http";
import { annotateWhy, type ChangeReason } from "@/lib/planner";

export const maxDuration = 60;
const REASONS: ChangeReason[] = ["leg_pain", "long_line", "late", "free"];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("parent_token", token);
  if (!loaded?.trip.plan || isExpired(loaded.trip)) return bad("안내장을 찾을 수 없어요", 404);
  const b = await body<{ reason?: ChangeReason; text?: string; now?: string }>(req);
  const reason = REASONS.includes(b.reason as ChangeReason) ? (b.reason as ChangeReason) : "free";
  const text = String(b.text ?? "").slice(0, 300);
  if (reason === "free" && !text.trim()) return bad("어떤 일이 있으신지 말씀해 주세요");

  // 데모용 시각 덮어쓰기(?now=HH:MM)를 허용. 없으면 서버 KST
  const nowMin = b.now && isHHMM(b.now) ? toMin(b.now) : nowKST().min;
  const events = await listEvents(loaded.trip.id);
  const done = new Set(events.filter((e) => e.type === "done" && e.item_id).map((e) => e.item_id!));

  const result = await replan(loaded.trip.plan, loaded.input, reason, text, nowMin, done);
  result.plan = annotateWhy(result.plan, loaded.input);
  if (result.changes.length) {
    await updateTrip(loaded.trip.id, { plan: result.plan, plan_version: loaded.trip.plan_version + 1 });
  }
  await addEvent(loaded.trip.id, "change", null, { reason, text, message: result.message, changes: result.changes });
  return ok(result);
}
