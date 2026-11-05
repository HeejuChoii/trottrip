"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";

/** 카카오로 시작하기 / (설정 전·시연용) 닉네임으로 시작하기 / 로그아웃 */
export default function LoginBar({ user, kakao, next }: { user: { name: string } | null; kakao: boolean; next: string }) {
  const router = useRouter();
  const [guest, setGuest] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  if (user) {
    return (
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16 }}>
        <span><b>{user.name}</b>님, 반가워요</span>
        <button className="mini-btn" onClick={async () => { await postJSON("/api/auth/logout", {}); router.refresh(); }}>로그아웃</button>
      </div>
    );
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ fontSize: 16 }}>글을 쓰고 댓글을 달려면 로그인해 주세요</b>
      {kakao && <a className="kakao" href={`/api/auth/kakao?next=${encodeURIComponent(next)}`} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>카카오로 3초 만에 시작하기</a>}
      {!guest
        ? <button className="linkbtn" onClick={() => setGuest(true)}>닉네임만으로 둘러보기</button>
        : (
          <form style={{ display: "flex", gap: 8 }} onSubmit={async (e) => {
            e.preventDefault(); setErr("");
            try { await postJSON("/api/auth/guest", { name }); router.refresh(); } catch (x) { setErr(x instanceof Error ? x.message : "실패"); }
          }}>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 영웅시대 대구맘" maxLength={20} />
            <button className="mini-btn" style={{ padding: "0 14px" }}>시작</button>
          </form>
        )}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <p className="fine" style={{ margin: 0, textAlign: "left" }}>카카오에서는 닉네임만 받아요. 전화번호·이메일은 받지 않아요.</p>
    </div>
  );
}
