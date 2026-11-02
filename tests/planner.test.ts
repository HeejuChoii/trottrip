import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRulePlan, gateForSeat, rulesReplan, validatePlan, type PlanInput } from "../lib/planner.ts";
import { normalizePlaces, parsePlacesUpload } from "../lib/concertrip.ts";
import { toMin, expiryFor } from "../lib/time.ts";
import { shareTitle, kidHonorific } from "../lib/text.ts";
import { SEED_CONCERTS } from "../lib/seed.ts";
import type { ConcertView } from "../lib/types.ts";

const { places } = parsePlacesUpload(readFileSync(new URL("../data/sample-places-coex.json", import.meta.url), "utf8"), "psj");
const concert: ConcertView = { ...SEED_CONCERTS[0], custom: false, gate_map: { B: "3번 입구" } };
const base: PlanInput = {
  concert,
  parent: { honorific: "엄마", age_band: "60s", walk: "15-30", rest_often: true, elevator_first: true, food: ["korean", "mild"], food_other: "", medicine_time: "13:00", friends_fitness: "same" },
  prefs: { goods: true, photo: true, artist_places: true, sightseeing: false },
  transport: { mode: "fan_bus", origin: "대구", companions: "friends", friends_count: 2, meet_place: "수성못", meet_time: "08:30", drop_point: "", return_time: "20:30", return_place: "동쪽 주차장", train_from: "", train_to: "", train_depart: "", train_arrive: "", train_return_depart: "", shuttle_info: "", stay: "day" },
  seat: "B구역 12열",
  places,
};

test("adapter normalizes sample", () => {
  assert.equal(places.length, 15);
  const r = normalizePlaces([{ place_id: "x", title: "화장실", type: "WC", latitude: "37.1", longitude: 127, tags: "실내,엘리베이터", verified: true }]);
  assert.equal(r.places[0].category, "toilet");
  assert.deepEqual(r.places[0].tags, ["indoor", "elevator"]);
  assert.equal(r.places[0].source, "verified");
  assert.equal(r.places[0].lat, 37.1);
});

test("rule plan follows rules", () => {
  const plan = buildRulePlan(base);
  const types = plan.items.map((i) => i.type);
  for (const t of ["arrive", "meal", "goods", "rest", "enter", "show", "return", "medicine"]) assert.ok(types.includes(t as never), t);
  const enter = plan.items.find((i) => i.type === "enter")!;
  assert.equal(toMin(enter.start), toMin("17:00") - 40);
  assert.ok(enter.parent_text.includes("3번 입구"));
  const meal = plan.items.find((i) => i.type === "meal")!;
  assert.equal(meal.place_id, "ex_coex_meal1"); // 한식+안매운+10분 이내
  const goods = plan.items.find((i) => i.type === "goods")!;
  assert.equal(toMin(goods.end) - toMin(goods.start), 70);
  // 멀리 있는 팬덤 장소는 하루 더 카드로
  assert.ok(plan.extra_day?.place_ids.includes("ex_coex_fan1"));
  for (const it of plan.items) assert.ok(!it.place_id || places.some((p) => p.id === it.place_id));
  assert.equal(validatePlan(plan, places).ok, true);
});

test("15분 이하 보행이면 5분 넘는 장소 제외", () => {
  const plan = buildRulePlan({ ...base, parent: { ...base.parent, walk: "15-" } });
  for (const it of plan.items) {
    const p = places.find((x) => x.id === it.place_id);
    if (p && p.walk_min_from_venue !== null) assert.ok(p.walk_min_from_venue <= 5, `${p.name}`);
  }
});

test("general plan when no places", () => {
  const plan = buildRulePlan({ ...base, places: [] });
  assert.equal(plan.general, true);
  assert.ok(plan.items.every((i) => i.place_id === null));
  assert.ok(plan.items.some((i) => i.type === "enter"));
});

test("late train arrival drops optional items", () => {
  const plan = buildRulePlan({ ...base, transport: { ...base.transport, mode: "train", train_arrive: "15:00", train_to: "삼성역" } });
  const first = plan.items.filter((i) => i.type !== "medicine")[0];
  assert.ok(toMin(first.start) >= toMin("15:20"));
  const enter = plan.items.find((i) => i.type === "enter")!;
  for (const it of plan.items) if (!["enter", "show", "return", "medicine"].includes(it.type)) assert.ok(toMin(it.end) <= toMin(enter.start), it.title);
});

test("validatePlan rejects unknown place", () => {
  const plan = buildRulePlan(base);
  plan.items[1].place_id = "nope";
  assert.equal(validatePlan(plan, places).ok, false);
});

test("replan leg pain replaces goods with rest", () => {
  const plan = buildRulePlan(base);
  const goods = plan.items.find((i) => i.type === "goods")!;
  const r = rulesReplan(plan, base, "leg_pain", toMin(goods.start) - 5, new Set());
  assert.ok(!r.plan.items.some((i) => i.type === "goods"));
  assert.ok(r.changes.some((c) => c.before?.includes("굿즈")));
  assert.ok(r.message.includes("친구분"));
  assert.ok(r.plan.items.some((i) => i.type === "enter"));
});

test("replan late keeps enter fixed", () => {
  const plan = buildRulePlan(base);
  const enter = plan.items.find((i) => i.type === "enter")!;
  const r = rulesReplan(plan, base, "late", toMin(plan.items[0].start), new Set());
  assert.equal(r.plan.items.find((i) => i.type === "enter")!.start, enter.start);
});

test("gate mapping & text helpers", () => {
  assert.equal(gateForSeat("B구역 12열", { A: "1번", B: "3번 입구" }), "3번 입구");
  assert.equal(gateForSeat("VIP석", { B: "3번" }), null);
  assert.equal(shareTitle("딸", "희주"), "희주(딸)이 보낸 공연 날 안내장");
  assert.equal(shareTitle("조카", ""), "조카가 보낸 공연 날 안내장");
  assert.equal(kidHonorific("딸"), "따님");
  assert.equal(expiryFor("2026-12-25"), "2026-12-26T14:59:00.000Z");
});
