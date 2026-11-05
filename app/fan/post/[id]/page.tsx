import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import HomeTabs from "@/components/HomeTabs";
import MeIcon from "@/components/fan/MeIcon";
import SiteFooter from "@/components/SiteFooter";
import PollBox from "@/components/fan/PollBox";
import PostActions from "@/components/fan/PostActions";
import { artistBySlug, findMockPost, mockComments, mockKey, mockPublicFor, timeAgo, type FanPost } from "@/lib/community";
import { getFanPost, likedFanPosts, listFanComments, pollVotes } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<{ post: FanPost | null; key: string }> {
  const key = mockKey(id);
  return key ? { post: findMockPost(id), key } : { post: await getFanPost(id), key: id };
}

/** 링크 미리보기(카톡·문자): 글 제목과 첫 줄로 궁금하게, 이미지는 글 카드 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { post } = await load(id);
  if (!post || post.hidden) return { title: "팬 라운지 · 트롯트립" };
  const a = artistBySlug(post.artist);
  const where = a ? `${a.fandom || a.name} 라운지` : "트롯 수다방";
  const body = post.body.replace(/\s+/g, " ").trim();
  const desc = `${body.length > 60 ? `${body.slice(0, 58)}…` : body}${post.comments ? ` · 💬 댓글 ${post.comments}개` : ""}`;
  const image = `/api/og/post?id=${encodeURIComponent(post.id)}`;
  return {
    title: `${post.title} | ${where}`,
    description: desc,
    openGraph: { title: post.title, description: desc, siteName: `트롯트립 ${where}`, images: [{ url: image, width: 1200, height: 630 }], type: "article" },
    twitter: { card: "summary_large_image", title: post.title, description: desc, images: [image] },
  };
}

// 글 보기 + 좋아요 + 댓글
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 예전 "mock-N" 주소로 들어오면 지금 주소로 옮긴다
  if (/^mock-\d+$/.test(id) && mockKey(id)) permanentRedirect(`/fan/post/${mockPublicFor(id)}`);
  const { post, key } = await load(id);
  if (!post) notFound();
  const a = artistBySlug(post.artist);
  const [user, dbComments] = await Promise.all([getFanUser(), listFanComments(key)]);
  const liked = user ? (await likedFanPosts(user.id)).has(key) : false;
  const votes = post.poll ? await pollVotes(key, user?.id) : null;
  const comments = [...(post.mock ? mockComments(key) : []), ...dbComments];
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
