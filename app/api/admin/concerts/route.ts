// POST /api/admin/concerts — 공연 등록·수정 (F15)
import { isAdmin } from "@/lib/admin";
import { upsertConcert } from "@/lib/db";
import { ConcertAdminSchema } from "@/lib/schemas";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("로그인이 필요해요", 401);
  const parsed = ConcertAdminSchema.safeParse(await body(req));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return bad(`${i?.path.join(".")}: ${i?.message}`);
  }
  return ok({ concert: await upsertConcert(parsed.data) });
}
