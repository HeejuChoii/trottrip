"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";

type C = { id: string; author_name: string; body: string; ago: string };

export default function PostActions({ id, likes, liked, comments, loggedIn, kakao }: { id: string; likes: number; liked: boolean; comments: C[]; loggedIn: boolean; kakao: boolean }) {
  const [n, setN] = useState(likes);
  const [on, setOn] = useState(liked);
  const [list, setList] = useState(comments);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const loginHref = `/api/auth/kakao?next=${encodeURIComponent(`/fan/post/${id}`)}`;
  return (
    <>
      <button className="bigbtn line" style={{ fontSize: 18, padding: 12, minHeight: 52, borderColor: on ? "#fa2d48" : undefined, color: on ? "#fa2d48" : undefined }} onClick={async () => {
        if (!loggedIn) { setErr("로그인하면 좋아요를 누를 수 있어요"); return; }
        const r = await postJSON<{ liked: boolean; delta: number }>(`/api/community/${id}`, { action: "like" });
        setOn(r.liked); setN((x) => Math.max(0, x + r.delta));
      }}>{on ? "♥" : "♡"} 좋아요 {n}</button>
      <span className="lab" style={{ margin: "6px 0 -4px" }}>댓글 {list.length}</span>
      {list.map((c) => <div key={c.id} className="card" style={{ fontSize: 15.5, lineHeight: 1.5 }}><b>{c.author_name}</b> <small style={{ color: "var(--sub)" }}>{c.ago}</small><br />{c.body}</div>)}
      {loggedIn ? (
        <form style={{ display: "flex", gap: 8 }} onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          try { const r = await postJSON<{ comment: { id: string; author_name: string; body: string } }>(`/api/community/${id}`, { action: "comment", body: text }); setList((l) => [...l, { ...r.comment, ago: "방금" }]); setText(""); }
          catch (x) { setErr(x instanceof Error ? x.message : "실패"); }
        }}>
          <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="따뜻한 댓글을 남겨 주세요" maxLength={500} />
          <button className="mini-btn" style={{ padding: "0 14px" }}>등록</button>
        </form>
      ) : <a className={kakao ? "kakao" : "ghost"} href={kakao ? loginHref : "/fan"} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>{kakao ? "카카오로 로그인하고 댓글 달기" : "로그인하고 댓글 달기"}</a>}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
    </>
  );
}
