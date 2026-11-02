// POST /api/trips — 일정 생성 (F5). 자녀 토큰과 부모님 토큰을 함께 만든다.
import { CreateTripSchema } from "@/lib/schemas";
import { createTrip, getConcert, getPlaces } from "@/lib/db";
import { generatePlan } from "@/lib/ai";
import { concertView, newToken } from "@/lib/trip";
import { expiryFor } from "@/lib/time";
import { bad, body, ok } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = CreateTripSchema.safeParse(await body(req));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
  const v = parsed.data;

  const concert = v.concert_id ? await getConcert(v.concert_id) : null;
  if (v.concert_id && !concert) return bad("공연을 찾을 수 없어요");
  const draft = {
    concert_id: concert?.id ?? null,
    custom_concert: concert ? null : v.custom_concert,
    parent_profile: v.parent_profile,
    prefs: v.prefs,
    transport: v.transport,
    seat: v.seat,
  };
  const places = concert ? await getPlaces(concert.id) : [];
  const view = concertView({ ...draft } as never, concert);

  try {
    const plan = await generatePlan({ concert: view, parent: v.parent_profile, prefs: v.prefs, transport: v.transport, seat: v.seat, places });
    const trip = await createTrip({
      ...draft,
      plan,
      plan_version: 1,
      parent_token: newToken(),
      kid_token: newToken(),
      kid_label: "딸",
      kid_name: "",
      kid_phone: "",
      src: v.src,
      marketing_opt_in: v.marketing_opt_in,
      expires_at: expiryFor(view.date),
    });
    return ok({ kid_token: trip.kid_token });
  } catch (e) {
    console.error("[trips] 생성 실패", e);
    return bad("일정을 만들지 못했어요. 입력을 확인하고 다시 눌러 주세요.", 500);
  }
}
