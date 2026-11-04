// POST /api/admin/eval — 평가 세트 10개를 배포된 일정 생성(AI 포함)으로 돌려 통과율을 본다
import { isAdmin } from "@/lib/admin";
import { addEvent, getConcert, getPlaces, listConcerts } from "@/lib/db";
import { generatePlan } from "@/lib/ai";
import { formatReport, runEval } from "@/lib/eval";
import { bad, body, ok } from "@/lib/http";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("로그인이 필요해요", 401);
  const b = await body<{ concert_id?: string }>(req);
  let concert = b.concert_id ? await getConcert(b.concert_id) : null;
  if (!concert) {
    for (const c of await listConcerts(false)) if ((await getPlaces(c.id)).length) { concert = c; break; }
  }
  if (!concert) return bad("장소가 등록된 공연이 없어요");
  const places = await getPlaces(concert.id);
  // 같은 입력은 캐시되므로 두 번째 호출(일관성 검사)은 비용이 들지 않는다
  const r = await runEval({ ...concert, custom: false }, places, (input) => generatePlan(input));
  await addEvent(null, "eval", null, { passed: r.passed, total: r.total, rate: r.rate, concert: concert.title, failed: r.results.filter((x) => !x.pass).map((x) => x.scenario) });
  return ok({ concert: concert.title, ...r, report: formatReport(r) });
}
