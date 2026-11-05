// POST /api/community/{id} — 댓글 달기 {action:"comment", body} · 좋아요 {action:"like"} · 투표 {action:"vote", option}
import { addFanComment, getFanPost, reportFanPost, toggleFanLike, votePoll } from "@/lib/db";
import { mockPosts, PHOTO_URL_RE } from "@/lib/community";
import { getFanUser } from "@/lib/fanauth";
import { bad, body, ok } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getFanUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const b = await body<{ action?: string; body?: string; option?: number; images?: unknown }>(req);
  if (b.action === "like") return ok(await toggleFanLike(id, user.id));
  if (b.action === "report") return ok(await reportFanPost(id, user.id, String(b.body ?? "").slice(0, 100)));
  if (b.action === "vote") {
    const post = id.startsWith("mock-") ? mockPosts().find((p) => p.id === id) : await getFanPost(id);
    const i = Number(b.option);
    if (!post?.poll || !Number.isInteger(i) || i < 0 || i >= post.poll.length) return bad("투표할 수 없는 글이에요");
    return ok(await votePoll(id, user.id, i));
  }
  if (b.action === "comment") {
    const text = String(b.body ?? "").trim().slice(0, 500);
    // 댓글 사진(스밍 인증 캡처 등) 최대 2장
    const images = (Array.isArray(b.images) ? b.images : []).filter((u): u is string => typeof u === "string" && u.length < 500 && PHOTO_URL_RE.test(u)).slice(0, 2);
    if (!text && !images.length) return bad("댓글을 써 주세요");
    return ok({ comment: await addFanComment({ post_id: id, author_id: user.id, author_name: user.name, body: text, ...(images.length ? { images } : {}) }) });
  }
  return bad("알 수 없는 요청이에요");
}
