import Link from "next/link";
import Brand from "@/components/Brand";
import HomeTabs from "@/components/HomeTabs";
import SiteFooter from "@/components/SiteFooter";
import ArtistAvatar from "@/components/fan/ArtistAvatar";
import LoginBar from "@/components/fan/LoginBar";
import PostCard from "@/components/fan/PostCard";
import { FAN_ARTISTS, mockPosts } from "@/lib/community";
import { listFanPosts } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";
export const metadata = { title: "팬 라운지 · 트롯트립" };

// 팬 라운지: 가수 고르기 + 가수 상관없이 최근 글
export default async function Page({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login } = await searchParams;
  const [user, posts] = await Promise.all([getFanUser(), listFanPosts({ limit: 30 })]);
  const feed = [...posts, ...mockPosts()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  return (
    <main className="shell with-tabs">
      <div className="top"><Brand href="/" /><span style={{ fontSize: 14, color: "var(--sub)" }}>팬 라운지</span></div>
      <h1 className="h">우리 가수 팬들과<br />덕질 이야기 나눠요</h1>
      <p className="lead">공연 후기, 팬덤 스팟(성지순례) 여행, 스밍 인증까지</p>
      {login === "fail" && <p className="err">카카오 로그인에 실패했어요. 잠시 뒤 다시 해 주세요.</p>}
      <LoginBar user={user} kakao={kakaoLoginReady()} next="/fan" />
      <span className="lab" style={{ margin: "4px 0 -4px" }}>가수를 골라 주세요</span>
      <div className="agrid">
        {FAN_ARTISTS.map((a) => (
          <Link key={a.slug} href={`/fan/${a.slug}`}><ArtistAvatar a={a} size={68} />{a.name}</Link>
        ))}
      </div>
      <span className="lab" style={{ margin: "8px 0 -4px" }}>지금 팬들은요</span>
      {feed.map((p) => <PostCard key={p.id} p={p} showArtist />)}
      <SiteFooter />
      <HomeTabs />
    </main>
  );
}
