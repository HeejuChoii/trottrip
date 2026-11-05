"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hhmmNow, ls, postJSON } from "@/lib/client";
import { useSpeech } from "./useSpeech";

type Action = { type: "schedule"; item_id: string; label: string } | { type: "map"; place_id: string; label: string };
type Msg = { role: "parent" | "ai"; text: string; at?: string; place_id?: string | null; needs_check?: boolean; emergency?: boolean; actions?: Action[] };
function chips(mode: string, pilgrim: boolean): string[] {
  const ride = mode === "train" ? "기차 몇 시야?" : mode === "car" ? "다음 장소까지 얼마나 걸려?" : "버스 몇 시야?";
  return pilgrim ? ["다음엔 어디 가?", ride, "점심 어디서 먹어?", "근처 쉴 곳"] : ["화장실 어디야?", ride, "입구가 어디야?", "근처 쉴 곳"];
}

export default function ParentAsk({ token, kidH, history, mode = "fan_bus", pilgrim = false }: { token: string; kidH: string; history: Msg[]; mode?: string; pilgrim?: boolean }) {
  const CHIPS = chips(mode, pilgrim);
  // 부모님 화면에는 오늘(한국 시간) 나눈 대화만, '새로 묻기'를 누른 뒤의 대화만 보여 준다(기록은 자녀 화면에 남음)
  const [msgs, setMsgs] = useState<Msg[]>([]);
  useEffect(() => {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const cleared = ls.get(`tt_chat_clear_${token}`) ?? "";
    setMsgs(history.filter((m) => !m.at || (new Date(new Date(m.at).getTime() + 9 * 3600000).toISOString().slice(0, 10) === today && m.at > cleared)));
  }, [history, token]);
  function clearChat() {
    ls.set(`tt_chat_clear_${token}`, new Date().toISOString());
    setMsgs([]);
  }
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
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 안내장으로</Link>{msgs.length > 0 ? <button className="mini-btn" style={{ fontSize: 15, padding: "6px 12px" }} onClick={clearChat}>새로 묻기</button> : <span style={{ fontSize: 14, color: "var(--sub)" }}>대화는 {kidH}도 볼 수 있어요</span>}</div>
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
    </main>
  );
}
