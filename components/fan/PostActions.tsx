"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { uploadPhoto } from "@/lib/photo";

type C = { id: string; author_name: string; body: string; ago: string; images?: string[] };

export default function PostActions({ id, likes, liked, comments, loggedIn, kakao }: { id: string; likes: number; liked: boolean; comments: C[]; loggedIn: boolean; kakao: boolean }) {
  const [n, setN] = useState(likes);
  const [on, setOn] = useState(liked);
  const [list, setList] = useState(comments);
  const [text, setText] = useState("");
  const [pics, setPics] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const loginHref = `/api/auth/kakao?next=${encodeURIComponent(`/fan/post/${id}`)}`;
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  async function report(reason: string) {
    if (!loggedIn) { setErr("로그인하면 신고할 수 있어요"); setReporting(false); return; }
    try { await postJSON(`/api/community/${id}`, { action: "report", body: reason }); setReported(true); }
    catch (x) { setErr(x instanceof Error ? x.message : "신고하지 못했어요"); }
    setReporting(false);
  }
  return (
    <>
      <button className="bigbtn line" style={{ fontSize: 18, padding: 12, minHeight: 52, borderColor: on ? "#fa2d48" : undefined, color: on ? "#fa2d48" : undefined }} onClick={async () => {
        if (!loggedIn) { setErr("로그인하면 좋아요를 누를 수 있어요"); return; }
        const r = await postJSON<{ liked: boolean; delta: number }>(`/api/community/${id}`, { action: "like" });
        setOn(r.liked); setN((x) => Math.max(0, x + r.delta));
      }}>{on ? "♥" : "♡"} 좋아요 {n}</button>
      <span className="lab" style={{ margin: "6px 0 -4px" }}>댓글 {list.length}</span>
      {list.map((c) => (
        <div key={c.id} className="card" style={{ fontSize: 15.5, lineHeight: 1.5 }}>
          <b>{c.author_name}</b> <small style={{ color: "var(--sub)" }}>{c.ago}</small>
          {c.body && <><br />{c.body}</>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.images?.length ? <div className="cpics">{c.images.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="댓글 사진" /></a>)}</div> : null}
        </div>
      ))}
      {loggedIn ? (
        <form style={{ display: "flex", flexDirection: "column", gap: 6 }} onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          try { const r = await postJSON<{ comment: C }>(`/api/community/${id}`, { action: "comment", body: text, images: pics }); setList((l) => [...l, { ...r.comment, ago: "방금" }]); setText(""); setPics([]); }
          catch (x) { setErr(x instanceof Error ? x.message : "실패"); }
        }}>
          {pics.length > 0 && (
            <div className="cpics">{pics.map((u) => (
              <span key={u} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="올릴 사진" />
                <button type="button" aria-label="사진 빼기" onClick={() => setPics((l) => l.filter((x) => x !== u))} className="cpx">×</button>
              </span>
            ))}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {pics.length < 2 && (
              <label className="mini-btn" style={{ cursor: "pointer", padding: "0 12px", display: "flex", alignItems: "center" }} aria-label="댓글에 사진 붙이기">
                {uploading ? "…" : "📷"}
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  setUploading(true); setErr("");
                  try { const u = await uploadPhoto(f); setPics((l) => [...l, u].slice(0, 2)); }
                  catch (x) { setErr(x instanceof Error ? x.message : "사진을 올리지 못했어요"); }
                  setUploading(false);
                }} />
              </label>
            )}
            <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글을 남겨 주세요" maxLength={500} />
            <button className="mini-btn" style={{ padding: "0 14px" }} disabled={uploading}>등록</button>
          </div>
        </form>
      ) : <a className={kakao ? "kakao" : "ghost"} href={kakao ? loginHref : "/fan"} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>{kakao ? "카카오로 로그인하고 댓글 달기" : "로그인하고 댓글 달기"}</a>}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <div style={{ textAlign: "right" }}>
        {reported ? <small style={{ color: "var(--sub)" }}>신고했어요. 운영자가 확인할게요.</small>
          : !reporting ? <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setReporting(true)}>🚨 신고</button>
          : <span className="chips" style={{ justifyContent: "flex-end" }}>{["광고·스팸", "욕설·비방", "초상권·저작권", "기타"].map((r) => <button key={r} className="chip" style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => report(r)}>{r}</button>)}</span>}
      </div>
    </>
  );
}
