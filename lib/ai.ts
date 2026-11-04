// Claude API: 일정 생성(F5), 남은 일정 재생성(F11), 물어보기 챗봇(F10).
// 구조화 출력(zod) + 서버 검증. 키가 없거나 실패하면 규칙 기반으로 대신한다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatRow, Place, Plan, PlanItem, TraceStep } from "./types.ts";
import { createHash } from "crypto";
import {
  buildRulePlan, classifyReason, ENTER_BEFORE_MIN, gateForSeat, honorificOf,
  maxWalkFor, rulesReplan, slotCandidates, validatePlan, annotateWhy, type ChangeReason, type ChangeResult, type PlanInput,
} from "./planner.ts";
import { getCachedPlan, setCachedPlan } from "./db.ts";
import { budgetLeft, recordUsage } from "./usage.ts";
import { toHHMM, toMin } from "./time.ts";
import { CATEGORY_LABEL } from "./concertrip.ts";
import { cleanNote, tipsFor } from "./text.ts";
import { buildPilgrimPlan, PILGRIM_REV } from "./pilgrim.ts";
import { geocode, kakaoConfigured } from "./kakao-local.ts";
import venueMock from "../data/venue-mock.json" with { type: "json" };

const MOCK_REV = (() => { const t = JSON.stringify(venueMock); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); })();

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export function aiEnabled() { return !!process.env.ANTHROPIC_API_KEY; }

let client: Anthropic | null = null;
function claude() {
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

// ---------- 모델·예산 ----------
// 일정 생성은 상위 모델 1회, 챗봇·분류는 작은 모델 (PRD 9장)
export const SMALL_MODEL = process.env.ANTHROPIC_SMALL_MODEL || "claude-haiku-5-5";

// ---------- 스키마 ----------
/** AI가 맡는 것: 각 칸(slot)의 장소 고르기 + 문장. 시각·순서·걸음 수는 코드가 정한다 */
const RefineSchema = z.object({
  title: z.string().describe("예: 엄마의 〈공연명〉 부산 여행 — 부모님 호칭 사용"),
  summary: z.string().describe("3개 이하, ' · '로 구분. 예: 무리 없는 이동 · 굿즈 시간 확보 · 친구 2분 포함"),
  items: z.array(z.object({
    id: z.string().describe("SKELETON의 id 그대로"),
    place_id: z.string().nullable().describe("그 칸의 candidates 중 하나의 id. candidates가 비었거나 맞는 곳이 없으면 null"),
    title: z.string().describe("'점심 · 장소이름'처럼 짧게"),
    parent_text: z.string().describe("부모님께 보여 줄 한두 문장. 쉬운 존댓말, 어디서 몇 분인지"),
    done_label: z.string().describe("완료 버튼 문구. 예: 다 먹었어요"),
    kid_note: z.string().describe("자녀가 볼 짧은 메모(조건·근거)"),
  })),
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
      start_time: concert.start_time, est_end_time: concert.est_end_time, notice: concert.notice_text, venue_tips: tipsFor(concert.tips, transport.mode),
      seat, gate_for_seat: gateForSeat(seat, concert.gate_map),
    },
    parent: { ...parent, max_walk_between_places_min: maxWalkFor(parent.walk) },
    prefs,
    // 숙소 링크 주소는 AI에 넘기지 않고(문장에 그대로 옮겨 적지 않게), 혼자·가족이면 친구 수를 0으로
    transport: { ...transport, stay_link: transport.stay_link ? "있음" : "", friends_count: transport.companions === "friends" ? transport.friends_count : 0 },
  });
}

const REFINE_RULES = `규칙
- 시각·순서·항목 종류는 이미 정해져 있다. 바꾸지 말고, 각 칸의 장소와 문장만 정한다.
- place_id는 그 칸의 candidates 안에서만 고른다. 장소 이름을 지어내지 않는다. 맞는 곳이 없으면 null로 두고 parent_text에 "확인이 필요해요"를 쓴다.
- 식당: 식사 조건(parent.food)에 맞는 곳. "덜 매운 음식"(mild) 조건인데 tags에 mild가 없으면 kid_note에 "덜 매운 메뉴 확인 필요"를 쓴다.
- elevator_first면 elevator 태그가 있는 입구·동선을 고른다. near_toilet이면 화장실이 가까운 쉼터를 고른다.
- 고른 장소의 walk_min_from_venue가 parent.max_walk_between_places_min보다 크면 parent_text에 택시를 타라고 쓴다.
- optional 칸(굿즈·포토존)의 parent_text에는 "줄이 길면 건너뛰어도 돼요"를 넣는다.
- kid_note·parent_text에는 영어 필드명(near_toilet 등)·태그 이름(mild 등)·URL을 쓰지 않는다. 한국어로만 쓴다.
- companions가 "friends"가 아니면 친구·일행 이야기를 쓰지 않는다.
- 문장은 50~70대 부모님이 읽는다: 한두 문장, 쉬운 말, 존댓말. 아프거나 약한 사람처럼 쓰지 않는다("편하게", "여유 있게" 같은 말 사용).`;

// ---------- F5 일정 생성 ----------
// 1) 규칙 엔진이 시각·순서·칸(slot)과 칸마다 후보 장소를 정한다(코드, 항상 같은 결과)
// 2) AI는 후보 중 하나를 고르고 문장만 쓴다(상위 모델 1회)
// 3) 같은 입력이면 캐시된 일정을 그대로 쓴다(입력 해시)
export function planHash(input: PlanInput, lessWalk = false): string {
  const { concert, parent, prefs, transport, seat, places } = input;
  const key = JSON.stringify({
    v: 3, lessWalk, data: concert.pilgrim ? PILGRIM_REV : MOCK_REV,
    concert: [concert.id, concert.title, concert.date, concert.start_time, concert.est_end_time, concert.gate_map],
    places: places.map((p) => `${p.id}:${p.updated_at}`).sort(),
    parent, prefs, transport, seat,
  });
  return createHash("sha256").update(key).digest("hex");
}

export async function generatePlan(input: PlanInput, opts: { lessWalk?: boolean } = {}): Promise<Plan> {
  const t0 = Date.now();
  const hash = planHash(input, opts.lessWalk);
  const cached = await getCachedPlan(hash).catch(() => null);
  if (cached) return cached;
  if (input.concert.pilgrim) return generatePilgrimPlan(input, hash, t0, !!opts.lessWalk);

  const skeleton = buildRulePlan(input);
  const cands = slotCandidates(skeleton, input);
  const slotCount = Object.keys(cands).length;
  const candTotal = new Set(Object.values(cands).flat().map((p) => p.id)).size;
  const t = input.transport;
  const trace: TraceStep[] = [
    { step: "① 입력 정리", detail: `${input.concert.start_time} 공연 · ${t.mode === "fan_bus" ? "팬 모임 버스" : t.mode === "train" ? "열차" : t.mode === "shuttle" ? "공연 셔틀" : "자가용·택시"} · 걷기 ${input.parent.walk === "30+" ? "많이" : input.parent.walk === "15-30" ? "적당히" : "여유롭게"} · 식사 ${input.parent.food.length ? input.parent.food.length + "가지 조건" : "상관없음"}` },
    { step: "② 시간 역산(코드)", detail: `입장 ${ENTER_BEFORE_MIN}분 전부터 거꾸로 ${skeleton.items.length}칸 배치` },
    { step: "③ 후보 거르기(코드)", detail: input.places.length ? `장소 ${input.places.length}곳 중 걷기·식성·엘리베이터 조건에 맞는 ${candTotal}곳을 ${slotCount}칸에 후보로` : "이 공연은 장소 정보가 없어 시각만 배치" },
  ];
  if (opts.lessWalk) skeleton.less_walk = true;
  let plan: Plan = skeleton;
  if (input.places.length === 0) {
    plan = skeleton; // 일반 일정
    trace.push({ step: "④ AI 조합", detail: "장소가 없어 건너뜀(일반 일정)" });
  } else if (!aiEnabled()) {
    trace.push({ step: "④ AI 조합", detail: "AI 키가 없어 규칙으로 후보 1순위 선택" });
  } else if (!(await budgetLeft()).ok) {
    plan = { ...skeleton, fallback_reason: "AI 사용량이 한도에 닿아 기본 규칙으로 만들었어요" };
    trace.push({ step: "④ AI 조합", detail: "예산 한도라 규칙으로 선택" });
  } else {
    const refined = await refineWithAI(skeleton, input);
    plan = refined ?? { ...skeleton, fallback_reason: "AI 응답이 늦어 기본 규칙으로 만들었어요" };
    trace.push({ step: "④ AI 조합", detail: refined ? `${MODEL}가 ${slotCount}칸의 후보 중 장소를 고르고 부모님용 문장 작성` : "AI 응답 실패 → 1회 재시도 후 규칙으로 선택" });
  }
  // AI 결과든 규칙이든 하루 중 겹치지 않게 한 번 더 확인
  const v = validatePlan(plan, input.places);
  if (!v.ok) plan = skeleton;
  trace.push({ step: "⑤ 검증(코드)", detail: v.ok ? "목록 밖 장소·시각 겹침·입장 시각 검사 통과" : "검증 실패 → 규칙 일정으로 대체" });
  trace.push({ step: "⑥ 완성", detail: `${((Date.now() - t0) / 1000).toFixed(1)}초 · 같은 입력이면 저장된 일정을 그대로 사용` });
  plan = annotateWhy({ ...plan, trace }, input);
  if (!plan.fallback_reason) await setCachedPlan(hash, plan).catch(() => undefined);
  return plan;
}

// ---------- 성지순례 여행 (공연 없음) ----------
// 동선(순서·시각·도보/택시)은 코드가 정하고, AI는 장소를 바꾸지 않고 부모님용 문장만 다듬는다.
async function generatePilgrimPlan(input: PlanInput, hash: string, t0: number, lessWalk: boolean): Promise<Plan> {
  const c = input.concert;
  // 자가용·택시로 집에서 출발하면 출발지 좌표를 카카오로 찾아 첫 장소까지 운전 시간을 넣는다
  let originLL: { lat: number; lng: number } | null = null;
  if (input.transport.mode !== "train" && input.transport.origin.trim() && kakaoConfigured()) {
    const hit = await geocode(input.transport.origin.trim()).catch(() => null);
    if (hit) originLL = { lat: hit.lat, lng: hit.lng };
  }
  const skeleton = buildPilgrimPlan({ view: c, parent: input.parent, transport: input.transport, places: input.places, lessWalk, originLL });
  if (lessWalk) skeleton.less_walk = true;
  const fan = input.places.filter((p) => p.origin === "concertrip");
  const near = input.places.length - fan.length;
  const spots = skeleton.items.filter((i) => i.type === "photo").length;
  const trace: TraceStep[] = [
    { step: "① 입력 정리", detail: `${c.artist_display} 팬덤 스팟 여행 · ${c.city} · ${c.start_time} 출발 · 걷기 ${input.parent.walk === "30+" ? "많이" : input.parent.walk === "15-30" ? "적당히" : "여유롭게"} · 식사 ${input.parent.food.length ? input.parent.food.length + "가지 조건" : "상관없음"}` },
    { step: "② 팬덤 스팟 불러오기", detail: `콘서트립 팬덤 스팟 ${fan.length}곳${near ? ` + 근처 식당·카페 ${near}곳(카카오)` : ""}` },
    { step: "③ 동선 최적화(코드)", detail: `가까운 곳부터 ${spots}곳 순서 정하기 · 점심을 11:40에 가깝게 끼워 넣기 · 걷기 기준(${maxWalkFor(input.parent.walk)}분)을 넘는 구간은 택시` },
  ];
  let plan: Plan = skeleton;
  if (!aiEnabled()) trace.push({ step: "④ AI 문장", detail: "AI 키가 없어 기본 문장 사용" });
  else if (!(await budgetLeft()).ok) trace.push({ step: "④ AI 문장", detail: "예산 한도라 기본 문장 사용" });
  else {
    const cands = Object.fromEntries(skeleton.items.filter((i) => i.place_id).map((i) => [i.id, input.places.filter((p) => p.id === i.place_id)]));
    const refined = await refineWithAI(skeleton, input, cands);
    if (refined) plan = { ...refined, pilgrim: true };
    trace.push({ step: "④ AI 문장", detail: refined ? `${MODEL}가 장소는 그대로 두고 부모님용 안내 문장 작성` : "AI 응답 실패 → 기본 문장 사용" });
  }
  const v = validatePlan(plan, input.places);
  if (!v.ok) plan = skeleton;
  trace.push({ step: "⑤ 검증(코드)", detail: v.ok ? "목록 밖 장소·시각 겹침 검사 통과" : "검증 실패 → 기본 일정으로 대체" });
  trace.push({ step: "⑥ 완성", detail: `${((Date.now() - t0) / 1000).toFixed(1)}초 · 같은 입력이면 저장된 일정을 그대로 사용` });
  plan = annotateWhy({ ...plan, trace }, input);
  await setCachedPlan(hash, plan).catch(() => undefined);
  return plan;
}

async function refineWithAI(skeleton: Plan, input: PlanInput, candsOverride?: Record<string, Place[]>): Promise<Plan | null> {
  const cands = candsOverride ?? slotCandidates(skeleton, input);
  const maxWalk = maxWalkFor(input.parent.walk);
  const skel = skeleton.items.map((i) => ({
    id: i.id, start: i.start, end: i.end, type: i.type, optional: !!i.optional, draft_title: i.title, draft_text: i.parent_text,
    candidates: (cands[i.id] ?? []).map((p) => p.id),
  }));
  const usedIds = new Set(Object.values(cands).flat().map((p) => p.id));
  const system = input.concert.pilgrim
    ? `너는 트로트 가수의 성지(가수가 다녀간 식당·여행지)를 도는 부모님의 하루 여행 일정표에 안내 문장을 쓰는 도우미다. 공연은 없다. 각 칸의 장소는 이미 정해져 있으니 candidates의 그 장소를 그대로 고른다. 이동 수단(도보/택시)과 분은 draft_text에 있는 그대로 쓴다.\n\n${REFINE_RULES}`
    : `너는 트로트 공연에 가시는 부모님의 공연 날 일정표에 장소를 채우고 안내 문장을 쓰는 도우미다.\n\n${REFINE_RULES}`;
  const user = `INPUT\n${contextBlock(input)}\n\nSKELETON\n${JSON.stringify(skel)}\n\nPLACES(후보에 나온 곳만)\n${JSON.stringify(placesForPrompt(input.places.filter((p) => usedIds.has(p.id))))}\n\n모든 칸을 채워 JSON으로 답해 줘.`;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await claude().beta.messages.parse({
        model: MODEL,
        max_tokens: 6000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(RefineSchema) },
        system,
        messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\n이전 답이 검증에 실패했어: ${lastErr}` }],
      });
      await recordUsage("plan", MODEL, res.usage);
      if (res.stop_reason === "refusal" || !res.parsed_output) { lastErr = `stop_reason=${res.stop_reason}`; continue; }
      const out = res.parsed_output;
      const byId = new Map(out.items.map((x) => [x.id, x]));
      const errs: string[] = [];
      for (const it of skeleton.items) {
        const r = byId.get(it.id);
        if (!r) { errs.push(`${it.id} 빠짐`); continue; }
        if (r.place_id && !(cands[it.id] ?? []).some((p) => p.id === r.place_id)) errs.push(`${it.id}의 place_id ${r.place_id}는 후보에 없음`);
      }
      const seenPlace = new Map<string, string>();
      for (const it of skeleton.items) {
        const pid = byId.get(it.id)?.place_id;
        if (!pid || it.type === "arrive" || it.type === "return") continue;
        if (seenPlace.has(pid)) errs.push(`${pid}를 ${seenPlace.get(pid)}와 ${it.id}에 중복 사용`);
        seenPlace.set(pid, it.id);
      }
      if (errs.length) { lastErr = errs.slice(0, 5).join("; "); continue; }
      const places = new Map(input.places.map((p) => [p.id, p]));
      const items = skeleton.items.map((it) => {
        const r = byId.get(it.id)!;
        const p = r.place_id ? places.get(r.place_id) : undefined;
        let text = cleanNote(r.parent_text || it.parent_text);
        if (p && p.walk_min_from_venue != null && p.walk_min_from_venue > maxWalk && !/택시/.test(text)) text += " 걸어가기 멀어서 택시를 타세요.";
        return {
          ...it, // 시각·종류·optional은 코드 값 그대로
          place_id: p ? p.id : (cands[it.id]?.length ? null : it.place_id),
          walk_min: p && !input.concert.pilgrim ? p.walk_min_from_venue : it.walk_min,
          source: p ? p.source : it.place_id ? it.source : it.source,
          title: r.title || it.title,
          parent_text: text,
          done_label: r.done_label || it.done_label,
          kid_note: cleanNote(r.kid_note || it.kid_note),
        } as PlanItem;
      });
      return { ...skeleton, title: input.concert.pilgrim ? skeleton.title : out.title || skeleton.title, summary: out.summary || skeleton.summary, items, generated_by: "ai" };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  console.warn("[ai] refine 실패, 규칙 기반 일정 사용:", lastErr);
  return null;
}

// ---------- F11 남은 일정 재생성 ----------
// 시각은 규칙 엔진이 바꾼다(코드). "말로 하기"만 작은 모델로 이유를 분류한다.
export async function replan(
  plan: Plan, input: PlanInput, reason: ChangeReason, freeText: string, nowMin: number, done: Set<string>,
): Promise<ChangeResult> {
  let r = reason === "free" ? classifyReason(freeText) : reason;
  if (r === "free" && freeText && aiEnabled() && (await budgetLeft()).ok) {
    try {
      const res = await claude().beta.messages.parse({
        model: SMALL_MODEL,
        max_tokens: 300,
        output_config: { effort: "low", format: betaZodOutputFormat(z.object({ reason: z.enum(["leg_pain", "long_line", "late", "free"]) })) },
        system: "공연장에 계신 부모님이 일정을 바꾸고 싶다며 한 말을 분류한다. leg_pain: 힘들다·쉬고 싶다, long_line: 줄·대기가 길다, late: 늦어진다, free: 그 밖.",
        messages: [{ role: "user", content: freeText.slice(0, 300) }],
      });
      await recordUsage("replan", SMALL_MODEL, res.usage);
      if (res.parsed_output) r = res.parsed_output.reason;
    } catch (e) {
      console.warn("[ai] 이유 분류 실패:", e instanceof Error ? e.message : e);
    }
  }
  return rulesReplan(plan, input, r, nowMin, done);
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
  if (!aiEnabled() || !(await budgetLeft()).ok) return rulesAnswer(q, ctx);
  const { input, plan } = ctx;
  try {
    const res = await claude().beta.messages.parse({
      model: SMALL_MODEL,
      max_tokens: 1000,
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
    await recordUsage("chat", SMALL_MODEL, res.usage);
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
