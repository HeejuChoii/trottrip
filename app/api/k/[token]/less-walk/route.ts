// POST /api/k/{token}/less-walk — F17 "덜 걷게 바꾸기": 걷기 스타일 한 단계 여유롭게, 포토존·'시간 나면' 팬덤 장소 빼고, 멀면 택시
import { addEvent, updateTrip } from "@/lib/db";
import { estimateSteps } from "@/lib/steps";
import { generatePlan } from "@/lib/ai";
import { loadTrip } from "@/lib/trip";
import { bad, ok } from "@/lib/http";
import { lessWalkInput } from "@/lib/planner";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) return bad("일정을 찾을 수 없어요", 404);
  const input = lessWalkInput(loaded.input);
  const plan = await generatePlan(input, { lessWalk: true });
  // 프로필은 그대로 두고(자녀가 입력한 값), 일정만 바꾼다
  const before = estimateSteps(loaded.trip.plan, loaded.places, loaded.trip.parent_profile).steps;
  const after = estimateSteps(plan, loaded.places, loaded.trip.parent_profile).steps;
  const t = await updateTrip(loaded.trip.id, { plan, plan_version: loaded.trip.plan_version + 1 });
  await addEvent(loaded.trip.id, "less_walk", null, { before, after });
  return ok({ plan: t.plan });
}
