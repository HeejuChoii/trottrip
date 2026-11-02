"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";

export default function AdminLogin({ logout, configured = true }: { logout?: boolean; configured?: boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  if (logout) return <button className="mini-btn" onClick={async () => { await postJSON("/api/admin/login", {}, "DELETE"); router.refresh(); }}>로그아웃</button>;
  return (
    <main className="shell">
      <span className="brand">트롯<i>트립</i> 운영자</span>
      {!configured && <p className="err">ADMIN_PASSWORD 환경변수를 먼저 설정해 주세요.</p>}
      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        try { await postJSON("/api/admin/login", { password: pw }); router.refresh(); } catch (x) { setErr(x instanceof Error ? x.message : "실패"); }
      }}>
        <label className="lab" htmlFor="pw">비밀번호</label>
        <input id="pw" className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="cta">들어가기</button>
      </form>
    </main>
  );
}
