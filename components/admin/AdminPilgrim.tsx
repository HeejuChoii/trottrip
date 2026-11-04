"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";

interface Spot { id: string; name: string; address: string; courses: string[]; lat: number | null; lng: number | null; url: string; rating: number | null; rating_count: number | null; evidence: number }

const FORMAT = `[{"id":"(성지면 id, 식당이면 생략)","name":"카카오맵 표기 이름","address":"도로명 주소","lat":37.5,"lng":127.0,"url":"https://place.map.kakao.com/...","rating":4.3,"review_count":120,"hours":"11:00-21:00","closed":["화"]}]`;

/** 브라우저에 연결된 Claude에게 붙여 넣을 요청문 */
function browserPrompt(spots: Spot[], venues: string[]): string {
  const miss = spots.filter((s) => s.lat == null || !s.url);
  return [
    "카카오맵(map.kakao.com)에서 아래 장소를 하나씩 검색해서 확인해 줘. 화면에서 보이는 값만 적고, 못 찾으면 빼 줘.",
    "",
    miss.length ? "① 트롯 가수 성지 (좌표·링크가 아직 없는 곳)" : "① 성지는 모두 좌표가 있어요",
    ...miss.map((s) => `- id=${s.id} · ${s.name} · ${s.address}`),
    "",
    venues.length ? `② 공연장 근처 음식점: ${venues.join(", ")} 각각 '공연장 이름 + 맛집'으로 검색해서 걸어서 10분 안쪽 식당 10곳씩 (카카오맵에 적힌 이름 그대로)` : "",
    "",
    "각 장소 상세 페이지에서: 정확한 이름, 도로명 주소, 평점(별점), 후기 수, 장소 링크(place.map.kakao.com/숫자), 영업시간(hours, 예: 11:00-21:00), 정기 휴무 요일(closed, 예: [\"화\"]). 폐업이면 빼 줘.",
    "좌표는 장소 링크를 열고 '공유 → 링크 복사' 또는 길찾기 URL에 나오는 위도·경도를 적어 줘. 모르면 lat/lng는 빼도 돼.",
    "",
    "결과는 설명 없이 아래 형식의 JSON 배열 하나로만 줘:",
    FORMAT,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

export default function AdminPilgrim({ venues }: { venues: string[] }) {
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [kakao, setKakao] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [text, setText] = useState("");

  async function run(action: string, extra: object = {}) {
    setBusy(action); setMsg("");
    try {
      const r = await postJSON<{ spots: Spot[]; kakao?: boolean; found?: number; miss?: string[]; matched?: string[]; unmatched?: string[]; skipped?: number }>("/api/admin/pilgrim", { action, ...extra });
      setSpots(r.spots);
      if (r.kakao !== undefined) setKakao(r.kakao);
      if (action === "geocode") setMsg(`좌표 ${r.found}곳을 찾았어요${r.miss?.length ? ` · 못 찾음: ${r.miss.join(", ")}` : ""}`);
      if (action === "import") setMsg(`넣음 ${r.matched?.length ?? 0}건${r.matched?.length ? `: ${r.matched.join(", ")}` : ""}${r.unmatched?.length ? ` · 못 맞춘 이름: ${r.unmatched.join(", ")}` : ""}${r.skipped ? ` · 형식 오류 ${r.skipped}건` : ""}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "실패"); }
    setBusy("");
  }

  const done = spots?.filter((s) => s.lat != null).length ?? 0;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>팬덤 성지 · 좌표 · 평점</b>
      <small style={{ color: "var(--sub)" }}>
        성지순례 코스의 성지 좌표·카카오맵 링크를 채우고, 브라우저로 확인한 평점을 넣어요. 평점은 공연장 근처 식당 고르기와 &quot;왜 여기?&quot; 문구(근처 한식 중 평점 1위)에 쓰여요.
      </small>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="mini-btn" disabled={!!busy} onClick={() => run("status")}>{busy === "status" ? "불러오는 중…" : "상태 보기"}</button>
        <button className="mini-btn" disabled={!!busy} onClick={() => run("geocode")}>{busy === "geocode" ? "찾는 중…" : "① 카카오로 성지 좌표 한 번에 찾기"}</button>
        {spots && <button className="mini-btn" onClick={async () => { await navigator.clipboard.writeText(browserPrompt(spots, venues)); setMsg("브라우저 Claude용 요청문을 복사했어요"); }}>② 브라우저 Claude 요청문 복사</button>}
      </div>
      <textarea className="inp" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={`③ 브라우저 Claude가 준 JSON을 붙여 넣으세요\n${FORMAT}`} style={{ fontSize: 13, fontFamily: "monospace" }} />
      <button className="mini-btn" style={{ alignSelf: "flex-start" }} disabled={!!busy || !text.trim()} onClick={() => run("import", { text })}>{busy === "import" ? "넣는 중…" : "붙여 넣은 값 넣기"}</button>
      {msg && <p className="note" style={{ textAlign: "left", margin: 0 }}>{msg}</p>}
      {spots && (
        <>
          <small>성지 {spots.length}곳 중 좌표 {done}곳 · 카카오 키 {kakao ? "있음" : "없음"}</small>
          <div className="tblwrap"><table>
            <thead><tr><th>성지</th><th>코스</th><th>좌표</th><th>카카오맵</th><th>평점</th><th>근거</th></tr></thead>
            <tbody>{spots.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b><br /><small>{s.address}</small></td>
                <td><small>{s.courses.join(", ")}</small></td>
                <td>{s.lat != null ? "✓" : <span className="err">없음</span>}</td>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">열기</a> : "-"}</td>
                <td className="n">{s.rating != null ? `${s.rating}${s.rating_count ? ` (${s.rating_count})` : ""}` : "-"}</td>
                <td className="n">{s.evidence}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
