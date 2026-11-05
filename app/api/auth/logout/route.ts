// POST /api/auth/logout — 팬 라운지 로그아웃
import { clearFanUser } from "@/lib/fanauth";
import { ok } from "@/lib/http";

export async function POST() {
  await clearFanUser();
  return ok({ ok: true });
}
