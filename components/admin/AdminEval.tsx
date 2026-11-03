"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";

export default function AdminEval() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>평가 세트 (대표 시나리오 10개)</b>
      <small style={{ color: "var(--sub)" }}>목록 밖 장소, 입장 시각 지남, 도보 한도 초과, 식사 조건, 겹침, 같은 입력의 일관성을 자동 검사해요. AI 키가 있으면 AI 일정으로 돌려요(같은 입력은 캐시라 두 번째 호출은 무료).</small>
      <button className="mini-btn" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
        setBusy(true); setReport("");
        try { const r = await postJSON<{ concert: string; report: string }>("/api/admin/eval", {}); setReport(`${r.concert}\n${r.report}`); }
        catch (e) { setReport(e instanceof Error ? e.message : "실패"); }
        setBusy(false);
      }}>{busy ? "평가 중…" : "평가 실행"}</button>
      {report && <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>{report}</pre>}
    </div>
  );
}
