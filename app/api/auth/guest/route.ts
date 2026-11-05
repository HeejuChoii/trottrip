// POST /api/auth/guest {name} — 카카오 로그인 설정 전·시연용: 닉네임만으로 팬 라운지 체험
import { randomBytes } from "crypto";
import { setFanUser } from "@/lib/fanauth";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request) {
  const { name } = await body<{ name?: string }>(req);
  const n = String(name ?? "").trim().slice(0, 20);
  if (n.length < 2) return bad("닉네임을 두 글자 이상 써 주세요");
  await setFanUser({ id: `guest:${randomBytes(8).toString("base64url")}`, name: n });
  return ok({ ok: true });
}
