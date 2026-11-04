"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hhmmNow, postJSON } from "@/lib/client";
import { useSpeech } from "./useSpeech";

type Action = { type: "schedule"; item_id: string; label: string } | { type: "map"; place_id: string; label: string };
type Msg = { role: "parent" | "ai"; text: string; place_id?: string | null; needs_check?: boolean; emergency?: boolean; actions?: Action[] };
const CHIPS = ["화장실 어디야?", "버스 몇 시야?", "입구가 어디야?", "근처 쉴 곳"];

export default function ParentAsk({ token, kidH, history }: { token: string; kidH: string; history: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(history);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech((t) => ask(t));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "parent", text: q }]);
    setBusy(true);
    try {
      const r = await postJSON<{ answer: string; place_id: string | null; needs_check: boolean; emergency: boolean; actions?: Action[] }>(`/api/p/${token}/chat`, { q, now: hhmmNow() });
      setMsgs((m) => [...m, { role: "ai", text: r.answer, place_id: r.place_id, needs_check: r.needs_check, emergency: r.emergency, actions: r.actions ?? [] }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", text: e instanceof Error ? e.message : "잠시 후 다시 물어봐 주세요." }]);
    }
    setBusy(false);
  }

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 일정으로</Link><span style={{ fontSize: 14, color: "var(--sub)" }}>대화는 {kidH}도 볼 수 있어요</span></div>
      <h1 className="h" style={{ fontSize: 26 }}>무엇이든 물어보세요</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
        {msgs.length === 0 && <p className="hello">오늘 일정과 공연장 안내를 보고 답해 드려요.</p>}
        {msgs.map((m, i) => m.role === "parent"
          ? <div key={i} className="bub me">{m.text}</div>
          : (
            <div key={i} className={`bub ai ${m.emergency ? "sos" : ""}`}>
              {m.text}
              {m.actions && m.actions.length > 0 ? (
                <span style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {m.actions.map((a, j) => (
                    <Link key={j} className="actbtn" href={a.type === "map" ? `/p/${token}/map?place=${encodeURIComponent(a.place_id)}&route=1` : `/p/${token}?item=${encodeURIComponent(a.item_id)}`}>
                      {a.type === "map" ? "🧭 " : "📋 "}{a.label}
                    </Link>
                  ))}
                </span>
              ) : m.place_id ? <Link href={`/p/${token}/map?place=${encodeURIComponent(m.place_id)}&route=1`} className="actbtn" style={{ marginTop: 10 }}>🧭 지도에서 길찾기</Link> : null}
              {m.needs_check !== undefined && !m.emergency && <small>{m.needs_check ? "공지에 없는 내용이라 지어내지 않았어요" : "오늘 일정과 공연장 안내를 보고 답했어요"}</small>}
            </div>
          ))}
        {busy && <div className="bub ai">찾아보고 있어요…</div>}
        <div ref={endRef} />
      </div>
      <div className="qchips">{CHIPS.map((c) => <button key={c} onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
      {speech.supported && <button className={`mic ${speech.listening ? "on" : ""}`} onClick={() => speech.listening ? speech.stop() : speech.start()} disabled={busy}>{speech.listening ? "듣고 있어요… (누르면 끝)" : "🗣️ 말로 물어보기"}</button>}
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} style={{ display: "flex", gap: 8 }}>
        <input className="inp" style={{ fontSize: 18 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.supported ? "글로 물어보기" : "여기에 적어 주세요"} aria-label="질문" />
        <button className="mini-btn" style={{ fontSize: 17, padding: "0 14px" }} disabled={busy}>보내기</button>
      </form>
      <p className="note">몸이 불편하시면 바로 119에 전화하세요.</p>
    </main>
  );
}
