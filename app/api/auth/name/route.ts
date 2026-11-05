// POST /api/auth/name {name} — 팬 라운지 닉네임 바꾸기(마이페이지)
import { getFanUser, setFanUser } from "@/lib/fanauth";
import { renameFanAuthor } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request) {
  const user = await getFanUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const { name } = await body<{ name?: string }>(req);
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (n.length < 2) return bad("닉네임을 두 글자 이상 써 주세요");
  if (/운영자|관리자|트롯트립/.test(n)) return bad("쓸 수 없는 닉네임이에요");
  if (n === user.name) return ok({ name: n });
  await renameFanAuthor(user.id, n);
  await setFanUser({ ...user, name: n });
  return ok({ name: n });
}
