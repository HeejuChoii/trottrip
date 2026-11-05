import Link from "next/link";
import { notFound } from "next/navigation";
import HomeTabs from "@/components/HomeTabs";
import MeIcon from "@/components/fan/MeIcon";
import SiteFooter from "@/components/SiteFooter";
import PollBox from "@/components/fan/PollBox";
import PostActions from "@/components/fan/PostActions";
import { artistBySlug, mockComments, mockPosts, timeAgo } from "@/lib/community";
import { getFanPost, likedFanPosts, listFanComments, pollVotes } from "@/lib/db";
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
  const votes = post.poll ? await pollVotes(id, user?.id) : null;
  const comments = [...(id.startsWith("mock-") ? mockComments(id) : []), ...dbComments];
  // 목데이터 글은 좋아요 수가 고정이라, 내가 누른 것만 더해 보여 준다
  const likes = post.likes + (post.mock && liked ? 1 : 0);
  return (
    <main className="shell with-tabs">
      <div className="top"><Link className="back" href={a ? `/fan/${a.slug}` : "/fan"}>← {a ? `${a.name} 라운지` : "팬 라운지"}</Link><MeIcon /></div>
      <span className="tag pk" style={{ alignSelf: "flex-start" }}>{post.category}</span>
      <h1 className="h" style={{ fontSize: 22 }}>{post.title}</h1>
      <p className="lead" style={{ margin: 0 }}>{post.author_name} · {timeAgo(post.created_at)}</p>
      {post.hidden ? (
        <div className="card" style={{ fontSize: 16, color: "var(--sub)" }}>신고가 접수돼 운영자가 확인 중인 글이에요.</div>
      ) : (
        <>
          <div className="card" style={{ fontSize: 17, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{post.body}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(post.images ?? []).map((u) => <img key={u} src={u} alt="첨부 사진" style={{ width: "100%", borderRadius: 14, display: "block" }} />)}
          {post.poll && votes && <PollBox id={id} options={post.poll} votes={votes} loggedIn={!!user} />}
        </>
      )}
      <PostActions id={id} likes={likes} liked={liked} comments={comments.map((c) => ({ id: c.id, author_name: c.author_name, body: c.body, ago: timeAgo(c.created_at), images: c.images ?? [] }))} loggedIn={!!user} kakao={kakaoLoginReady()} />
      <SiteFooter />
      <HomeTabs />
    </main>
  );
}
