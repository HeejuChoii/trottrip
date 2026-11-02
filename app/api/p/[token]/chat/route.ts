// POST /api/p/{token}/chat — 물어보기 챗봇 (F10)
import { addChat, addEvent, listChats } from "@/lib/db";
import { answerQuestion, isEmergency, isStrongEmergency } from "@/lib/ai";
import { isExpired, loadTrip } from "@/lib/trip";
import { kidHonorific } from "@/lib/text";
import { isHHMM, nowKST, toMin } from "@/lib/time";
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

  let answer: string;
  let place_id: string | null = null;
  let needs_check = false;
  if (isStrongEmergency(q)) {
    answer = EMERGENCY + (trip.kid_phone ? ` ${kidHonorific(trip.kid_label)} 번호는 ${trip.kid_phone}이에요.` : "");
  } else {
    const desk = concert.info_desk_place_id ? places.find((p) => p.id === concert.info_desk_place_id) : places.find((p) => p.category === "info_desk");
    const r = await answerQuestion(q, {
      input, plan: trip.plan!, kidHonorific: kidHonorific(trip.kid_label), kidPhone: trip.kid_phone,
      infoDeskName: desk?.name ?? null, nowMin: b.now && isHHMM(b.now) ? toMin(b.now) : nowKST().min, history,
    });
    answer = r.answer;
    place_id = r.place_id;
    needs_check = r.needs_check;
    if (emergency && !answer.startsWith("119")) answer = `${EMERGENCY} ${answer}`;
  }
  await addChat(trip.id, "ai", answer);
  await addEvent(trip.id, "chat", null, { q, needs_check, emergency });
  return ok({ answer, place_id, needs_check, emergency });
}
