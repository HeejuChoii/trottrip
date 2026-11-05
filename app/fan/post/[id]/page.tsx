import Link from "next/link";
import { notFound } from "next/navigation";
import HomeTabs from "@/components/HomeTabs";
import PostActions from "@/components/fan/PostActions";
import { artistBySlug, mockComments, mockPosts, timeAgo } from "@/lib/community";
import { getFanPost, likedFanPosts, listFanComments } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";

// 글 보기 + 좋아요 + 댓글
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = id.startsWith("mock-") ? mockPosts().find((p) => p.id === id) ?? null : await getFanPost(id);
  if (!post) notFound();
  const a = artistBySlug(post.artist);
  const [user, dbComments] = await Promise.all([getFanUser(), listFanComments(id)]);
  const liked = user ? (await likedFanPosts(user.id)).has(id) : false;
  const comments = [...(id.startsWith("mock-") ? mockComments(id) : []), ...dbComments];
  // 목데이터 글은 좋아요 수가 고정이라, 내가 누른 것만 더해 보여 준다
  const likes = post.likes + (post.mock && liked ? 1 : 0);
  return (
    <main className="shell with-tabs">
      <div className="top"><Link className="back" href={a ? `/fan/${a.slug}` : "/fan"}>← {a?.name ?? "팬"} 라운지</Link></div>
      <span className="tag pk" style={{ alignSelf: "flex-start" }}>{post.category}</span>
      <h1 className="h" style={{ fontSize: 22 }}>{post.title}</h1>
      <p className="lead" style={{ margin: 0 }}>{post.author_name} · {timeAgo(post.created_at)}</p>
      <div className="card" style={{ fontSize: 17, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{post.body}</div>
      <PostActions id={id} likes={likes} liked={liked} comments={comments.map((c) => ({ id: c.id, author_name: c.author_name, body: c.body, ago: timeAgo(c.created_at) }))} loggedIn={!!user} kakao={kakaoLoginReady()} />
      <HomeTabs />
    </main>
  );
}
