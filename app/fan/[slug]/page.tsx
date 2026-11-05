import Link from "next/link";
import { notFound } from "next/navigation";
import HomeTabs from "@/components/HomeTabs";
import SiteFooter from "@/components/SiteFooter";
import ArtistAvatar from "@/components/fan/ArtistAvatar";
import LoginBar from "@/components/fan/LoginBar";
import PostCard from "@/components/fan/PostCard";
import WriteForm from "@/components/fan/WriteForm";
import { artistBySlug, mockPosts, POST_CATEGORIES } from "@/lib/community";
import { listFanPosts } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";

// 가수별 게시판: 말머리로 거르기, 글쓰기
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const a = artistBySlug(slug);
  if (!a) notFound();
  const [user, posts] = await Promise.all([getFanUser(), listFanPosts({ artist: slug, limit: 50 })]);
  const all = [...posts, ...mockPosts().filter((p) => p.artist === slug)].sort((x, y) => y.created_at.localeCompare(x.created_at));
  const list = c ? all.filter((p) => p.category === c) : all;
  return (
    <main className="shell with-tabs">
      <div className="top"><Link className="back" href="/fan">← 팬 라운지</Link></div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <ArtistAvatar a={a} size={76} />
        <div><h1 className="h" style={{ margin: 0 }}>{a.name}</h1><p className="lead" style={{ margin: "4px 0 0" }}>{a.fandom ? `${a.fandom} 라운지` : "팬 라운지"} · 글 {all.length}개</p></div>
      </div>
      <div className="chips">
        <Link href={`/fan/${slug}`} className="chip" aria-pressed={!c} style={{ textDecoration: "none" }}>전체</Link>
        {POST_CATEGORIES.map((k) => <Link key={k} href={`/fan/${slug}?c=${encodeURIComponent(k)}`} className="chip" aria-pressed={c === k} style={{ textDecoration: "none" }}>{k}</Link>)}
      </div>
      {user ? <WriteForm artist={slug} defaultCategory={(POST_CATEGORIES as readonly string[]).includes(c ?? "") ? c! : "공연 후기"} /> : <LoginBar user={null} kakao={kakaoLoginReady()} next={`/fan/${slug}`} />}
      {list.map((p) => <PostCard key={p.id} p={p} />)}
      {!list.length && <p className="note">아직 글이 없어요. 첫 글을 남겨 주세요!</p>}
      <SiteFooter />
      <HomeTabs />
    </main>
  );
}
