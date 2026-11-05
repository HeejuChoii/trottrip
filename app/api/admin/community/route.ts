// POST /api/admin/community — 팬 라운지 관리: list(신고 많은 순·숨긴 글 포함) | hide | show
import { isAdmin } from "@/lib/admin";
import { listFanPosts, setFanPostHidden } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request) {
  if (!(await isAdmin())) return bad("운영자 로그인이 필요해요", 401);
  const b = await body<{ action?: string; id?: string }>(req);
  if ((b.action === "hide" || b.action === "show") && b.id) await setFanPostHidden(b.id, b.action === "hide");
  const posts = await listFanPosts({ limit: 100, withHidden: true });
  posts.sort((x, y) => (y.reports ?? 0) - (x.reports ?? 0) || Number(!!y.hidden) - Number(!!x.hidden) || y.created_at.localeCompare(x.created_at));
  return ok({ posts: posts.slice(0, 60) });
}
