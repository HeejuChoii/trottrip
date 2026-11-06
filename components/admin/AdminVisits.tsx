import type { LinkVisitRow } from "@/lib/db";

const kst = (iso: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");

// 운영자: 부모님 안내장 링크를 누가(기기 단위) 몇 번 열었는지. 이름·IP 같은 개인정보는 없다
export default function AdminVisits({ rows }: { rows: LinkVisitRow[] }) {
  const total = rows.reduce((n, r) => n + r.visitors, 0);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>안내장 링크 방문 · 방문자 {total}명</b>
      <small style={{ color: "var(--sub)" }}>
        부모님 안내장 링크를 연 기기 수예요(같은 기기는 한 명, 30분 지나 다시 열면 방문 1회 더). 링크를 만든 자녀 본인 기기는 따로 빼서 셌어요.
        유입은 들어온 사이트(예: cafe.daum.net)와 앱(카카오톡·다음 앱 등)이고, 사이트가 안 넘어오는 앱에서 열면 &quot;직접·알 수 없음&quot;이에요.
        이번 기능을 넣기 전 방문은 유입·기기 정보가 없어요.
      </small>
      <div className="tblwrap"><table>
        <thead><tr><th>안내장</th><th>방문자</th><th>방문</th><th>자녀 본인</th><th>어디서 왔나</th><th>최근 방문</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.trip_id}>
              <td>
                <b>{r.title}</b><br /><small>{kst(r.created_at)} 만듦{r.kid_label ? ` · ${r.kid_label}` : ""}</small>
                {r.recent.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13 }}>방문 기록 {r.recent.length}건</summary>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>
                      {r.recent.map((v, i) => (
                        <li key={i}>{kst(v.at)} · {v.owner ? "자녀 본인" : `방문자 ${v.vid ? v.vid.slice(0, 4) : "?"}`}{v.first ? " (처음)" : ""} · {v.dev || "기기 모름"} · {v.from}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td className="n"><b>{r.visitors}</b></td>
              <td className="n">{r.visits}</td>
              <td className="n">{r.owner_visits}</td>
              <td><small>{r.sources.slice(0, 4).map((x) => `${x.name} ${x.n}`).join(", ") || "-"}</small></td>
              <td className="n">{kst(r.last_at)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6}>아직 안내장을 연 사람이 없어요</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
