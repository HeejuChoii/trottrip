// F5 평가 세트: 대표 시나리오 10개를 고정해 두고, 일정이 규칙을 어기는지 자동 검사한다.
// - CLI: `npm run eval` (규칙 엔진, 키 없이)
// - /admin "평가 실행": 배포된 일정 생성(AI 포함)으로 같은 검사
import type { ConcertView, ParentProfile, Place, Plan, Prefs, Transport } from "./types.ts";
import { ENTER_BEFORE_MIN, maxWalkFor, restaurantMatches, type PlanInput } from "./planner.ts";
import { estimateSteps } from "./steps.ts";
import { isHHMM, toMin } from "./time.ts";

const P0: ParentProfile = {
  honorific: "어머니", age_band: "60s", walk: "15-30", steps_usual: 0, food: ["korean"], food_other: "",
  elevator_first: false, medicine_time: "", rest_often: false, near_toilet: false, friends_fitness: "same",
};
const PR0: Prefs = { goods: true, photo: true, artist_places: false, fan_first: false, sightseeing: false };
const T0: Transport = {
  mode: "fan_bus", origin: "대구", companions: "alone", friends_count: 0, meet_place: "수성못", meet_time: "08:30",
  drop_point: "공연장 앞", return_time: "20:30", return_place: "동쪽 주차장", train_from: "", train_to: "", train_depart: "",
  train_arrive: "", train_return_depart: "", shuttle_info: "", stay: "day",
};

export interface Scenario { id: string; name: string; parent: ParentProfile; prefs: Prefs; transport: Transport; seat: string; noPlaces?: boolean }

export const SCENARIOS: Scenario[] = [
  { id: "s1", name: "혼자 · 적당히 · 굿즈·포토", parent: P0, prefs: PR0, transport: T0, seat: "B구역 12열" },
  { id: "s2", name: "친구 2분 · 여유롭게 · 엘리베이터", parent: { ...P0, walk: "15-", elevator_first: true, rest_often: true }, prefs: PR0, transport: { ...T0, companions: "friends", friends_count: 2 }, seat: "B구역" },
  { id: "s3", name: "팬 모임 버스 · 많이 걸어도 좋아요 · 팬덤 1순위 · 굿즈 없음", parent: { ...P0, walk: "30+" }, prefs: { ...PR0, goods: false, artist_places: true, fan_first: true }, transport: { ...T0, companions: "fan_bus" }, seat: "A구역" },
  { id: "s4", name: "3대 가족 · 적당히 · 화장실 가까이 · 자가용", parent: { ...P0, near_toilet: true }, prefs: PR0, transport: { ...T0, mode: "car", companions: "family" }, seat: "C구역" },
  { id: "s5", name: "열차 · 여유롭게 · 늦게 도착(15:30)", parent: { ...P0, walk: "15-" }, prefs: PR0, transport: { ...T0, mode: "train", train_from: "동대구", train_to: "수서", train_arrive: "15:00", train_return_depart: "21:30" }, seat: "B구역" },
  { id: "s6", name: "혼자 · 많이 · 가수 다녀간 곳(시간 나면)", parent: { ...P0, walk: "30+", steps_usual: 15000 }, prefs: { ...PR0, artist_places: true }, transport: T0, seat: "" },
  { id: "s7", name: "친구 · 여유롭게 · 한식+덜 매운 · 약 13:00", parent: { ...P0, walk: "15-", food: ["korean", "mild"], medicine_time: "13:00" }, prefs: PR0, transport: { ...T0, companions: "friends", friends_count: 1 }, seat: "B구역" },
  { id: "s8", name: "셔틀 · 적당히 · 굿즈·포토 없음", parent: P0, prefs: { ...PR0, goods: false, photo: false }, transport: { ...T0, mode: "shuttle" }, seat: "" },
  { id: "s9", name: "팬 모임 버스 · 여유롭게 · 팬덤 1순위 + 굿즈", parent: { ...P0, walk: "15-", steps_usual: 5000 }, prefs: { ...PR0, artist_places: true, fan_first: true }, transport: { ...T0, companions: "fan_bus" }, seat: "B구역" },
  { id: "s10", name: "목록에 없는 공연(장소 없음) → 일반 일정", parent: P0, prefs: PR0, transport: T0, seat: "", noPlaces: true },
];

export interface CheckResult { scenario: string; name: string; pass: boolean; violations: string[]; steps: number; generated_by: string }

const FIXED = new Set(["enter", "show", "return", "medicine"]);

export function checkPlan(plan: Plan, input: PlanInput): string[] {
  const v: string[] = [];
  const ids = new Map(input.places.map((p) => [p.id, p]));
  const S = toMin(input.concert.start_time);
  const items = [...plan.items].sort((a, b) => toMin(a.start) - toMin(b.start));
  const maxWalk = maxWalkFor(input.parent.walk);
  for (const it of items) {
    if (!isHHMM(it.start) || !isHHMM(it.end)) v.push(`${it.id} 시각 형식 오류`);
    if (toMin(it.end) < toMin(it.start)) v.push(`${it.title}: 끝 시각이 시작보다 빠름`);
    if (it.place_id && !ids.has(it.place_id)) v.push(`목록 밖 장소: ${it.place_id}`);
    const p = it.place_id ? ids.get(it.place_id) : undefined;
    if (p && p.walk_min_from_venue != null && p.walk_min_from_venue > maxWalk && !["arrive", "return"].includes(it.type) && !/택시/.test(it.parent_text)) {
      v.push(`도보 한도 초과(택시 안내 없음): ${p.name} ${p.walk_min_from_venue}분 > ${maxWalk}분`);
    }
    if (it.type === "meal" && p && !restaurantMatches(p, input.parent)) v.push(`식사 조건 불일치: ${p.name}`);
  }
  const enter = items.find((i) => i.type === "enter");
  if (!enter) v.push("입장 항목 없음");
  else {
    if (toMin(enter.start) !== S - ENTER_BEFORE_MIN) v.push(`입장 시각이 시작 ${ENTER_BEFORE_MIN}분 전이 아님 (${enter.start})`);
    for (const it of items) if (!FIXED.has(it.type) && toMin(it.end) > toMin(enter.start)) v.push(`입장 시각 지남: ${it.title} ${it.end}`);
  }
  const show = items.find((i) => i.type === "show");
  const ret = items.find((i) => i.type === "return");
  if (!show) v.push("공연 항목 없음");
  if (!ret) v.push("귀가 항목 없음");
  if (show && ret && toMin(ret.start) < toMin(show.end)) v.push("귀가가 공연 끝나기 전");
  const flow = items.filter((i) => i.type !== "medicine");
  for (let i = 1; i < flow.length; i++) if (toMin(flow[i].start) < toMin(flow[i - 1].end)) v.push(`겹침: ${flow[i - 1].title} ↔ ${flow[i].title}`);
  if (input.parent.medicine_time && toMin(input.parent.medicine_time) >= toMin(items[0].start) && !items.some((i) => i.type === "medicine")) v.push("약 시간 항목 없음");
  if (input.parent.elevator_first && enter?.place_id) {
    const g = ids.get(enter.place_id);
    const evGateExists = input.places.some((p) => p.category === "gate" && (p.tags as string[]).includes("elevator"));
    if (g && evGateExists && !(g.tags as string[]).includes("elevator")) v.push("엘리베이터 우선인데 엘리베이터 없는 입구");
  }
  if (input.prefs.fan_first && input.places.some((p) => p.fan_type !== "none" && !["restaurant", "goods", "photo"].includes(p.category))) {
    const goodsKept = items.some((i) => i.type === "goods");
    const fanKept = items.some((i) => i.title.startsWith("최애 장소"));
    if (goodsKept && !fanKept) v.push("팬덤 1순위인데 굿즈만 남고 팬덤 장소가 빠짐");
  }
  if (input.places.length === 0 && items.some((i) => i.place_id)) v.push("장소 없는 공연인데 장소가 들어감");
  return v;
}

export async function runEval(
  concert: ConcertView,
  places: Place[],
  make: (input: PlanInput) => Promise<Plan> | Plan,
): Promise<{ results: CheckResult[]; passed: number; total: number; rate: number }> {
  const results: CheckResult[] = [];
  for (const sc of SCENARIOS) {
    const input: PlanInput = { concert: sc.noPlaces ? { ...concert, id: null, custom: true } : concert, parent: sc.parent, prefs: sc.prefs, transport: sc.transport, seat: sc.seat, places: sc.noPlaces ? [] : places };
    let violations: string[];
    let steps = 0;
    let by = "";
    try {
      const plan = await make(input);
      violations = checkPlan(plan, input);
      steps = estimateSteps(plan, input.places, input.parent).steps;
      by = plan.generated_by ?? "";
      // 일관성: 같은 입력이면 같은 일정
      const again = await make(input);
      if (JSON.stringify(again.items.map((i) => [i.start, i.end, i.type, i.place_id])) !== JSON.stringify(plan.items.map((i) => [i.start, i.end, i.type, i.place_id]))) violations.push("같은 입력인데 일정이 달라짐");
    } catch (e) {
      violations = [`생성 실패: ${e instanceof Error ? e.message : e}`];
    }
    results.push({ scenario: sc.id, name: sc.name, pass: violations.length === 0, violations, steps, generated_by: by });
  }
  const passed = results.filter((r) => r.pass).length;
  return { results, passed, total: results.length, rate: Math.round((passed / results.length) * 100) };
}

export function formatReport(r: Awaited<ReturnType<typeof runEval>>): string {
  const lines = [`평가 세트 통과율: ${r.passed}/${r.total} (${r.rate}%)`, ""];
  for (const x of r.results) {
    lines.push(`${x.pass ? "✅" : "❌"} ${x.scenario} ${x.name} · 예상 ${x.steps.toLocaleString("ko-KR")}보${x.generated_by ? ` · ${x.generated_by}` : ""}`);
    for (const v of x.violations) lines.push(`    - ${v}`);
  }
  return lines.join("\n");
}
