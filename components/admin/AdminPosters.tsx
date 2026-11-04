"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";

const FORMAT = `[{"concert_id":"cyp-kspo-1127","poster":"https://…/poster.jpg"},{"artist":"이찬원","poster":"https://…"}]`;

/** 브라우저 Claude에게 붙여 넣을 요청문 */
function prompt(concerts: { id: string; title: string; date: string; ticket_url: string | null }[]): string {
  return [
    "아래 트로트 공연의 공식 포스터 이미지 주소를 찾아 줘. 예매처(YES24·NOL 티켓·멜론티켓·티켓링크) 공연 상세 페이지의 포스터 이미지에서 '이미지 주소 복사'로 https 주소를 가져와 줘.",
    "공연 상세 페이지를 못 찾으면 그 가수의 최근 공식 공연 포스터로 artist만 적어 줘.",
    "",
    ...concerts.map((c) => `- concert_id=${c.id} · ${c.title} · ${c.date}${c.ticket_url ? ` · 예매처 ${c.ticket_url}` : ""}`),
    "",
    "결과는 설명 없이 아래 형식의 JSON 배열 하나로만 줘:",
    FORMAT,
  ].join("\n");
}

export default function AdminPosters({ concerts, initial }: { concerts: { id: string; title: string; date: string; artist: string; ticket_url: string | null }[]; initial: Record<string, string> }) {
  const [posters, setPosters] = useState(initial);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const missing = concerts.filter((c) => !posters[c.id] && !posters[c.artist]);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>공연 포스터</b>
      <small style={{ color: "var(--sub)" }}>공연 고르기·코스 카드·부모님 안내장 표지·자녀 일정에 보여요. 공연 id로 넣으면 그 공연만, 가수 이름으로 넣으면 그 가수의 모든 공연·팬덤 스팟 코스에 써요.</small>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(posters).map(([k, u]) => (
          <figure key={k} style={{ margin: 0, width: 84, fontSize: 11, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={k} referrerPolicy="no-referrer" style={{ width: 84, height: 112, objectFit: "cover", borderRadius: 8, background: "#eee" }} />
            <figcaption style={{ wordBreak: "break-all" }}>{k} <button className="mini-btn del" style={{ fontSize: 11, padding: "1px 5px" }} onClick={async () => { const r = await postJSON<{ posters: Record<string, string> }>("/api/admin/posters", { action: "delete", key: k }); setPosters(r.posters); }}>삭제</button></figcaption>
          </figure>
        ))}
        {!Object.keys(posters).length && <small>아직 포스터가 없어요.</small>}
      </div>
      <small>포스터가 없는 공연 {missing.length}개</small>
      {missing.length > 0 && <button className="mini-btn" style={{ alignSelf: "flex-start" }} onClick={async () => { await navigator.clipboard.writeText(prompt(missing)); setMsg("브라우저 Claude용 요청문을 복사했어요"); }}>① 브라우저 Claude 요청문 복사</button>}
      <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`② 받은 JSON을 붙여 넣으세요\n${FORMAT}`} style={{ fontSize: 13, fontFamily: "monospace" }} />
      <button className="mini-btn" style={{ alignSelf: "flex-start" }} disabled={busy || !text.trim()} onClick={async () => {
        setBusy(true); setMsg("");
        try {
          const r = await postJSON<{ saved: string[]; skipped: string[]; posters: Record<string, string> }>("/api/admin/posters", { action: "import", text });
          setPosters(r.posters); setText("");
          setMsg(`넣음 ${r.saved.length}건${r.skipped.length ? ` · 형식 오류 ${r.skipped.length}건` : ""}`);
        } catch (e) { setMsg(e instanceof Error ? e.message : "실패"); }
        setBusy(false);
      }}>{busy ? "넣는 중…" : "포스터 넣기"}</button>
      {msg && <p className="note" style={{ textAlign: "left", margin: 0 }}>{msg}</p>}
    </div>
  );
}
