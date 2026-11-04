// POST /api/p/{token}/chat — 물어보기 챗봇 (F10)
// 순서: 응급 키워드 → Croche 챗봇 서버(AGENT_URL) → (없으면) Claude → 규칙 기반
import { addChat, addEvent, listChats, listEvents } from "@/lib/db";
import { answerQuestion, isEmergency, isStrongEmergency, rulesAnswer, unknownAnswer, type ChatContext } from "@/lib/ai";
import { agentEnabled, AgentLimitError, askAgent, type ChatAction } from "@/lib/agent-client";
import type { LoadedTrip } from "@/lib/trip";
import { isExpired, loadTrip } from "@/lib/trip";
import { kidHonorific } from "@/lib/text";
import { isHHMM, nowKST, toHHMM, toMin } from "@/lib/time";
import { bad, body, ok } from "@/lib/http";

export const maxDuration = 60;
const CHAT_LIMIT = Number(process.env.CHAT_LIMIT_PER_TRIP ?? 30);

/** Croche를 못 쓸 때도 같은 버튼을 띄운다: 장소 → 지도, 일정 질문 → 지금/관련 항목 */
function fallbackActions(q: string, loaded: LoadedTrip, placeId: string | null, nowMin: number, done: Set<string>): ChatAction[] {
  const out: ChatAction[] = [];
  const items = loaded.trip.plan!.items;
  let item = null as (typeof items)[number] | null;
  if (/버스|귀가|집에/.test(q)) item = items.find((i) => i.type === "return") ?? null;
  else if (/입장|입구|들어가/.test(q)) item = items.find((i) => i.type === "enter") ?? null;
  else if (/밥|식당|점심|저녁/.test(q)) item = items.find((i) => i.type === "meal") ?? null;
  else if (/지금|다음|어디 가|뭐 해|남았/.test(q)) item = items.find((i) => !done.has(i.id) && toMin(i.end) > nowMin) ?? null;
  if (item) out.push({ type: "schedule", item_id: item.id, label: `일정에서 보기 · ${item.title.split(" · ")[0]}` });
  const pid = placeId ?? item?.place_id ?? null;
  const p = pid ? loaded.places.find((x) => x.id === pid) : undefined;
  if (p) out.push({ type: "map", place_id: p.id, label: `지도에서 길찾기 · ${p.name}` });
  return out;
}
const EMERGENCY = "119에 전화하시고 가까운 안전요원에게 알리세요.";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("parent_token", token);
  if (!loaded?.trip.plan || isExpired(loaded.trip)) return bad("안내장을 찾을 수 없어요", 404);
  const b = await body<{ q?: string; now?: string }>(req);
  const q = String(b.q ?? "").trim().slice(0, 300);
  if (!q) return bad("질문을 말씀해 주세요");
  const { trip, concert, places, input } = loaded;

  const history = await listChats(trip.id);
  // trip당 물어보기 30회 (PRD 9장 예산)
  if (history.filter((h) => h.role === "parent").length >= CHAT_LIMIT) {
    const kh = kidHonorific(trip.kid_label);
    return ok({ answer: `오늘은 물어보기를 많이 쓰셨어요. 가까운 안내소에 물어보시거나${trip.kid_phone ? ` ${kh}(${trip.kid_phone})께` : ` ${kh}께`} 전화해 주세요.`, place_id: null, needs_check: true, emergency: false, actions: [] });
  }
  await addChat(trip.id, "parent", q);
  const emergency = isEmergency(q);
  const nowMin = b.now && isHHMM(b.now) ? toMin(b.now) : nowKST().min;
  const desk = concert.info_desk_place_id ? places.find((p) => p.id === concert.info_desk_place_id) : places.find((p) => p.category === "info_desk");
  const events = await listEvents(trip.id);
  const done = new Set(events.filter((e) => (e.type === "done" || e.type === "boarded") && e.item_id).map((e) => e.item_id!));
  const ctx: ChatContext = {
    input, plan: trip.plan!, kidHonorific: kidHonorific(trip.kid_label), kidPhone: trip.kid_phone,
    infoDeskName: desk?.name ?? null, nowMin, history, done,
  };

  let answer: string;
  let place_id: string | null = null;
  let needs_check = false;
  let via = "rules";
  let actions: ChatAction[] = [];
  if (isStrongEmergency(q)) {
    answer = EMERGENCY + (trip.kid_phone ? ` ${ctx.kidHonorific} 번호는 ${trip.kid_phone}이에요.` : "");
    via = "emergency";
  } else if (agentEnabled()) {
    try {
      const r = await askAgent(loaded, q, toHHMM(nowMin), done, desk?.name ?? null);
      // 근거가 없다고 하면 정해진 문장(안내소 + 자녀 번호)으로 바꾼다
      answer = r.needs_check ? unknownAnswer(ctx) : r.text;
      place_id = r.place_id;
      needs_check = r.needs_check;
      actions = r.actions;
      via = "croche";
    } catch (e) {
      if (e instanceof AgentLimitError) { answer = e.message; via = "limit"; }
      else {
        console.warn("[chat] croche 실패, 규칙 기반으로 대신함:", e instanceof Error ? e.message : e);
        const r = rulesAnswer(q, ctx);
        answer = r.answer; place_id = r.place_id; needs_check = r.needs_check;
        if (!needs_check) actions = fallbackActions(q, loaded, place_id, nowMin, done);
      }
    }
  } else {
    const r = await answerQuestion(q, ctx);
    answer = r.answer; place_id = r.place_id; needs_check = r.needs_check;
    if (!needs_check) actions = fallbackActions(q, loaded, place_id, nowMin, done);
    via = "claude_or_rules";
  }
  if (emergency && !answer.startsWith("119")) answer = `${EMERGENCY} ${answer}`;
  await addChat(trip.id, "ai", answer);
  await addEvent(trip.id, "chat", null, { q, needs_check, emergency, via, actions: actions.map((a) => a.type) });
  return ok({ answer, place_id, needs_check, emergency, actions });
}
