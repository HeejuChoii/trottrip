import Link from "next/link";
import { notFound } from "next/navigation";
import HomeTabs from "@/components/HomeTabs";
import MeIcon from "@/components/fan/MeIcon";
import SiteFooter from "@/components/SiteFooter";
import ArtistAvatar from "@/components/fan/ArtistAvatar";
import LoginBar from "@/components/fan/LoginBar";
import PostCard from "@/components/fan/PostCard";
import WriteForm from "@/components/fan/WriteForm";
import { ALL_SLUG, artistBySlug, byNewest, mockPosts, POST_CATEGORIES, TALK_BOARD, talkArtist } from "@/lib/community";
import { listFanPosts } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";

// 가수별 게시판: 말머리로 거르기, 글쓰기
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  // "all"은 가수 상관없는 트롯 수다방 게시판
  const a = slug === ALL_SLUG ? TALK_BOARD : artistBySlug(slug);
  if (!a) notFound();
  const [user, posts, talk] = await Promise.all([getFanUser(), listFanPosts({ artist: slug, limit: 50 }), slug === ALL_SLUG ? Promise.resolve([]) : listFanPosts({ artist: ALL_SLUG, limit: 100 })]);
  // 가수 라운지에는 트롯 수다방 글 중 이 가수 이야기(이름·애칭이 나오는 글)도 함께
  const fromTalk = slug === ALL_SLUG ? [] : [...talk, ...mockPosts().filter((p) => p.artist === ALL_SLUG)].filter((p) => talkArtist(p) === slug);
  const all = [...posts, ...mockPosts().filter((p) => p.artist === slug), ...fromTalk].sort(byNewest);
  const list = c ? all.filter((p) => p.category === c) : all;
  return (
    <main className="shell with-tabs">
      <div className="top"><Link className="back" href="/fan">← 팬 라운지</Link><MeIcon /></div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <ArtistAvatar a={a} size={76} />
        <div><h1 className="h" style={{ margin: 0 }}>{a.name}</h1><p className="lead" style={{ margin: "4px 0 0" }}>{slug === ALL_SLUG ? "가수 상관없이 트롯 이야기" : a.fandom ? `${a.fandom} 라운지` : "팬 라운지"} · 글 {all.length}개</p></div>
      </div>
      <div className="chips">
        <Link href={`/fan/${slug}`} className="chip" aria-pressed={!c} style={{ textDecoration: "none" }}>전체</Link>
        {POST_CATEGORIES.map((k) => <Link key={k} href={`/fan/${slug}?c=${encodeURIComponent(k)}`} className="chip" aria-pressed={c === k} style={{ textDecoration: "none" }}>{k}</Link>)}
      </div>
      {user ? <WriteForm artist={slug} defaultCategory={(POST_CATEGORIES as readonly string[]).includes(c ?? "") ? c! : slug === ALL_SLUG ? "질문·투표" : "공연 후기"} /> : <LoginBar user={null} kakao={kakaoLoginReady()} next={`/fan/${slug}`} />}
      {list.map((p) => <PostCard key={p.id} p={p} showArtist={p.artist === ALL_SLUG} />)}
      {!list.length && <p className="note">아직 글이 없어요. 첫 글을 남겨 주세요!</p>}
      <SiteFooter />
      <HomeTabs />
    </main>
  );
}
