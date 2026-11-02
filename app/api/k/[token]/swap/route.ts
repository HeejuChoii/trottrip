// POST /api/k/{token}/swap — "다른 식당으로 바꾸기": 같은 조건의 장소 중 다음 후보로
import { updateTrip } from "@/lib/db";
import { candidates } from "@/lib/planner";
import { loadTrip } from "@/lib/trip";
import { bad, body, ok } from "@/lib/http";
import type { PlaceCategory } from "@/lib/types";

const TYPE_TO_CAT: Record<string, PlaceCategory> = { meal: "restaurant", rest: "rest", goods: "goods", photo: "photo" };

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) return bad("일정을 찾을 수 없어요", 404);
  const { item_id } = await body<{ item_id?: string }>(req);
  const plan = loaded.trip.plan;
  const it = plan.items.find((i) => i.id === item_id);
  if (!it || !TYPE_TO_CAT[it.type]) return bad("바꿀 수 없는 항목이에요");

  const used = new Set(plan.items.map((i) => i.place_id).filter(Boolean));
  const list = candidates(TYPE_TO_CAT[it.type], loaded.input);
  if (list.length < 2 && list[0]?.id === it.place_id) return bad("같은 조건의 다른 장소가 없어요");
  const idx = list.findIndex((p) => p.id === it.place_id);
  const next = [...list.slice(idx + 1), ...list.slice(0, Math.max(idx, 0))].find((p) => !used.has(p.id) || p.id === it.place_id);
  if (!next || next.id === it.place_id) return bad("같은 조건의 다른 장소가 없어요");

  const prefix = it.title.includes(" · ") ? it.title.split(" · ")[0] : it.title;
  const updated = {
    ...it,
    place_id: next.id,
    title: `${prefix} · ${next.name}`,
    walk_min: next.walk_min_from_venue,
    parent_text: `${next.description_ko || next.name}.${it.type === "meal" ? " 붐비기 전에 드세요." : ""}`,
    source: next.source,
  };
  const newPlan = { ...plan, items: plan.items.map((i) => (i.id === it.id ? updated : i)) };
  await updateTrip(loaded.trip.id, { plan: newPlan, plan_version: loaded.trip.plan_version + 1 });
  return ok({ plan: newPlan });
}
