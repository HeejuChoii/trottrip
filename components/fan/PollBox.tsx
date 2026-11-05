"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import type { PollOption } from "@/lib/community";

type Votes = { counts: Record<number, number>; mine: number | null };

/** 투표: 보기를 누르면 한 표(다시 누르면 바꾸기). 투표 전에는 결과를 가린다 */
export default function PollBox({ id, options, votes, loggedIn }: { id: string; options: PollOption[]; votes: Votes; loggedIn: boolean }) {
  const [v, setV] = useState(votes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = options.reduce((n, o, i) => n + o.votes + (v.counts[i] ?? 0), 0);
  const shown = v.mine != null;
  async function vote(i: number) {
    if (!loggedIn) { setErr("로그인하면 투표할 수 있어요"); return; }
    setBusy(true); setErr("");
    try { setV(await postJSON<Votes>(`/api/community/${id}`, { action: "vote", option: i })); }
    catch (x) { setErr(x instanceof Error ? x.message : "투표하지 못했어요"); }
    setBusy(false);
  }
  return (
    <div className="card poll">
      <b>🗳️ 투표 {shown ? `· ${total.toLocaleString()}명 참여` : "· 골라 주세요"}</b>
      {options.map((o, i) => {
        const n = o.votes + (v.counts[i] ?? 0);
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <button key={o.label} className="popt" aria-pressed={v.mine === i} disabled={busy} onClick={() => vote(i)}>
            {shown && <span className="pbar" style={{ width: `${pct}%` }} />}
            <span className="plabel">{v.mine === i ? "✓ " : ""}{o.label}</span>
            {shown && <span className="ppct">{pct}%</span>}
          </button>
        );
      })}
      <small style={{ color: "var(--sub)" }}>{shown ? "다른 보기를 누르면 바꿀 수 있어요. 이유는 댓글로 남겨 주세요!" : "투표하면 결과가 보여요"}</small>
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}
