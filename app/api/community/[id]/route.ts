// POST /api/community/{id} — 댓글 달기 {action:"comment", body} · 좋아요 {action:"like"}
import { addFanComment, toggleFanLike } from "@/lib/db";
import { getFanUser } from "@/lib/fanauth";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getFanUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const b = await body<{ action?: string; body?: string }>(req);
  if (b.action === "like") return ok(await toggleFanLike(id, user.id));
  if (b.action === "comment") {
    const text = String(b.body ?? "").trim().slice(0, 500);
    if (!text) return bad("댓글을 써 주세요");
    return ok({ comment: await addFanComment({ post_id: id, author_id: user.id, author_name: user.name, body: text }) });
  }
  return bad("알 수 없는 요청이에요");
}
