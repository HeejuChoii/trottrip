"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";
import type { Concert } from "@/lib/types";

type Counts = Record<string, { count: number; synced_at: string | null }>;

const EMPTY: Concert = {
  id: "", concertrip_id: null, title: "", artist_display: "", color: "#087E72", city: "", venue_name: "", venue_key: null,
  venue_lat: null, venue_lng: null, date: "", start_time: "", est_end_time: null, notice_text: "",
  gate_map: {}, zone_image_url: null, official_map_url: null, info_desk_place_id: null, active: true,
};

function ConcertForm({ initial, onDone }: { initial: Concert; onDone: () => void }) {
  const [c, setC] = useState<Concert>(initial);
  const [gate, setGate] = useState(JSON.stringify(initial.gate_map, null, 0));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const S = (k: keyof Concert, v: unknown) => setC({ ...c, [k]: v });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const txt = (v: string) => (v.trim() === "" ? null : v.trim());

  async function save() {
    setErr("");
    let gate_map: Record<string, string>;
    try { gate_map = gate.trim() ? JSON.parse(gate) : {}; } catch { return setErr("구역→게이트 매핑은 JSON이어야 해요. 예: {\"A\":\"1번 입구\",\"B\":\"3번 입구\"}"); }
    setBusy(true);
    try { await postJSON("/api/admin/concerts", { ...c, gate_map }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : "저장 실패"); }
    setBusy(false);
  }

  const row = (label: string, el: React.ReactNode) => <label style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "center", fontSize: 14 }}><span>{label}</span>{el}</label>;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {row("id (영문)", <input className="inp sm" value={c.id} disabled={!!initial.id} onChange={(e) => S("id", e.target.value)} placeholder="psj-coex-1225" />)}
      {row("공연명", <input className="inp sm" value={c.title} onChange={(e) => S("title", e.target.value)} />)}
      {row("표시용 가수명", <input className="inp sm" value={c.artist_display} onChange={(e) => S("artist_display", e.target.value)} />)}
      {row("상징색", <input type="color" value={c.color} onChange={(e) => S("color", e.target.value)} />)}
      {row("도시", <input className="inp sm" value={c.city} onChange={(e) => S("city", e.target.value)} />)}
      {row("공연장", <input className="inp sm" value={c.venue_name} onChange={(e) => S("venue_name", e.target.value)} />)}
      {row("공연장 키", <input className="inp sm" value={c.venue_key ?? ""} onChange={(e) => S("venue_key", txt(e.target.value))} placeholder="coex, kintex-1 (같은 공연장끼리 장소 공유)" />)}
      {row("공연장 위도/경도", <span style={{ display: "flex", gap: 6 }}><input className="inp sm" value={c.venue_lat ?? ""} onChange={(e) => S("venue_lat", num(e.target.value))} /><input className="inp sm" value={c.venue_lng ?? ""} onChange={(e) => S("venue_lng", num(e.target.value))} /></span>)}
      {row("날짜", <input className="inp sm" type="date" value={c.date} onChange={(e) => S("date", e.target.value)} />)}
      {row("시작 / 종료 예상", <span style={{ display: "flex", gap: 6 }}><input className="inp sm" type="time" value={c.start_time} onChange={(e) => S("start_time", e.target.value)} /><input className="inp sm" type="time" value={c.est_end_time ?? ""} onChange={(e) => S("est_end_time", txt(e.target.value))} /></span>)}
      {row("콘서트립 공연 ID", <input className="inp sm" value={c.concertrip_id ?? ""} onChange={(e) => S("concertrip_id", txt(e.target.value))} />)}
      {row("공지 문구", <textarea className="inp" rows={2} value={c.notice_text} onChange={(e) => S("notice_text", e.target.value)} />)}
      {row("구역→게이트 (JSON)", <input className="inp sm" value={gate} onChange={(e) => setGate(e.target.value)} placeholder='{"A":"1번 입구","B":"3번 입구"}' />)}
      {row("구역도 이미지 URL", <input className="inp sm" value={c.zone_image_url ?? ""} onChange={(e) => S("zone_image_url", txt(e.target.value))} />)}
      {row("공식 배치도 링크", <input className="inp sm" value={c.official_map_url ?? ""} onChange={(e) => S("official_map_url", txt(e.target.value))} />)}
      {row("안내소 장소 id", <input className="inp sm" value={c.info_desk_place_id ?? ""} onChange={(e) => S("info_desk_place_id", txt(e.target.value))} placeholder="콘서트립 장소 id" />)}
      {row("노출", <input type="checkbox" checked={c.active} onChange={(e) => S("active", e.target.checked)} />)}
      {err && <p className="err">{err}</p>}
      <div style={{ display: "flex", gap: 8 }}><button className="mini-btn" onClick={onDone}>취소</button><button className="mini-btn" style={{ background: "var(--deep)", color: "#fff" }} disabled={busy} onClick={save}>저장</button></div>
    </div>
  );
}

function PlacesTools({ concert, count }: { concert: Concert; count?: { count: number; synced_at: string | null } }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: "sync" | "upload", json?: string) {
    setBusy(true); setMsg("");
    try {
      const r = await postJSON<{ count: number; skipped: number }>("/api/admin/places", { concert_id: concert.id, action, json });
      setMsg(`${r.count}곳 불러옴${r.skipped ? ` · 건너뜀 ${r.skipped}` : ""}`); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "실패"); }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span>{count?.count ?? 0}곳{count?.synced_at ? ` · ${new Date(count.synced_at).toLocaleString("ko-KR")}` : ""}</span>
      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="mini-btn" disabled={busy || !concert.concertrip_id} title={concert.concertrip_id ? "" : "콘서트립 공연 ID 필요"} onClick={() => run("sync")}>콘서트립 동기화</button>
        <label className="mini-btn" style={{ cursor: "pointer" }}>JSON 업로드
          <input type="file" accept="application/json,.json" className="sr" onChange={async (e) => { const f = e.target.files?.[0]; if (f) run("upload", await f.text()); e.target.value = ""; }} />
        </label>
      </span>
      {msg && <small>{msg}</small>}
    </div>
  );
}

export default function AdminConcerts({ concerts, counts }: { concerts: Concert[]; counts: Counts }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Concert | null>(null);
  const done = () => { setEdit(null); router.refresh(); };
  return (
    <>
      {edit && <ConcertForm initial={edit} onDone={done} />}
      {!edit && <button className="mini-btn" style={{ alignSelf: "flex-start" }} onClick={() => setEdit(EMPTY)}>+ 공연 등록</button>}
      <div className="tblwrap"><table>
        <thead><tr><th>공연</th><th>일시·장소</th><th>콘서트립 ID</th><th>게이트 매핑</th><th>장소 캐시</th><th></th></tr></thead>
        <tbody>
          {concerts.map((c) => (
            <tr key={c.id}>
              <td><span style={{ display: "inline-block", width: 12, height: 12, background: c.color, borderRadius: 3, marginRight: 6 }} />{c.title}{!c.active && " (숨김)"}<br /><small>{c.id}</small></td>
              <td>{c.date} {c.start_time}~{c.est_end_time ?? "?"}<br />{c.city} {c.venue_name}</td>
              <td>{c.concertrip_id ?? <small>미입력</small>}</td>
              <td><small>{Object.keys(c.gate_map).length ? JSON.stringify(c.gate_map) : "공지 대기"}</small></td>
              <td><PlacesTools concert={c} count={counts[c.id]} /></td>
              <td style={{ whiteSpace: "nowrap" }}><button className="mini-btn" onClick={() => setEdit(c)}>수정</button> <a className="mini-btn" href={`/admin/places/${c.id}`} style={{ textDecoration: "none" }}>장소 관리</a></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="note" style={{ textAlign: "left" }}>장소는 트롯트립에서 편집하지 않아요. 콘서트립에서 고친 뒤 동기화하거나, 콘서트립 관리 화면에서 내보낸 JSON을 올려 주세요. 형식 예시: data/sample-places-coex.json</p>
    </>
  );
}
