// POST /api/admin/posters — 공연 포스터 이미지 주소 (공연 id 또는 가수 이름으로)
// action: list | import({text: JSON 배열}) | delete({key})
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { listConcerts, listPosters, setPosters } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";

const Item = z.object({
  concert_id: z.string().optional(),
  artist: z.string().optional(),
  poster: z.string().url().refine((u) => /^https:\/\//.test(u), "https 주소만 넣을 수 있어요"),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("운영자 로그인이 필요해요", 401);
  const b = await body<{ action?: string; text?: string; key?: string }>(req);
  try {
    if (b.action === "delete" && b.key) { await setPosters([{ key: b.key, url: null }]); return ok({ posters: await listPosters() }); }
    if (b.action === "import") {
      const raw = JSON.parse(String(b.text ?? "").trim().replace(/^```(json)?|```$/g, ""));
      const arr = Array.isArray(raw) ? raw : [raw];
      const ids = new Set((await listConcerts(false)).map((c) => c.id));
      const items: { key: string; url: string }[] = [];
      const skipped: string[] = [];
      for (const x of arr) {
        const r = Item.safeParse(x);
        const key = r.success ? (r.data.concert_id && ids.has(r.data.concert_id) ? r.data.concert_id : r.data.artist?.trim()) : undefined;
        if (r.success && key) items.push({ key, url: r.data.poster }); else skipped.push(JSON.stringify(x).slice(0, 60));
      }
      await setPosters(items);
      return ok({ saved: items.map((i) => i.key), skipped, posters: await listPosters() });
    }
    return ok({ posters: await listPosters() });
  } catch (e) {
    return bad(e instanceof Error ? `JSON을 확인해 주세요: ${e.message}` : "처리하지 못했어요");
  }
}
