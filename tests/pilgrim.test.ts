import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPilgrimPlan, courseSpots, getCourse, pilgrimView, openAt } from "../lib/pilgrim.ts";
import { whyFor, type PlanInput } from "../lib/planner.ts";
import { sourceName } from "../lib/text.ts";
import type { ParentProfile, Place, Transport } from "../lib/types.ts";

const parent: ParentProfile = { honorific: "어머니", age_band: "60s", walk: "15-30", steps_usual: 0, rest_often: false, near_toilet: false, elevator_first: false, food: ["korean", "mild"], food_other: "", medicine_time: "", friends_fitness: "same" };
const transport: Transport = { mode: "car", origin: "", companions: "friends", friends_count: 1, meet_place: "", meet_time: "", drop_point: "", return_time: "", return_place: "", train_from: "", train_to: "", train_depart: "", train_arrive: "", train_return_depart: "", shuttle_info: "", stay: "day" };

test("성지순례: 좌표가 있으면 가까운 순서·점심·택시 구간으로 짠다", () => {
  const c = getCourse("sgi-jindo")!;
  const view = pilgrimView(c, "2026-11-07", "10:00");
  // 시험용 좌표(진도 지산·읍·임회·의신)
  const ll: Record<string, [number, number]> = {
    fan_sgi_village: [34.431, 126.179], fan_sgi_kkwabaegi: [34.4312, 126.1795], fan_sgi_park: [34.418, 126.17],
    fan_sgi_okhyang: [34.4873, 126.2627], fan_sgi_sinhodeung: [34.486, 126.265], fan_sgi_unrim: [34.468, 126.302],
  };
  const places = courseSpots(c).map((p) => ({ ...p, lat: ll[p.id][0], lng: ll[p.id][1] }));
  const plan = buildPilgrimPlan({ view, parent, transport, places });
  assert.ok(plan.pilgrim);
  const meal = plan.items.find((i) => i.type === "meal")!;
  assert.ok(["fan_sgi_okhyang", "fan_sgi_sinhodeung"].includes(meal.place_id!), "가수 단골집에서 점심");
  assert.ok(meal.start >= "11:00" && meal.start <= "13:00", meal.start);
  assert.ok(plan.items.some((i) => /택시/.test(i.parent_text)), "먼 구간은 택시");
  assert.equal(plan.items.at(-1)!.type, "return");
});

test("영업시간·휴무일: 월요일 휴무 식당은 그날 닫힘", () => {
  assert.equal(openAt("fan_lcw_donggok", "2026-11-09", 12 * 60), false); // 월
  assert.equal(openAt("fan_lcw_donggok", "2026-11-07", 12 * 60), true); // 토
  assert.equal(openAt("fan_lcw_hoya", "2026-11-07", 12 * 60), false); // 저녁 영업
});

test("평점: 근처 같은 종류 식당 중 순위를 왜 여기?에 쓴다", () => {
  const mk = (id: string, rating: number): Place => ({ id, concert_ids: [], name: id, category: "restaurant", lat: 0, lng: 0, address: "", walk_min_from_venue: 3, tags: ["korean"], fan_type: "none", description_ko: "", evidence_urls: [], source: "needs_check", updated_at: "", concertrip_url: "", rating, rating_count: 50, rating_src: "카카오맵" });
  const places = [mk("a", 4.1), mk("b", 4.6), mk("c", 3.9)];
  const input = { parent, places, concert: {} as never, prefs: {} as never, transport, seat: "" } as PlanInput;
  const why = whyFor({ id: "i1", start: "11:30", end: "12:30", type: "meal", title: "점심", place_id: "b", walk_min: 3, parent_text: "", done_label: "", kid_note: "", source: "needs_check" }, places[1], input);
  assert.match(why, /근처 한식 3곳 중 평점 1위 · 카카오맵 평점 4\.6\(50\)/);
});

test("근거 링크 이름", () => {
  assert.equal(sourceName("https://www.youtube.com/watch?v=x"), "유튜브");
  assert.equal(sourceName("https://m.blog.naver.com/a/1"), "네이버 블로그");
  assert.equal(sourceName("https://www.starnewskorea.com/a"), "스타뉴스");
});

test("자녀 메모에 영어 필드명·URL이 보이지 않게", async () => {
  const { cleanNote } = await import("../lib/text.ts");
  assert.equal(cleanNote("한식·mild 태그 있음. 정보 출처 확인 필요(needs_check)."), "한식·덜 매운. 정보 출처 확인 필요.");
  assert.equal(cleanNote("숙소 링크: https://place.map.kakao.com/1117108402 · 지하철이면 한성백제역이 덜 붐빔"), "지하철이면 한성백제역이 덜 붐빔");
  assert.equal(cleanNote("near_toilet 조건에 맞는 쉼터"), "화장실 가까이 조건에 맞는 쉼터");
});

test("1박 둘째 날: 먼 팬덤 장소는 빼고 역 근처 취향 맞는 곳(전시)을 넣는다", async () => {
  const { buildDayTwo } = await import("../lib/legs.ts");
  const { sightsNear } = await import("../lib/sights.ts");
  const seoulSt = { lat: 37.5547, lng: 126.9707 };
  const farFan = { ...sightsNear(seoulSt, 5)[0], id: "fan_far", name: "먼 팬덤 장소", fan_type: "artist_visited" as const, lat: 35.87, lng: 128.6 };
  let n = 0;
  const items = buildDayTwo({
    transport: { ...transport, mode: "train", train_to: "서울", train_return_depart: "15:40", stay: "overnight", stay_name: "숙소" },
    parent: { ...parent, likes: ["전시"] }, places: [], used: new Set(), spots: [farFan], sights: sightsNear(seoulSt, 30),
    base: { name: "숙소", lat: 37.6688, lng: 126.7451 }, stationLL: seoulSt, stayName: "숙소", stayUrl: null,
  }, () => `d${++n}`);
  const titles = items.map((i) => i.title);
  assert.ok(!titles.some((t) => t.includes("먼 팬덤 장소")), "먼 팬덤 장소는 빠짐");
  assert.ok(titles.some((t) => /둘러보기 · (국립중앙박물관|서울시립미술관)/.test(t)), titles.join(" / "));
  assert.equal(items.at(-1)!.type, "return");
  assert.ok(items.every((i) => i.day === 2));
});
