import { checkPassword, clearAdminCookie, setAdminCookie } from "@/lib/admin";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request) {
  const { password } = await body<{ password?: string }>(req);
  if (!process.env.ADMIN_PASSWORD) return bad("ADMIN_PASSWORD 환경변수가 설정되지 않았어요", 500);
  if (!checkPassword(String(password ?? ""))) return bad("비밀번호가 맞지 않아요", 401);
  await setAdminCookie();
  return ok({ ok: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return ok({ ok: true });
}
