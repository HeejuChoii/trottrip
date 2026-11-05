"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";

/** 마이페이지: 닉네임 바꾸기 · 로그아웃 */
export default function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const [v, setV] = useState(name);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault(); setErr(""); setMsg(""); setBusy(true);
        try { const r = await postJSON<{ name: string }>("/api/auth/name", { name: v }); setV(r.name); setMsg("닉네임을 바꿨어요. 지금까지 쓴 글·댓글에도 바뀐 이름으로 보여요."); router.refresh(); }
        catch (x) { setErr(x instanceof Error ? x.message : "바꾸지 못했어요"); }
        setBusy(false);
      }}>
        <b style={{ fontSize: 16 }}>닉네임</b>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" value={v} onChange={(e) => setV(e.target.value)} maxLength={20} placeholder="2~20자" aria-label="닉네임" />
          <button className="mini-btn" style={{ padding: "0 14px", whiteSpace: "nowrap" }} disabled={busy || v.trim() === name}>바꾸기</button>
        </div>
        {msg && <small style={{ color: "var(--deep)" }}>{msg}</small>}
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </form>
      <button className="linkbtn" onClick={async () => { await postJSON("/api/auth/logout", {}); router.push("/fan"); router.refresh(); }}>로그아웃</button>
    </>
  );
}
