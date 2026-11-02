// POST /api/admin/places — 콘서트립 장소 동기화(캐시 갱신) 또는 JSON 업로드 (F15, PRD 5.2)
import { isAdmin } from "@/lib/admin";
import { getConcert, replacePlaces } from "@/lib/db";
import { fetchConcertPlaces, parsePlacesUpload } from "@/lib/concertrip";
import { bad, body, ok } from "@/lib/http";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("로그인이 필요해요", 401);
  const b = await body<{ concert_id?: string; action?: "sync" | "upload"; json?: string }>(req);
  const concert = b.concert_id ? await getConcert(b.concert_id) : null;
  if (!concert) return bad("공연을 찾을 수 없어요", 404);
  try {
    let result;
    if (b.action === "sync") {
      if (!concert.concertrip_id) return bad("이 공연에 콘서트립 공연 ID가 없어요");
      result = await fetchConcertPlaces(concert.concertrip_id);
    } else {
      if (!b.json) return bad("JSON을 넣어 주세요");
      result = parsePlacesUpload(b.json, concert.concertrip_id ?? undefined);
    }
    if (!result.places.length) return bad(`불러온 장소가 없어요 (건너뜀 ${result.skipped}건). 필드 이름을 확인해 주세요.`);
    await replacePlaces(concert.id, result.places);
    return ok({ count: result.places.length, skipped: result.skipped });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "동기화 실패", 502);
  }
}
