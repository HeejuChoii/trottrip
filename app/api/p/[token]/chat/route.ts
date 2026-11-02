// POST /api/p/{token}/chat — 물어보기 챗봇 (F10)
// 순서: 응급 키워드 → Croche 챗봇 서버(AGENT_URL) → (없으면) Claude → 규칙 기반
import { addChat, addEvent, listChats, listEvents } from "@/lib/db";
import { answerQuestion, isEmergency, isStrongEmergency, rulesAnswer, unknownAnswer, type ChatContext } from "@/lib/ai";
import { agentEnabled, AgentLimitError, askAgent } from "@/lib/agent-client";
import { isExpired, loadTrip } from "@/lib/trip";
import { kidHonorific } from "@/lib/text";
import { isHHMM, nowKST, toHHMM, toMin } from "@/lib/time";
import { bad, body, ok } from "@/lib/http";

export const maxDuration = 60;
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
  await addChat(trip.id, "parent", q);
  const emergency = isEmergency(q);
  const nowMin = b.now && isHHMM(b.now) ? toMin(b.now) : nowKST().min;
  const desk = concert.info_desk_place_id ? places.find((p) => p.id === concert.info_desk_place_id) : places.find((p) => p.category === "info_desk");
  const ctx: ChatContext = {
    input, plan: trip.plan!, kidHonorific: kidHonorific(trip.kid_label), kidPhone: trip.kid_phone,
    infoDeskName: desk?.name ?? null, nowMin, history,
  };

  let answer: string;
  let place_id: string | null = null;
  let needs_check = false;
  let via = "rules";
  if (isStrongEmergency(q)) {
    answer = EMERGENCY + (trip.kid_phone ? ` ${ctx.kidHonorific} 번호는 ${trip.kid_phone}이에요.` : "");
    via = "emergency";
  } else if (agentEnabled()) {
    try {
      const events = await listEvents(trip.id);
      const done = new Set(events.filter((e) => (e.type === "done" || e.type === "boarded") && e.item_id).map((e) => e.item_id!));
      const r = await askAgent(loaded, q, toHHMM(nowMin), done, desk?.name ?? null);
      // 근거가 없다고 하면 정해진 문장(안내소 + 자녀 번호)으로 바꾼다
      answer = r.needs_check ? unknownAnswer(ctx) : r.text;
      place_id = r.place_id;
      needs_check = r.needs_check;
      via = "croche";
    } catch (e) {
      if (e instanceof AgentLimitError) { answer = e.message; via = "limit"; }
      else {
        console.warn("[chat] croche 실패, 규칙 기반으로 대신함:", e instanceof Error ? e.message : e);
        const r = rulesAnswer(q, ctx);
        answer = r.answer; place_id = r.place_id; needs_check = r.needs_check;
      }
    }
  } else {
    const r = await answerQuestion(q, ctx);
    answer = r.answer; place_id = r.place_id; needs_check = r.needs_check;
    via = "claude_or_rules";
  }
  if (emergency && !answer.startsWith("119")) answer = `${EMERGENCY} ${answer}`;
  await addChat(trip.id, "ai", answer);
  await addEvent(trip.id, "chat", null, { q, needs_check, emergency, via });
  return ok({ answer, place_id, needs_check, emergency });
}
