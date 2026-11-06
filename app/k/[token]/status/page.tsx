import Link from "next/link";
import { notFound } from "next/navigation";
import Brand from "@/components/Brand";
import Refresh from "@/components/Refresh";
import { getTripBy, listChats, listEvents } from "@/lib/db";
import { parentShort, eunNeun, iGa } from "@/lib/text";
import type { TripEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "진행 상황 · 트롯트립" };

function kst(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function kstDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// K6 자녀 진행 상황 (F13): 항목별 완료 시각, 일정 변경 기록, 부모님 질문과 답변. 위치 없음.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await getTripBy("kid_token", token);
  if (!trip?.plan) notFound();
  const [events, chats] = await Promise.all([listEvents(trip.id), listChats(trip.id)]);
  const doneAt = new Map<string, TripEvent>();
  for (const e of events) if ((e.type === "done" || e.type === "boarded") && e.item_id && !doneAt.has(e.item_id)) doneAt.set(e.item_id, e);
  const opened = events.find((e) => e.type === "parent_open" && e.payload?.owner !== true); // 자녀 본인이 미리 연 건 빼고
  const changes = events.filter((e) => e.type === "change");
  const fb = events.find((e) => e.type === "feedback");
  const who = parentShort(trip.parent_profile.honorific);

  // 질문-답변 짝
  const qa: { q: string; a: string; at: string }[] = [];
  for (let i = 0; i < chats.length; i++) {
    if (chats[i].role === "parent") qa.push({ q: chats[i].text, a: chats[i + 1]?.role === "ai" ? chats[i + 1].text : "", at: chats[i].created_at });
  }

  return (
    <main className="shell">
      <div className="top"><Link className="back" href={`/k/${token}`}>← 일정</Link><Refresh /></div>
      <h1 className="h" style={{ fontSize: 22 }}>{who}{eunNeun(who)} 지금</h1>
      {fb && <div className="stat" style={{ background: "var(--mintS)" }}><span>오늘 하루</span><b className="ok">{({ good: "😊 좋았어요", ok: "🙂 괜찮았어요", hard: "😥 조금 힘들었어요" } as Record<string, string>)[String(fb.payload?.answer)] ?? ""}</b></div>}
      <div className="stat"><span>안내장 열람</span>{opened ? <b className="ok">{kstDate(opened.created_at)} {kst(opened.created_at)} 열어 보셨어요 ✓</b> : <b className="wait">아직 안 여셨어요</b>}</div>
      {trip.plan.items.filter((i) => i.type !== "show").map((it) => {
        const e = doneAt.get(it.id);
        return (
          <div key={it.id} className="stat">
            <span>{it.title}</span>
            {e ? <b className="ok">{kst(e.created_at)} {it.done_label} ✓</b> : <b className="wait">{it.start} 예정</b>}
          </div>
        );
      })}
      {changes.length > 0 && <span className="lab" style={{ margin: "4px 0 -6px" }}>일정 변경</span>}
      {changes.map((c) => {
        const p = c.payload as { reason?: string; text?: string; message?: string; changes?: { before: string | null; after: string | null }[] };
        const reason = { leg_pain: "다리가 아파요", long_line: "줄이 너무 길어요", late: "조금 늦어질 것 같아요" }[p.reason ?? ""] ?? p.text ?? "";
        return (
          <div key={c.id} className="stat chg2">
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>{reason}</span><b style={{ color: "var(--pinkD)" }}>{kst(c.created_at)}</b></div>
            {p.message && <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{p.message}</span>}
            {(p.changes ?? []).map((x, i) => (
              <span key={i} style={{ fontSize: 13 }}>{x.before && <s style={{ color: "var(--sub)" }}>{x.before}</s>}{x.before && x.after ? " → " : ""}{x.after && <b>{x.after}</b>}</span>
            ))}
          </div>
        );
      })}
      <span className="lab" style={{ margin: "4px 0 -6px" }}>{who}{iGa(who)} 물어본 것</span>
      {qa.length === 0 && <p className="note" style={{ textAlign: "left", margin: 0 }}>아직 질문이 없어요.</p>}
      {qa.map((x, i) => (
        <div key={i} className="qa"><span className="q">Q. {x.q}</span> <small style={{ color: "var(--sub)" }}>{kst(x.at)}</small><br />{x.a}</div>
      ))}
      <p className="fine">위치는 보내지 않아요. 부모님이 누른 버튼과 질문만 보여 드려요. 새로고침하면 최신 상태가 보여요.</p>
      <div style={{ textAlign: "center" }}><Brand /></div>
    </main>
  );
}
