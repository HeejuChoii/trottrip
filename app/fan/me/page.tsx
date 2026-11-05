import Link from "next/link";
import HomeTabs from "@/components/HomeTabs";
import SiteFooter from "@/components/SiteFooter";
import LoginBar from "@/components/fan/LoginBar";
import NameForm from "@/components/fan/NameForm";
import PostCard from "@/components/fan/PostCard";
import { listMyFanPosts } from "@/lib/db";
import { getFanUser, kakaoLoginReady } from "@/lib/fanauth";

export const dynamic = "force-dynamic";
export const metadata = { title: "마이페이지 · 트롯트립", robots: { index: false, follow: false } };

// 팬 라운지 마이페이지: 닉네임 바꾸기 · 내가 쓴 글 · 로그아웃
export default async function Page() {
  const user = await getFanUser();
  const posts = user ? await listMyFanPosts(user.id) : [];
  return (
    <main className="shell with-tabs">
      <div className="top"><Link className="back" href="/fan">← 팬 라운지</Link></div>
      <h1 className="h">마이페이지</h1>
      {!user ? <LoginBar user={null} kakao={kakaoLoginReady()} next="/fan/me" /> : (
        <>
          <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--mintS)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--deep)" }}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.6 4.5-5.5 8-5.5s6.5 1.9 8 5.5" /></svg>
            </span>
            <span style={{ fontSize: 17, lineHeight: 1.5 }}><b>{user.name}</b><br /><small style={{ color: "var(--sub)" }}>{user.id.startsWith("kakao:") ? "카카오 로그인" : "닉네임으로 시작"} · 글 {posts.length}개</small></span>
          </div>
          <NameForm name={user.name} />
          <span className="lab" style={{ margin: "4px 0 -4px" }}>내가 쓴 글</span>
          {posts.map((p) => <PostCard key={p.id} p={p} showArtist />)}
          {!posts.length && <p className="note">아직 쓴 글이 없어요.</p>}
        </>
      )}
      <SiteFooter />
      <HomeTabs />
    </main>
  );
}
