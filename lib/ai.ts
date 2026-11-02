// Claude API: 일정 생성(F5), 남은 일정 재생성(F11), 물어보기 챗봇(F10).
// 구조화 출력(zod) + 서버 검증. 키가 없거나 실패하면 규칙 기반으로 대신한다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatRow, Place, Plan, PlanItem } from "./types.ts";
import { ITEM_TYPES } from "./types.ts";
import {
  buildRulePlan, classifyReason, ENTER_BEFORE_MIN, GOODS_WAIT_MIN, gateForSeat, honorificOf, label,
  maxWalkFor, rulesReplan, validatePlan, type ChangeReason, type ChangeResult, type PlanInput,
} from "./planner.ts";
import { toHHMM, toMin } from "./time.ts";
import { CATEGORY_LABEL } from "./concertrip.ts";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export function aiEnabled() { return !!process.env.ANTHROPIC_API_KEY; }

let client: Anthropic | null = null;
function claude() {
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

// ---------- 스키마 ----------
const ItemSchema = z.object({
  id: z.string(),
  start: z.string().describe("HH:MM 24시간"),
  end: z.string().describe("HH:MM 24시간"),
  type: z.enum(ITEM_TYPES),
  title: z.string(),
  place_id: z.string().nullable().describe("반드시 PLACES의 id 중 하나. 맞는 장소가 없으면 null"),
  walk_min: z.number().nullable(),
  parent_text: z.string().describe("부모님께 보여 줄 한두 문장. 쉬운 존댓말"),
  done_label: z.string().describe("완료 버튼 문구. 예: 다 먹었어요"),
  kid_note: z.string(),
  source: z.enum(["verified", "needs_check", "user_input"]),
  optional: z.boolean(),
});
const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  items: z.array(ItemSchema),
  extra_day: z.object({ title: z.string(), place_ids: z.array(z.string()) }).nullable(),
});
const ReplanSchema = z.object({
  message: z.string().describe("'이렇게 바꿨어요' 카드에 보여 줄 한두 문장"),
  items: z.array(ItemSchema).describe("지금 이후 남은 일정 전체(바뀐 것과 그대로인 것 모두)"),
});
const ChatSchema = z.object({
  answer: z.string().describe("2~3문장, 쉬운 존댓말"),
  needs_check: z.boolean().describe("근거 자료로 답할 수 없으면 true"),
  place_id: z.string().nullable().describe("답에 나온 장소의 PLACES id. 없으면 null"),
});

function placesForPrompt(places: Place[]) {
  return places.map((p) => ({
    id: p.id, name: p.name, category: p.category, walk_min_from_venue: p.walk_min_from_venue,
    tags: p.tags, fan_type: p.fan_type, description: p.description_ko, source: p.source,
    ...(p.category_detail ? { category_detail: p.category_detail } : {}),
  }));
}

function contextBlock(input: PlanInput) {
  const { concert, parent, prefs, transport, seat } = input;
  return JSON.stringify({
    concert: {
      title: concert.title, venue: concert.venue_name, city: concert.city, date: concert.date,
      start_time: concert.start_time, est_end_time: concert.est_end_time, notice: concert.notice_text,
      seat, gate_for_seat: gateForSeat(seat, concert.gate_map),
    },
    parent: { ...parent, max_walk_between_places_min: maxWalkFor(parent.walk) },
    prefs, transport,
  });
}

const PLAN_RULES = `규칙
1. 공연 시작 시각에서 거꾸로 계산한다: 입장(시작 ${ENTER_BEFORE_MIN}분 전) → 쉼터 → 굿즈(선택 시 대기 ${GOODS_WAIT_MIN}분) → 점심(붐비기 전) → 도착. 입장(enter)과 공연(show), 귀가(return) 항목은 반드시 넣는다.
2. 장소는 PLACES의 id로만 고른다. 맞는 장소가 없으면 place_id는 null, source는 "needs_check"로 두고 parent_text에 "확인이 필요해요"를 쓴다. 장소 이름을 지어내지 않는다.
3. 걷는 시간: parent.walk가 "15-30"이면 장소 간 도보 10분 이내 우선, 넘으면 택시 제안. "15-"이면 5분 이내.
4. elevator_first면 elevator 태그가 있는 입구·동선을 고른다.
5. 식사 조건(parent.food)과 tags가 맞는 식당만 고른다. korean 조건이면 tags에 korean이 있어야 한다.
   "안 매운 음식"(mild) 조건: tags에 mild가 있으면 우선. 없으면 category_detail과 이름이 매운 메뉴(마라, 짬뽕, 떡볶이, 낙지, 곱창 등)가 아닌 곳만 고르고, kid_note에 "안 매운 메뉴 확인 필요"를 쓴다.
6. 시간이 모자라면 취향 항목(굿즈·포토)을 줄이고 parent_text에 "줄이 길면 건너뛰어도 돼요"를 쓴다. 취향 항목은 optional=true.
7. 팬덤 장소(fan_type≠none):
   - prefs.fan_first=true(꼭 가고 싶어요)면 1순위다. 도보 ${60}분 이내 팬덤 장소를 최대 2곳, 굿즈·포토존보다 먼저 시간을 배정한다. 도보 기준을 넘으면 parent_text에 택시를 타라고 쓴다. 시간이 모자라면 굿즈·포토존부터 줄이고 팬덤 장소는 마지막까지 지킨다(optional=false).
   - prefs.artist_places만 true면 걸어갈 수 있는 1곳만 시간 나면 들르는 항목(optional=true)으로 넣는다.
   - 당일에 넣지 못한 팬덤 장소는 extra_day.place_ids에 넣는다. 없으면 extra_day는 null.
8. parent.medicine_time이 있으면 그 시각에 type "medicine" 항목을 넣는다.
- 시각은 HH:MM 24시간. 항목 id는 i1, i2 … 순서.
- parent_text는 50~70대 부모님이 읽는 문장: 한두 문장, 쉬운 말, 존댓말, 어디서 몇 분인지.
- kid_note는 자녀가 보는 짧은 메모(조건·근거).
- title 예: "엄마의 〈공연명〉 부산 여행" — 부모님 호칭을 쓴다. summary는 "무리 없는 이동 · 굿즈 시간 확보 · 친구 2분 포함"처럼 3개 이하.`;

// ---------- F5 일정 생성 ----------
export async function generatePlan(input: PlanInput): Promise<Plan> {
  // 장소가 없는 공연(직접 입력 등)은 "일반 일정"
  if (input.places.length === 0 || !aiEnabled()) return buildRulePlan(input);

  const system = `너는 트로트 공연에 가시는 50~70대 부모님의 공연 날 하루 일정을 짜는 도우미다. 자녀가 입력한 정보와 PLACES(콘서트립 장소 목록) 안에서만 일정을 만든다.\n\n${PLAN_RULES}`;
  const user = `INPUT\n${contextBlock(input)}\n\nPLACES\n${JSON.stringify(placesForPrompt(input.places))}\n\n위 규칙대로 공연 날 일정을 JSON으로 만들어 줘.`;

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await claude().beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
        system,
        messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\n이전 출력이 검증에 실패했어: ${lastErr}\n고쳐서 다시 만들어 줘.` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) { lastErr = `stop_reason=${res.stop_reason}`; continue; }
      const v = validatePlan({ ...res.parsed_output, generated_by: "ai" } as Plan, input.places);
      if (v.ok) return v.plan;
      lastErr = v.errors.slice(0, 5).join("; ");
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  console.warn("[ai] generatePlan 실패, 규칙 기반으로 대신함:", lastErr);
  return buildRulePlan(input);
}

// ---------- F11 남은 일정 재생성 ----------
const REASON_KO: Record<ChangeReason, string> = {
  leg_pain: "다리가 아파요", long_line: "줄이 너무 길어요", late: "조금 늦어질 것 같아요", free: "",
};

export async function replan(
  plan: Plan, input: PlanInput, reason: ChangeReason, freeText: string, nowMin: number, done: Set<string>,
): Promise<ChangeResult> {
  const r = reason === "free" ? classifyReason(freeText) : reason;
  if (!aiEnabled()) return rulesReplan(plan, input, r, nowMin, done);

  const remaining = plan.items.filter((i) => !done.has(i.id) && toMin(i.end) > nowMin);
  const kept = plan.items.filter((i) => !remaining.includes(i));
  try {
    const res = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ReplanSchema) },
      system: `너는 공연장에 계신 부모님의 남은 일정을 바꿔 드리는 도우미다. 지금 이후의 남은 항목만 다시 짠다. 입장(enter)·공연(show) 시각은 바꾸지 않는다. 귀가(return)는 시각을 유지한다.\n\n${PLAN_RULES}`,
      messages: [{
        role: "user",
        content: `INPUT\n${contextBlock(input)}\n\nPLACES\n${JSON.stringify(placesForPrompt(input.places))}\n\n지금 시각: ${toHHMM(nowMin)}\n남은 일정: ${JSON.stringify(remaining)}\n부모님 말씀: "${REASON_KO[reason] || freeText}"\n\n남은 일정을 바꿔 줘. 새 항목 id는 c로 시작해.`,
      }],
    });
    if (res.stop_reason !== "refusal" && res.parsed_output) {
      const merged: Plan = { ...plan, items: [...kept, ...(res.parsed_output.items as PlanItem[])] };
      const v = validatePlan(merged, input.places);
      const keptIds = new Set(kept.map((k) => k.id));
      const dupWithKept = res.parsed_output.items.some((i) => keptIds.has(i.id));
      const enterOk = !remaining.some((i) => i.type === "enter") || res.parsed_output.items.some((i) => i.type === "enter");
      if (v.ok && !dupWithKept && enterOk) {
        return { plan: v.plan, message: res.parsed_output.message, changes: diffItems(remaining, res.parsed_output.items as PlanItem[]) };
      }
    }
  } catch (e) {
    console.warn("[ai] replan 실패:", e instanceof Error ? e.message : e);
  }
  return rulesReplan(plan, input, r, nowMin, done);
}

export function diffItems(before: PlanItem[], after: PlanItem[]): ChangeResult["changes"] {
  const out: ChangeResult["changes"] = [];
  const afterById = new Map(after.map((a) => [a.id, a]));
  for (const b of before) {
    const a = afterById.get(b.id);
    if (!a) out.push({ before: label(b), after: null });
    else if (a.start !== b.start || a.title !== b.title || a.place_id !== b.place_id) out.push({ before: label(b), after: label(a) });
  }
  const beforeIds = new Set(before.map((b) => b.id));
  for (const a of after) if (!beforeIds.has(a.id)) out.push({ before: null, after: label(a) });
  return out;
}

// ---------- F10 물어보기 ----------
export const EMERGENCY_RE = /아파|아프|쓰러|숨이|숨을|어지러|가슴|119|구급/;
const EMERGENCY_STRONG_RE = /쓰러|숨이|숨을|어지러|가슴|119|구급/;

export function isEmergency(q: string): boolean {
  // "다리가 아파요"처럼 일정 변경용 표현도 있으므로 아파/아프는 단독일 때도 안내는 먼저 보여 준다(PRD F10)
  return EMERGENCY_RE.test(q);
}
export function isStrongEmergency(q: string) { return EMERGENCY_STRONG_RE.test(q); }

export interface ChatContext {
  input: PlanInput;
  plan: Plan;
  kidHonorific: string;
  kidPhone: string;
  infoDeskName: string | null;
  nowMin: number;
  history: ChatRow[];
  /** 부모님이 완료한 항목 id */
  done?: Set<string>;
}

export interface ChatAnswer { answer: string; needs_check: boolean; place_id: string | null }

export function unknownAnswer(ctx: ChatContext): string {
  const desk = ctx.infoDeskName ? `${ctx.infoDeskName}에` : "가까운 안내소나 안전요원에게";
  const phone = ctx.kidPhone ? ` ${ctx.kidHonorific} 번호는 ${ctx.kidPhone}이에요.` : "";
  return `확인이 필요해요. ${desk} 물어보세요.${phone}`;
}

export async function answerQuestion(q: string, ctx: ChatContext): Promise<ChatAnswer> {
  if (!aiEnabled()) return rulesAnswer(q, ctx);
  const { input, plan } = ctx;
  try {
    const res = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ChatSchema) },
      system: `너는 공연장에 혼자 오신 50~70대 부모님의 질문에 답하는 안내 도우미다.
- 근거는 아래 SCHEDULE, CONCERT, PLACES뿐이다. 거기에 없는 사실(사인회, 시간표, 메뉴, 가격 등)은 지어내지 않는다.
- 근거로 답할 수 없으면 needs_check=true로 하고 answer는 정확히 다음 문장으로 한다: "${unknownAnswer(ctx)}"
- 답은 2~3문장, 쉬운 존댓말. 어디서 몇 분 걸리는지 말한다. 장소를 말했다면 place_id를 채운다.
- 몸이 아프다는 말이 있으면 첫 문장은 "119에 전화하시고 가까운 안전요원에게 알리세요."로 한다.
- 지금 시각: ${toHHMM(ctx.nowMin)}

CONCERT
${contextBlock(input)}

SCHEDULE
${JSON.stringify(plan.items.map((i) => ({ ...i, done: !!ctx.done?.has(i.id) })))}

PLACES
${JSON.stringify(placesForPrompt(input.places))}`,
      messages: [
        ...ctx.history.slice(-6).map((h) => ({ role: h.role === "parent" ? ("user" as const) : ("assistant" as const), content: h.text })),
        { role: "user", content: q },
      ],
    });
    if (res.stop_reason !== "refusal" && res.parsed_output) {
      const o = res.parsed_output;
      const pid = o.place_id && input.places.some((p) => p.id === o.place_id) ? o.place_id : null;
      return { answer: o.needs_check ? unknownAnswer(ctx) : o.answer, needs_check: o.needs_check, place_id: pid };
    }
  } catch (e) {
    console.warn("[ai] chat 실패:", e instanceof Error ? e.message : e);
  }
  return rulesAnswer(q, ctx);
}

/** 키 없이도 동작하는 규칙 기반 답변 */
export function rulesAnswer(q: string, ctx: ChatContext): ChatAnswer {
  const { input, plan } = ctx;
  const near = (cat: Place["category"]) =>
    input.places.filter((p) => p.category === cat).sort((a, b) => (a.walk_min_from_venue ?? 99) - (b.walk_min_from_venue ?? 99))[0];
  const placeAns = (p: Place | undefined, what: string): ChatAnswer =>
    p
      ? { answer: `${what}은 ${p.name}에 있어요.${p.description_ko ? ` ${p.description_ko}.` : ""}${p.walk_min_from_venue != null ? ` 공연장에서 걸어서 ${p.walk_min_from_venue}분이에요.` : ""}`.replace(/\.\./g, "."), needs_check: false, place_id: p.id }
      : { answer: unknownAnswer(ctx), needs_check: true, place_id: null };

  if (/화장실/.test(q)) return placeAns(near("toilet"), "화장실");
  if (/엘리베이터|승강기/.test(q)) return placeAns(near("elevator"), "엘리베이터");
  if (/쉴|쉼터|앉/.test(q)) return placeAns(near("rest") ?? near("cafe"), "쉴 곳");
  if (/보관|짐/.test(q)) return placeAns(near("locker"), "물품 보관");
  if (/굿즈|MD/i.test(q)) return placeAns(near("goods"), "굿즈 부스");
  if (/안내소/.test(q)) return placeAns(near("info_desk"), "안내소");
  if (/입구|게이트|들어가/.test(q)) {
    const gate = gateForSeat(input.seat, input.concert.gate_map);
    const enter = plan.items.find((i) => i.type === "enter");
    const gp = enter?.place_id ? input.places.find((p) => p.id === enter.place_id) : undefined;
    if (gate || gp) return { answer: `${input.seat ? `${input.seat}은 ` : ""}${gate || gp!.name}로 들어가세요. 입장은 ${enter?.start ?? input.concert.start_time}부터예요.`, needs_check: false, place_id: gp?.id ?? null };
    return { answer: "입구는 공지가 나오면 업데이트돼요. " + unknownAnswer(ctx), needs_check: true, place_id: null };
  }
  if (/버스|귀가|집에|몇 시에 출발|차/.test(q)) {
    const ret = plan.items.find((i) => i.type === "return");
    if (ret) return { answer: `${ret.title}는 ${ret.start}이에요. ${ret.parent_text}`, needs_check: false, place_id: ret.place_id };
  }
  if (/공연.*(언제|몇 시)|몇 시.*공연|시작/.test(q)) {
    return { answer: `공연은 ${input.concert.start_time}에 시작해요. 입장은 ${toHHMM(toMin(input.concert.start_time) - ENTER_BEFORE_MIN)}부터 하시면 돼요.`, needs_check: false, place_id: null };
  }
  if (/밥|식당|점심|저녁|먹/.test(q)) {
    const meal = plan.items.find((i) => i.type === "meal");
    if (meal?.place_id) {
      const p = input.places.find((x) => x.id === meal.place_id);
      return { answer: `${meal.start}에 ${p?.name ?? meal.title}에서 드시면 돼요. ${meal.parent_text}`, needs_check: false, place_id: meal.place_id };
    }
  }
  if (/지금|뭐 해|다음|어디 가|남았|뭐 하/.test(q)) {
    const next = plan.items.find((i) => !ctx.done?.has(i.id) && toMin(i.end) > ctx.nowMin);
    if (next) return { answer: `지금은 ${next.title} 시간이에요. ${next.parent_text}`, needs_check: false, place_id: next.place_id };
  }
  return { answer: unknownAnswer(ctx), needs_check: true, place_id: null };
}

export function categoryWord(p: Place) { return CATEGORY_LABEL[p.category]; }
export { honorificOf };
