// GET /api/cron/notice-check — Vercel Cron(매일)이 부른다. 공연 14일 전부터 웹에서 공지를 찾아 /admin에 제안으로 쌓는다.
import { addNoticeCheck, listConcerts, listNoticeChecks } from "@/lib/db";
import { findNoticeOnWeb } from "@/lib/notice-watch";
import { nowKST } from "@/lib/time";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const today = nowKST().date;
  const in14 = new Date(Date.parse(`${today}T00:00:00+09:00`) + 14 * 86400000).toISOString().slice(0, 10);
  const targets = (await listConcerts(true)).filter((c) => c.date >= today && c.date <= in14);
  const done: string[] = [];
  // 같은 날짜·장소의 공연(예: 25일·26일)은 하루에 한 번만 검색
  const seen = new Set<string>();
  for (const c of targets) {
    const key = `${c.title}|${c.venue_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const last = (await listNoticeChecks(c.id, 1))[0];
    if (last && Date.now() - Date.parse(last.created_at) < 20 * 3600_000) continue;
    try {
      const f = await findNoticeOnWeb(c);
      await addNoticeCheck(c.id, f as unknown as Record<string, unknown>);
      done.push(c.id);
    } catch (e) {
      await addNoticeCheck(c.id, { error: e instanceof Error ? e.message : String(e) }, "failed");
    }
  }
  return Response.json({ checked: done, targets: targets.map((c) => c.id) });
}
