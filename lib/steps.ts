// F17 예상 걸음 수·서 있는 시간. 숫자는 코드로만 계산한다(AI가 만들지 않음).
import type { ParentProfile, Place, Plan } from "./types.ts";
import { toMin } from "./time.ts";

export const STEPS_PER_MIN = 100; // 걷는 1분 ≈ 100보
const IN_VENUE_WALK_MIN = 20; // 공연장 안·주변 이동(자리 찾기, 화장실, 퇴장 인파 등)
const ENTER_QUEUE_MIN = 20; // 입장 줄

/** 걷기 스타일로 평소 걸음 수 추정 (입력이 없을 때) */
export function usualSteps(p: Pick<ParentProfile, "steps_usual" | "walk">): { steps: number; guessed: boolean } {
  if (p.steps_usual > 0) return { steps: p.steps_usual, guessed: false };
  return { steps: p.walk === "30+" ? 10000 : p.walk === "15-30" ? 7000 : 5000, guessed: true };
}

export interface StepEstimate {
  steps: number; // 100보 단위 반올림
  walk_min: number;
  stand_min: number;
  usual: number;
  usual_guessed: boolean;
  compare: "more" | "similar" | "less";
  compare_text: string; // "평소보다 조금 많아요"
  line: string; // "오늘 예상 약 7,800보 · 서 있는 시간 약 1시간 10분 · 평소보다 조금 많아요"
}

export function fmtMin(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}시간${r ? ` ${r}분` : ""}` : `${r}분`;
}

export function estimateSteps(plan: Plan, places: Place[], parent: Pick<ParentProfile, "steps_usual" | "walk">): StepEstimate {
  const byId = new Map(places.map((p) => [p.id, p]));
  const items = [...plan.items].sort((a, b) => toMin(a.start) - toMin(b.start));
  // 공연장에서 떨어진 거리(도보 분)로 동선을 근사: 다른 장소로 옮길 때 두 거리의 합의 60%
  let prev = 0;
  let walk = IN_VENUE_WALK_MIN;
  let stand = 0;
  if (plan.pilgrim) {
    // 성지순례: 구간 도보 시간(택시 구간은 타고 내리는 몇 분) + 장소 안에서 둘러보기
    walk = 0;
    for (const it of items) {
      if (it.type === "medicine") continue;
      walk += it.walk_min ?? (/택시|차로/.test(it.parent_text) ? 3 : 0);
      if (it.type === "photo") { walk += 10; stand += 10; }
    }
  } else
  for (const it of items) {
    if (it.type === "show" || it.type === "medicine") continue;
    const taxi = /택시/.test(it.parent_text);
    const p = it.place_id ? byId.get(it.place_id) : undefined;
    const d = taxi ? 0 : (p?.walk_min_from_venue ?? it.walk_min ?? (it.type === "arrive" || it.type === "return" ? 5 : 0));
    walk += taxi ? 4 : Math.round((prev + d) * 0.6);
    prev = d;
    const len = Math.max(0, toMin(it.end) - toMin(it.start));
    if (it.type === "goods") stand += len;
    if (it.type === "photo" && !it.title.startsWith("최애 장소")) stand += Math.round(len / 2); // 포토존 줄
    if (it.type === "enter") stand += ENTER_QUEUE_MIN;
  }
  if (!plan.pilgrim) walk += Math.round(prev * 0.6); // 마지막 장소에서 돌아오기
  const steps = Math.round((walk * STEPS_PER_MIN) / 100) * 100;
  const u = usualSteps(parent);
  const ratio = steps / u.steps;
  const compare = ratio > 1.15 ? "more" : ratio < 0.8 ? "less" : "similar";
  const compare_text = compare === "more" ? (ratio > 1.6 ? "평소보다 많이 걸으세요" : "평소보다 조금 많아요") : compare === "less" ? "평소보다 적어요" : "평소와 비슷해요";
  return {
    steps, walk_min: walk, stand_min: stand, usual: u.steps, usual_guessed: u.guessed, compare, compare_text,
    line: `오늘 예상 약 ${steps.toLocaleString("ko-KR")}보 · 서 있는 시간 약 ${fmtMin(stand)} · ${compare_text}`,
  };
}
