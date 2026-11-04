"use client";
import { useState } from "react";
import Link from "next/link";
import { hhmmNow, postJSON } from "@/lib/client";
import { useSpeech } from "./useSpeech";
import { BottomBar } from "./ParentHome";

type Result = { message: string; changes: { before: string | null; after: string | null }[] };

export default function ParentChange({ token, kidH, kidLabel, pilgrim }: { token: string; kidH: string; kidLabel: string; pilgrim?: boolean }) {
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const speech = useSpeech((t) => send("free", t));

  async function send(reason: string, t = "") {
    setBusy(reason); setErr("");
    try {
      setRes(await postJSON<Result>(`/api/p/${token}/change`, { reason, text: t, now: hhmmNow() }));
      scrollTo(0, document.body.scrollHeight);
    } catch (e) { setErr(e instanceof Error ? e.message : "잠시 후 다시 눌러 주세요"); }
    setBusy("");
  }

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 일정으로</Link></div>
      <h1 className="h">무슨 일이 있으세요?</h1>
      <button className="bigbtn pk" disabled={!!busy} onClick={() => send("leg_pain")}>{busy === "leg_pain" ? "바꾸는 중…" : "다리가 아파요"}</button>
      <button className="bigbtn line" disabled={!!busy} onClick={() => send("long_line")}>{busy === "long_line" ? "바꾸는 중…" : "줄이 너무 길어요"}</button>
      <button className="bigbtn line" disabled={!!busy} onClick={() => send("late")}>{busy === "late" ? "바꾸는 중…" : "조금 늦어질 것 같아요"}</button>
      {speech.supported && !typing
        ? <button className="bigbtn line" disabled={!!busy} onClick={() => speech.listening ? speech.stop() : speech.start()}>{speech.listening ? "듣고 있어요… (누르면 끝)" : "🗣️ 말로 하기"}</button>
        : null}
      {(typing || !speech.supported) && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send("free", text); }} style={{ display: "flex", gap: 8 }}>
          <input className="inp" style={{ fontSize: 18 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="글로 적어 주세요" aria-label="바꾸고 싶은 내용" />
          <button className="mini-btn" style={{ fontSize: 17, padding: "0 14px" }} disabled={!!busy}>보내기</button>
        </form>
      )}
      {speech.supported && !typing && <button className="linkbtn" onClick={() => setTyping(true)}>글로 적기</button>}
      {err && <p className="err" role="alert">{err}</p>}
      {res && (
        <>
          <div className="ai" aria-live="polite"><div className="k">이렇게 바꿨어요</div><p>{res.message}</p></div>
          {res.changes.length > 0 && (
            <div className="card chg">
              {res.changes.map((c, i) => (
                <div key={i}>{c.before && <s>{c.before}</s>}{c.before && c.after ? <br /> : null}{c.after && <b style={{ color: "var(--deep)" }}>{c.after}</b>}</div>
              ))}
            </div>
          )}
          {res.changes.length > 0 && <div className="kid"><div className="av">{kidLabel.slice(0, 2) || "자녀"}</div><div>{kidH}께도 바뀐 일정을 알려 드렸어요</div></div>}
          <Link className="bigbtn ok" href={`/p/${token}`}>바뀐 일정 보기</Link>
        </>
      )}
      <BottomBar token={token} pilgrim={pilgrim} />
    </main>
  );
}
